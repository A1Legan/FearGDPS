import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchAudioFromUrl } from '@/lib/fetchAudio'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import {
  clientIp, rateLimit, checkSecret,
  dedupKey, lookupDuplicate, registerDedup,
  sniffAudio, checkStorageCap,
} from '@/lib/uploadGuard'

export const runtime = 'nodejs'

const MAX_BYTES = 12 * 1024 * 1024 // лимит на один трек — 12 МБ

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const name       = (form.get('name')       as string)?.trim()
    const artistName = (form.get('artistName') as string)?.trim() || 'Unknown'
    const gdIdStr    = (form.get('gdId')       as string)?.trim()
    const source     = (form.get('source')     as string) || 'upload'
    const directUrl  = (form.get('directUrl')  as string)?.trim()
    const file       = form.get('file') as File | null

    // --- защита 1: опциональный секрет (включается UPLOAD_REQUIRE_SECRET=1) ---
    const secretErr = checkSecret(req, form.get('secret') as string | null)
    if (secretErr) return NextResponse.json({ error: secretErr }, { status: 401 })

    // --- защита 2: rate-limit по IP (анти-DDoS / анти-спам) ---
    const ip = clientIp(req)
    const rl = await rateLimit(ip)
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Слишком много загрузок. Попробуй через ${Math.ceil((rl.retryAfterSec ?? 0) / 60)} мин.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec ?? 600) } },
      )
    }

    if (!prisma.gDSong) {
      return NextResponse.json({ error: 'Prisma-клиент не знает модель GDSong. npx prisma generate + rebuild.' }, { status: 500 })
    }

    let gdId: number
    if (gdIdStr) {
      gdId = parseInt(gdIdStr)
      if (isNaN(gdId) || gdId < 0) return NextResponse.json({ error: 'GD Song ID должен быть числом ≥ 0' }, { status: 400 })
    } else {
      // Наименьший свободный ID начиная с 1.
      const BASE = 1
      const taken = await prisma.gDSong.findMany({ where: { gdId: { gte: BASE } }, select: { gdId: true } })
      const used = new Set(taken.map(s => s.gdId))
      gdId = BASE
      while (used.has(gdId)) gdId++
    }

    const existing = await prisma.gDSong.findUnique({ where: { gdId } })
    if (existing) return NextResponse.json({ error: `Song ID ${gdId} уже занят: "${existing.name}"` }, { status: 409 })

    let buffer: Buffer | null = null
    let ext = 'mp3'
    let title = ''

    if (source === 'upload' && file) {
      buffer = Buffer.from(await file.arrayBuffer())
      ext    = file.name.split('.').pop()?.toLowerCase() || 'mp3'
      title  = file.name.replace(/\.[^.]+$/, '')
    } else if (directUrl) {
      try {
        const audio = await fetchAudioFromUrl(directUrl)
        buffer = audio.buffer; ext = audio.ext; title = audio.title ?? ''
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ error: `Не удалось получить аудио по ссылке: ${reason}` }, { status: 502 })
      }
    } else {
      return NextResponse.json({ error: 'Нужен файл или ссылка' }, { status: 400 })
    }

    if (buffer.length > MAX_BYTES) {
      return NextResponse.json({ error: `Трек слишком большой (${(buffer.length / 1_000_000).toFixed(1)} МБ). Максимум 12 МБ.` }, { status: 413 })
    }

    // --- защита 3: файл должен быть реальным аудио (проверка по сигнатуре, не по расширению) ---
    const sniffed = sniffAudio(buffer)
    if (!sniffed) {
      return NextResponse.json({ error: 'Файл не является аудио (mp3/ogg/wav/m4a).' }, { status: 415 })
    }
    ext = sniffed // используем реальный формат, а не присланное расширение

    // --- защита 4: дедупликация. Тот же файл/ссылка -> отдаём уже загруженный gdId ---
    const dKey = directUrl ? dedupKey({ sourceUrl: directUrl }) : dedupKey({ buffer })
    const dupGdId = await lookupDuplicate(dKey)
    if (dupGdId !== null) {
      const dup = await prisma.gDSong.findUnique({ where: { gdId: dupGdId } })
      if (dup) {
        return NextResponse.json({ ok: true, duplicate: true, song: { id: dup.id, gdId: dup.gdId, name: dup.name, downloadUrl: dup.downloadUrl } })
      }
      // запись в БД удалена — чистим устаревшую ссылку и грузим заново
      await registerDedup(dKey, gdId)
    }

    const songName = (name && name.trim()) || (title && title.trim()) || `Song ${gdId}`

    const gdServerUrl = process.env.GD_SERVER_URL
    if (!gdServerUrl) return NextResponse.json({ error: 'GD_SERVER_URL не задан в .env.local' }, { status: 500 })
    const safeName = `${gdId}_${songName.replace(/[^a-z0-9]/gi, '_')}.${ext}`
    try {
      const musicDir = join(process.cwd(), 'public', 'music')
      await mkdir(musicDir, { recursive: true })
      // --- защита 5: глобальный потолок хранилища (страховка от обхода IP-лимита) ---
      const capErr = await checkStorageCap(musicDir, buffer.length)
      if (capErr) return NextResponse.json({ error: capErr }, { status: 507 })
      await writeFile(join(musicDir, safeName), buffer)
    } catch (e) {
      console.error('[music/upload] не удалось записать файл на диск:', e)
      return NextResponse.json({ error: 'Не удалось сохранить файл на сервере' }, { status: 500 })
    }

    const downloadUrl = `${gdServerUrl}/music/${safeName}`
    const fileSizeMB  = (buffer.length / 1_000_000).toFixed(2)

    const song = await prisma.gDSong.create({
      data: { gdId, name: songName, artistName, downloadUrl, fileSize: fileSizeMB, driveFileId: null, source },
    })
    await registerDedup(dKey, gdId) // запоминаем хеш/ссылку -> gdId для будущих дублей
    return NextResponse.json({ ok: true, song: { id: song.id, gdId: song.gdId, name: song.name, downloadUrl: song.downloadUrl } })
  } catch (err) {
    // Текст исключения может содержать путь на диске или строку подключения,
    // поэтому наружу отдаём общее сообщение, подробности — только в лог.
    console.error('[music/upload] необработанная ошибка:', err)
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 })
  }
}
