import { createHash, timingSafeEqual } from 'crypto'
import { readFile, writeFile, mkdir, rename } from 'fs/promises'
import { join } from 'path'

/*
 * uploadGuard — защита /api/music/upload от абьюза.
 *  1) checkSecret — опциональный shared-secret. Страница /music публичная,
 *     поэтому по умолчанию ВЫКЛЮЧЕН. Включается переменной
 *     UPLOAD_REQUIRE_SECRET=1 — пригодится, если эндпоинт начнут заваливать.
 *  2) rateLimit   — лимит загрузок по IP (по умолчанию 3 / 10 мин, потом кулдаун)
 *  3) dedup       — одинаковый файл (sha256) или ссылка: отдаём существующий gdId
 *
 * Хранилище — JSON-файлы на диске рядом с проектом. Без внешних БД.
 * Рассчитано на один процесс (pm2 fork). Для cluster нужен Redis.
 */

const DATA_DIR = join(process.cwd(), '.guard')
const RATE_FILE = join(DATA_DIR, 'rate.json')
const DEDUP_FILE = join(DATA_DIR, 'dedup.json')

export const MAX_UPLOADS = Number(process.env.UPLOAD_MAX ?? 3)
export const WINDOW_MS = Number(process.env.UPLOAD_WINDOW_MS ?? 10 * 60 * 1000)

// Хранилище
async function readJson<T>(file: string): Promise<Record<string, T>> {
  try { return JSON.parse(await readFile(file, 'utf8')) } catch { return {} }
}
async function writeJson(file: string, obj: unknown) {
  await mkdir(DATA_DIR, { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(obj))
  await rename(tmp, file) // атомарно
}

/*
 * Очередь на файл. Без неё два одновременных запроса читают один и тот же
 * JSON и второй затирает правку первого — счётчик лимита «теряет» загрузки,
 * а индекс дедупликации теряет записи.
 */
const queues = new Map<string, Promise<unknown>>()

function withFileLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(file) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  queues.set(file, next.catch(() => {}))
  return next
}

// IP клиента
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

// 1) секрет
// Возвращает текст ошибки или null если ок. Клиент шлёт заголовок x-upload-secret
// ИЛИ поле secret в форме. Секрет хранится в .env.local как UPLOAD_SECRET.
export const REQUIRE_SECRET = process.env.UPLOAD_REQUIRE_SECRET === '1'

export function checkSecret(req: Request, formSecret?: string | null): string | null {
  if (!REQUIRE_SECRET) return null
  const expected = process.env.UPLOAD_SECRET
  if (!expected) return 'UPLOAD_SECRET не задан на сервере'
  const got = req.headers.get('x-upload-secret') || formSecret || ''
  // Сравниваем хеши постоянным по времени сравнением: длина хешей всегда
  // одинаковая, поэтому timingSafeEqual не бросит на разной длине ввода.
  const a = createHash('sha256').update(got).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b) ? null : 'Неверный или отсутствующий секрет загрузки'
}

// 2) rate-limit
export interface RateResult { ok: boolean; retryAfterSec?: number }
export async function rateLimit(ip: string): Promise<RateResult> {
  return withFileLock(RATE_FILE, async () => {
    const now = Date.now()
    const store = await readJson<number[]>(RATE_FILE)

    // Чистим протухшие записи целиком, иначе rate.json растёт вечно:
    // каждый новый IP оставлял в нём строку навсегда.
    for (const key of Object.keys(store)) {
      const fresh = (store[key] ?? []).filter(t => now - t < WINDOW_MS)
      if (fresh.length) store[key] = fresh
      else delete store[key]
    }

    const hits: number[] = store[ip] ?? []

    if (hits.length >= MAX_UPLOADS) {
      const retryAfterSec = Math.ceil((WINDOW_MS - (now - hits[0])) / 1000)
      await writeJson(RATE_FILE, store)
      return { ok: false, retryAfterSec }
    }

    hits.push(now)
    store[ip] = hits
    await writeJson(RATE_FILE, store)
    return { ok: true }
  })
}

// 3) дедупликация
function normalizeUrl(u: string): string {
  try {
    const url = new URL(u)
    url.hash = ''
    ;['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid']
      .forEach(p => url.searchParams.delete(p))
    return url.toString().toLowerCase()
  } catch { return u.trim().toLowerCase() }
}
export function hashBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}
export function dedupKey(opts: { buffer?: Buffer; sourceUrl?: string }): string {
  if (opts.sourceUrl) return 'url:' + normalizeUrl(opts.sourceUrl)
  if (opts.buffer) return 'sha:' + hashBuffer(opts.buffer)
  throw new Error('dedupKey: нужен buffer или sourceUrl')
}
/* ---------- проверка, что файл действительно аудио (по «магическим байтам») ---------- */
// Возвращает определённое расширение или null, если это не аудио.
export function sniffAudio(buf: Buffer): 'mp3' | 'ogg' | 'wav' | 'm4a' | null {
  if (buf.length < 12) return null
  // MP3: тег ID3 в начале
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return 'mp3'
  // MP3: фрейм-синхронизация 0xFF 0xEx/0xFx
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3'
  // OGG: "OggS"
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return 'ogg'
  // WAV: "RIFF"...."WAVE"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') return 'wav'
  // M4A/MP4: "....ftyp"
  if (buf.toString('ascii', 4, 8) === 'ftyp') return 'm4a'
  return null
}

/* ---------- глобальный потолок хранилища музыки ---------- */
export const MUSIC_MAX_BYTES = Number(process.env.MUSIC_MAX_BYTES ?? 2 * 1024 * 1024 * 1024) // 2 ГБ
export const MUSIC_MAX_FILES = Number(process.env.MUSIC_MAX_FILES ?? 5000)

// Считает текущий размер/число файлов в папке музыки.
export async function musicDirUsage(dir: string): Promise<{ bytes: number; files: number }> {
  const { readdir, stat } = await import('fs/promises')
  let bytes = 0, files = 0
  try {
    for (const name of await readdir(dir)) {
      try {
        const s = await stat(join(dir, name))
        if (s.isFile()) { bytes += s.size; files++ }
      } catch {}
    }
  } catch {}
  return { bytes, files }
}

// Возвращает текст ошибки, если добавление файла размером addBytes превысит потолок.
export async function checkStorageCap(dir: string, addBytes: number): Promise<string | null> {
  const { bytes, files } = await musicDirUsage(dir)
  if (files + 1 > MUSIC_MAX_FILES) return 'Достигнут лимит количества треков на сервере.'
  if (bytes + addBytes > MUSIC_MAX_BYTES) return 'Достигнут лимит места под музыку на сервере.'
  return null
}

// Возвращает существующий gdId или null
export async function lookupDuplicate(key: string): Promise<number | null> {
  const idx = await readJson<number>(DEDUP_FILE)
  return key in idx ? idx[key] : null
}
export async function registerDedup(key: string, gdId: number) {
  await withFileLock(DEDUP_FILE, async () => {
    const idx = await readJson<number>(DEDUP_FILE)
    idx[key] = gdId
    await writeJson(DEDUP_FILE, idx)
  })
}
