import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdtemp, readFile, rm, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { lookup } from 'dns/promises'
import { isIP } from 'net'

const execFileP = promisify(execFile)
const YTDLP     = process.env.YTDLP_PATH || 'yt-dlp'
const AUDIO_EXT = /\.(mp3|ogg|wav|m4a)(\?|$)/i

// Потолок на один трек. Держим синхронно с MAX_BYTES в роуте загрузки.
const MAX_BYTES    = 12 * 1024 * 1024
const MAX_REDIRECTS = 3

export interface FetchedAudio { buffer: Buffer; ext: string; title?: string }

/*
 * Эндпоинт загрузки публичный: ссылку присылает кто угодно, а скачивает её
 * наш сервер. Без проверки адреса это SSRF — через ссылку вида
 * http://127.0.0.1:5432 или http://169.254.169.254/ можно простукивать
 * внутреннюю сеть и метаданные VPS. Поэтому перед каждым запросом (и после
 * каждого редиректа) резолвим хост и отказываем, если адрес не публичный.
 */

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = parts
  if (a === 0) return true                        // 0.0.0.0/8
  if (a === 10) return true                       // частная сеть
  if (a === 127) return true                      // loopback
  if (a === 169 && b === 254) return true         // link-local, в т.ч. метаданные облака
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 192 && b === 0) return true           // 192.0.0.0/24 и 192.0.2.0/24
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true                       // multicast и зарезервированное
  return false
}

function isPrivateIp(ip: string): boolean {
  if (!ip.includes(':')) return isPrivateIPv4(ip)
  const v = ip.toLowerCase()
  if (v === '::' || v === '::1') return true
  if (v.startsWith('fe80') || v.startsWith('fc') || v.startsWith('fd')) return true
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIPv4(mapped[1])
  return false
}

// Проверяет, что ссылка ведёт на публичный адрес. Бросает понятную ошибку, если нет.
async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('Ссылка выглядит некорректно') }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Поддерживаются только ссылки http и https')
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error('Ссылка ведёт на локальный адрес')
  }

  let addresses: string[]
  if (isIP(host)) {
    addresses = [host]
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map(a => a.address)
    } catch {
      throw new Error('Не удалось определить адрес хоста по ссылке')
    }
  }
  if (addresses.length === 0) throw new Error('Не удалось определить адрес хоста по ссылке')
  if (addresses.some(isPrivateIp)) throw new Error('Ссылка ведёт на адрес во внутренней сети')

  return url
}

// Скачивает прямую ссылку на аудио, проверяя адрес на каждом редиректе
// и обрывая загрузку на превышении лимита размера.
async function downloadDirect(initialUrl: string): Promise<Buffer> {
  let current = initialUrl

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current)
    const res = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(60_000),
    })

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) throw new Error(`HTTP ${res.status} без заголовка Location`)
      current = new URL(location, current).toString()
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} при скачивании файла`)

    const declared = Number(res.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      throw new Error('Файл по ссылке больше 12 МБ')
    }

    if (!res.body) throw new Error('Пустой ответ при скачивании файла')

    // Читаем потоком, чтобы соврамший content-length не съел память сервера.
    const chunks: Buffer[] = []
    let total = 0
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => {})
        throw new Error('Файл по ссылке больше 12 МБ')
      }
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks)
  }

  throw new Error('Слишком много редиректов по ссылке')
}

export async function fetchAudioFromUrl(url: string): Promise<FetchedAudio> {
  const parsed = await assertPublicUrl(url)

  const direct = url.match(AUDIO_EXT)
  if (direct) {
    const buffer = await downloadDirect(url)
    const base = decodeURIComponent(parsed.pathname.split('/').pop() || '').replace(/\.[^.]+$/, '')
    return { buffer, ext: direct[1].toLowerCase(), title: base || undefined }
  }

  const dir = await mkdtemp(join(tmpdir(), 'gdsong-'))
  try {
    await execFileP(YTDLP, [
      '-x', '--audio-format', 'mp3', '--audio-quality', '0',
      '--no-playlist', '--max-filesize', '12M',
      // Начальный хост уже проверен assertPublicUrl. Дальше по CDN ходит сам
      // yt-dlp: ему мы ограничиваем размер и время, а TLS не ослабляем.
      '--referer', parsed.origin,
      '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      '-o', join(dir, '%(title)s.%(ext)s'),
      '--', url,
    ], { timeout: 180_000, maxBuffer: 16 * 1024 * 1024 })

    const files = await readdir(dir)
    const mp3   = files.find(f => f.toLowerCase().endsWith('.mp3'))
    if (!mp3) throw new Error('yt-dlp не создал mp3 (ссылка не поддерживается, файл больше 12 МБ или нужны cookies)')
    return { buffer: await readFile(join(dir, mp3)), ext: 'mp3', title: mp3.replace(/\.mp3$/i, '') }
  } catch (e) {
    const err = e as { code?: string; stderr?: string; message?: string }
    if (err?.code === 'ENOENT') throw new Error('yt-dlp не установлен на сервере (нужны yt-dlp и ffmpeg)')
    const detail = (err?.stderr || err?.message || String(e)).toString().split('\n').filter(Boolean).slice(-2).join(' ')
    throw new Error(detail || 'yt-dlp не смог скачать аудио')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
