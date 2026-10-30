import { prisma } from './prisma'

// Официальные треки GD 2.2 (audioTrack 0-21)
// На GDPS GD не использует встроенный кэш треков — ищет метаданные
// в секции songs ответа getLevels. Поэтому отдаём их явно.
export const GD_OFFICIAL_SONGS: Record<number, [string, string]> = {
  0:  ['Stereo Madness',           'ForeverBound'],
  1:  ['Back On Track',            'DJVI'],
  2:  ['Polargeist',               'Step'],
  3:  ['Dry Out',                  'DJVI'],
  4:  ['Base After Base',          'DJVI'],
  5:  ['Cant Let Go',              'DJVI'],
  6:  ['Jumper',                   'Waterflame'],
  7:  ['Time Machine',             'Waterflame'],
  8:  ['Cycles',                   'DJVI'],
  9:  ['xStep',                    'DJVI'],
  10: ['Clutterfunk',              'Waterflame'],
  11: ['Theory of Everything',     'DJ-Nate'],
  12: ['Electroman Adventures',    'Waterflame'],
  13: ['Clubstep',                 'DJ-Nate'],
  14: ['Electrodynamix',           'DJ-Nate'],
  15: ['Hexagon Force',            'Waterflame'],
  16: ['Blast Processing',         'Waterflame'],
  17: ['Theory of Everything 2',   'DJ-Nate'],
  18: ['Geometrical Dominator',    'Waterflame'],
  19: ['Deadlocked',               'F-777'],
  20: ['Fingerdash',               'MdK'],
  21: ['Dash',                     'Moving Madness'],
}

// KV-строка метаданных песни для GD-протокола
// Формат: 1~|~id~|~2~|~name~|~3~|~artistId~|~4~|~artist~|~5~|~size~|~6~|~homepage~|~10~|~dlURL~|~7~|~~|~8~|~0
export function makeSongKV(
  id: number, name: string, artistId: number, artist: string,
  size: string, homepage: string, dlURL: string,
): string {
  const link     = dlURL ? encodeURIComponent(dlURL) : ''
  const verified = dlURL ? 1 : 0
  return `1~|~${id}~|~2~|~${name}~|~3~|~${artistId}~|~4~|~${artist}~|~5~|~${size}~|~6~|~${homepage}~|~10~|~${link}~|~7~|~~|~8~|~${verified}~|~9~|~0`
}

// Метаданные песни для секции songs в getLevels / download
export async function getSongStr(songId: number): Promise<string> {
  if (songId < 0) return ''

  // Сначала наша БД (загруженные через сайт треки)
  try {
    const dbSong = await (prisma as any).gDSong?.findUnique?.({ where: { gdId: songId } })
    if (dbSong) {
      return makeSongKV(dbSong.gdId, dbSong.name, dbSong.artistId ?? 0, dbSong.artistName, dbSong.fileSize ?? '0.00', '', dbSong.downloadUrl)
    }
  } catch { /* gDSong может отсутствовать в схеме */ }

  // Официальные треки: возвращаем метаданные без URL (GD покажет название)
  if (GD_OFFICIAL_SONGS[songId] !== undefined) {
    const [name, artist] = GD_OFFICIAL_SONGS[songId]
    return makeSongKV(songId, name, 0, artist, '0.00', '', '')
  }

  // Newgrounds отключён — используем только самостоятельно загруженную музыку.
  // Если трека нет в нашей БД и это не официальный трек — считаем его не найденным.
  return ''
}
