import { prisma } from './prisma'
import { GD_OFFICIAL_SONGS } from './songs'
import { log } from './logger'

// Уведомление Discord-бота об оценке уровня
// Fire-and-forget: если бот выключен/недоступен — оценка всё равно
// проходит, ошибка только логируется. Бот и GDPS на одном хосте,
// поэтому по умолчанию бьём на http://127.0.0.1:<порт>/rate.
//
// .env:
//   BOT_RATES_URL     (напр. http://127.0.0.1:3055/rate)
//   BOT_RATES_SECRET  (тот же секрет, что в config.json бота)

const BOT_RATES_URL    = process.env.BOT_RATES_URL    || 'http://127.0.0.1:3055/rate'
const BOT_RATES_SECRET = process.env.BOT_RATES_SECRET || ''

type RateType = 'stars' | 'demon' | 'quality'

// Резолвим название трека: сначала кастомный (customSongId),
// потом официальный (songId).
async function resolveTrack(songId: number, customSongId: number): Promise<{ track?: string; artist?: string }> {
  if (customSongId > 0) {
    try {
      const dbSong = await (prisma as any).gDSong?.findUnique?.({ where: { gdId: customSongId } })
      if (dbSong) return { track: dbSong.name, artist: dbSong.artistName }
    } catch { /* gDSong может отсутствовать */ }
  }
  if (GD_OFFICIAL_SONGS[songId] !== undefined) {
    const [name, artist] = GD_OFFICIAL_SONGS[songId]
    return { track: name, artist }
  }
  return {}
}

// Единственная точка входа. Дособирает данные уровня/автора/трека
// из БД и шлёт их боту. Всё завёрнуто в try/catch — не бросает наружу.
export async function notifyRate(opts: {
  type: RateType
  levelID: number
  moderator: string
}): Promise<void> {
  try {
    const level = await prisma.gDLevel.findUnique({
      where: { id: opts.levelID },
      select: {
        id: true, name: true, stars: true, difficulty: true,
        demonDiff: true, isDemon: true, isEpic: true,
        songId: true, customSongId: true,
        profile: { select: { gdLogin: true } },
      },
    })
    if (!level) return

    const { track, artist } = await resolveTrack(level.songId, level.customSongId)

    const payload = {
      type: opts.type,
      levelId: level.id,
      levelName: level.name,
      author: level.profile?.gdLogin ?? '—',
      moderator: opts.moderator,
      stars: level.stars,
      difficulty: level.difficulty,
      demonDiff: level.demonDiff,
      isDemon: level.isDemon,
      isEpic: level.isEpic,
      track,
      artist,
    }

    await fetch(BOT_RATES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rate-secret': BOT_RATES_SECRET,
      },
      body: JSON.stringify(payload),
      // не ждём долго — событие второстепенное
      signal: AbortSignal.timeout(4000),
    })
  } catch (err) {
    log.warn('notifyRate', 'бот не ответил, оценка всё равно применена', { levelID: opts.levelID, err: (err as Error).message })
  }
}
