import { Context } from 'hono'
import { prisma } from '../lib/prisma'
import { uuidToGDId } from '../lib/crypto'
import { getSongStr } from '../lib/songs'
import { createHash } from 'crypto'
import { hitLimit, blockedResponse } from '../lib/rateLimit'
import { findProfile } from '../lib/gdHelpers'
import { calcCp } from './extras'
import { log } from '../lib/logger'

type Body = Record<string, string | File>

// XOR-шифр (ключ "26364") для паролей уровней
function xorCipher(str: string, key: string): string {
  return str.split('').map((c, i) =>
    String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
  ).join('')
}

// "0" → нельзя копировать, "1" → свободное копирование, остальное → XOR + base64url
function encodePassword(raw: string): string {
  const p = raw || '0'
  if (p === '0' || p === '1') return p
  return Buffer.from(xorCipher(p, '26364')).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_')
}

// Уровень → строка GD-протокола (для списка уровней)
function levelRow(level: any): string {
  const creatorId = uuidToGDId(level.profileId)
  const desc = level.description
    ? Buffer.from(level.description).toString('base64')
    : ''
  // key 8 = difficultyDenominator (10 if rated, 0 otherwise)
  // key 9 = difficultyNumerator  (0=N/A, 10=easy, 20=normal, 30=hard, 40=harder, 50=insane)
  // key 10 = downloads
  // key 12 = officialSong (stock GD track, 0 if custom song)
  // key 13 = gameVersion
  // key 14 = likes
  // key 15 = length (0-4)
  // key 19 = featureScore (0 = not featured)
  // key 35 = customSongId (Newgrounds ID, 0 if stock)
  return [
    1,  level.id,
    2,  level.name,
    3,  desc,
    5,  level.version,
    6,  creatorId,
    8,  level.stars > 0 ? 10 : 0,
    9,  level.difficulty,
    10, level.downloads,
    12, level.customSongId > 0 ? 0 : level.songId,
    13, 21,
    14, level.likes,
    15, level.length,
    17, level.isDemon ? 1 : 0,
    18, level.stars,
    19, level.isEpic > 0 ? 1 : 0,
    25, level.isAuto ? 1 : 0,
    27, encodePassword(level.password),
    28, 0,
    29, 0,
    30, 0,
    31, level.twoPlayer ? 1 : 0,
    35, level.customSongId > 0 ? level.customSongId : 0,
    36, level.extra || '',
    37, level.coins,
    38, level.verifiedCoins ? 1 : 0,
    39, level.requestedStars,
    40, 0,
    42, level.isEpic > 1 ? level.isEpic - 1 : 0,
    43, level.isDemon ? (level.demonDiff || 0) : 0,
    44, 0,   // значок гаунтлета: косметика, отдельный lookup не делаем
    45, level.objects,
    46, 0,
    47, 0,
  ].join(':')
}

export async function handleGetLevels(body: Body, c: Context) {
  const type  = parseInt(body.type as string) || 0
  const str   = (body.str as string) || ''
  const page  = parseInt(body.page as string) || 0
  const limit = 10

  // Запрос уровней гаунтлета: gauntlet=N в теле
  if (body.gauntlet !== undefined) {
    const gauntletId = parseInt(body.gauntlet as string)
    const gauntlet = await prisma.gDGauntlet.findUnique({ where: { id: gauntletId } })
    if (!gauntlet) { log.warn('getLevels', `гаунтлет ${gauntletId} не найден`); return c.text('-1') }
    const ids = gauntlet.levelIds.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
    if (ids.length === 0) { log.warn('getLevels', 'в гаунтлете нет уровней', { gauntletId }); return c.text('-1') }
    const levels = await prisma.gDLevel.findMany({ where: { id: { in: ids } }, include: { profile: true } })
    const sorted = ids.map(id => levels.find(l => l.id === id)).filter(Boolean) as any[]
    if (sorted.length === 0) return c.text('-1')
    const levelStrings = sorted.map(levelRow)
    const seen = new Set<string>()
    const creators: string[] = []
    for (const l of sorted) {
      if (!seen.has(l.profileId)) {
        seen.add(l.profileId)
        const numId = uuidToGDId(l.profileId)
        creators.push(`${numId}:${l.profile.gdLogin}:${numId}`)
      }
    }
    const hashInput    = sorted.map(l => `${String(l.id)[0]}${l.id % 10}${l.stars}${l.verifiedCoins ? 1 : 0}`).join('') + 'xI25fpAapCQg'
    const responseHash = createHash('sha1').update(hashInput).digest('hex')
    const allSongIds   = [...new Set(sorted.map((l: any) => l.customSongId > 0 ? l.customSongId : l.songId).filter((id: number) => id >= 0))]
    const songStrs     = await Promise.all(allSongIds.map(id => getSongStr(id as number)))
    const songsSection = songStrs.filter(Boolean).join('~|~')
    log('getLevels', 'выдан гаунтлет', { gauntletId, count: sorted.length })
    return c.text(`${levelStrings.join('|')}#${creators.join('|')}#${songsSection}#${sorted.length}:0:${limit}#${responseHash}`)
  }

  // История daily/weekly/event (сейф в игре): type 21=daily, 22=weekly, 23=event.
  // Отдаём только копии GDDailyLevel нужного типа, свежие первыми.
  if (type === 21 || type === 22 || type === 23) {
    const dailyType = type - 21
    const slots = await prisma.gDDailyLevel.findMany({ where: { type: dailyType, activatedAt: { not: null } }, orderBy: { activatedAt: 'desc' } })
    const total = slots.length
    const ids = slots.slice(page * limit, page * limit + limit).map(s => s.levelId)
    if (ids.length === 0) { log('getLevels', `safe type=${type} -> empty`); return c.text('-1') }
    const lv = await prisma.gDLevel.findMany({ where: { id: { in: ids } }, include: { profile: true } })
    const sorted = ids.map(id => lv.find(l => l.id === id)).filter(Boolean) as any[]
    if (sorted.length === 0) return c.text('-1')
    const levelStrings = sorted.map(levelRow)
    const seen = new Set<string>()
    const creators: string[] = []
    for (const l of sorted) {
      if (!seen.has(l.profileId)) {
        seen.add(l.profileId)
        const numId = uuidToGDId(l.profileId)
        creators.push(`${numId}:${l.profile.gdLogin}:${numId}`)
      }
    }
    const hashInput    = sorted.map(l => `${String(l.id)[0]}${l.id % 10}${l.stars}${l.verifiedCoins ? 1 : 0}`).join('') + 'xI25fpAapCQg'
    const responseHash = createHash('sha1').update(hashInput).digest('hex')
    const allSongIds   = [...new Set(sorted.map((l: any) => l.customSongId > 0 ? l.customSongId : l.songId).filter((id: number) => id >= 0))]
    const songStrs     = await Promise.all(allSongIds.map(id => getSongStr(id as number)))
    const songsSection = songStrs.filter(Boolean).join('~|~')
    log('getLevels', `safe type=${type} -> ${sorted.length}/${total}`)
    return c.text(`${levelStrings.join('|')}#${creators.join('|')}#${songsSection}#${total}:${page * limit}:${limit}#${responseHash}`)
  }

  let where: any = { isUnlisted: false, isDeleted: false }
  let orderBy: any = { createdAt: 'desc' }

  if (type === 25) {
    // Уровни внутри листа (GD 2.2): str = ID листа
    const listId = parseInt(str) || 0
    if (!listId) return c.text('-1')
    const list = await prisma.gDLevelList.findUnique({ where: { id: listId } })
    if (!list) { log.warn('getLevels', `list ${listId} не найден`); return c.text('-1') }
    const ids = list.levelIds.split(',').map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n) && n > 0)
    if (ids.length === 0) return c.text('#0:0:10')
    where = { id: { in: ids }, isDeleted: false }

  } else if (type === 5) {
    const requestedId = parseInt(str) || 0
    const allProfiles = await prisma.gDProfile.findMany()
    let profile = allProfiles.find(p => uuidToGDId(p.id) === requestedId)
    if (!profile && body.accountID) {
      const fallbackId = parseInt(body.accountID as string) || 0
      profile = allProfiles.find(p => uuidToGDId(p.id) === fallbackId)
    }
    if (!profile) return c.text('-1')
    where   = { profileId: profile.id, isDeleted: false }
    orderBy = { createdAt: 'desc' }

  } else if (type === 7) {
    where   = { isUnlisted: false, isDeleted: false, stars: { gt: 0 } }
    orderBy = { likes: 'desc' }

  } else if (type === 8 || type === 27) {
    where   = { isUnlisted: false, isDeleted: false, isSent: true }
    orderBy = { createdAt: 'desc' }

  } else if (type === 12) {
    const followedParam = (body.followed as string) || ''
    const followedIds = followedParam.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
    if (followedIds.length === 0) return c.text('-1')
    const allProfiles = await prisma.gDProfile.findMany()
    const profileIds  = allProfiles
      .filter(p => followedIds.includes(uuidToGDId(p.id)))
      .map(p => p.id)
    if (profileIds.length === 0) return c.text('-1')
    where   = { isUnlisted: false, isDeleted: false, profileId: { in: profileIds } }
    orderBy = { createdAt: 'desc' }

  } else if (type === 13) {
    const myId = parseInt(body.accountID as string) || 0
    const allProfiles = await prisma.gDProfile.findMany()
    const myProfile = allProfiles.find(p => uuidToGDId(p.id) === myId)
    if (!myProfile) return c.text('-1')
    else {
      const friendships = await prisma.gDFriendship.findMany({
        where: { status: 'ACCEPTED', OR: [{ fromId: myProfile.id }, { toId: myProfile.id }] }
      })
      const friendIds = friendships.map(f => f.fromId === myProfile.id ? f.toId : f.fromId)
      if (friendIds.length === 0) return c.text('-1')
      where = { isUnlisted: false, isDeleted: false, profileId: { in: [myProfile.id, ...friendIds] } }
    }
    orderBy = { createdAt: 'desc' }

  } else if (type === 10) {
    const ids = str.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
    if (ids.length === 0) return c.text('-1')
    where = { id: { in: ids }, isDeleted: false }

  } else if (type === 11) {
    where   = { isUnlisted: false, isDeleted: false, stars: { gt: 0 } }
    orderBy = { stars: 'desc' }

  } else if (type === 6) {
    where   = { isUnlisted: false, isDeleted: false, isRated: true }
    orderBy = { stars: 'desc' }

  } else if (type === 1) {
    orderBy = { downloads: 'desc' }

  } else if (type === 2) {
    orderBy = { likes: 'desc' }

  } else if (type === 3) {
    orderBy = [{ likes: 'desc' }, { createdAt: 'desc' }]

  } else if (type === 4) {
    orderBy = { createdAt: 'desc' }

  } else {
    const numId = parseInt(str)
    if (!isNaN(numId) && numId > 0) {
      where = { id: numId, isDeleted: false }
    } else if (str) {
      where = { isUnlisted: false, isDeleted: false, name: { contains: str, mode: 'insensitive' } }
    }
  }

  // Дополнительные фильтры (применяются поверх основного type)

  // diff: сложность (-=все, -1=N/A, 1=easy,2=normal,3=hard,4=harder,5=insane,-2=demon,-3=auto)
  const diffParam = (body.diff as string) || ''
  if (diffParam && diffParam !== '-') {
    const diffVals = diffParam.split(',').map(Number).filter(n => !isNaN(n))
    const diffMap: Record<number, number> = { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 }
    const orConditions: any[] = []
    for (const d of diffVals) {
      if (d === -2)                      orConditions.push({ isDemon: true })
      else if (d === -3)                 orConditions.push({ isAuto: true })
      else if (d === -1)                 orConditions.push({ difficulty: 0, isDemon: false, isAuto: false })
      else if (diffMap[d] !== undefined) orConditions.push({ difficulty: diffMap[d], isDemon: false })
    }
    if (orConditions.length === 1) {
      Object.assign(where, orConditions[0])
    } else if (orConditions.length > 1) {
      where.OR = orConditions
    }
  }

  // len: длина (-=все, 0=tiny,1=short,2=medium,3=long,4=xl,5=platformer)
  const lenParam = (body.len as string) || ''
  if (lenParam && lenParam !== '-') {
    const lenVals = lenParam.split(',').map(Number).filter(n => !isNaN(n) && n >= 0)
    if (lenVals.length > 0) where.length = { in: lenVals }
  }

  // star=1: только оценённые уровни (со звёздами)
  if ((body.star as string) === '1') {
    where.stars = { gt: 0 }
  }

  // noStar=1: только без звёзд (неоценённые)
  if ((body.noStar as string) === '1') {
    where.stars = 0
  }

  // featured=1: Featured+  epic=1: Epic+  legendary=1: Mythic (swap в GD!)  mythic=1: Legendary (swap!)
  if ((body.featured  as string) === '1') where.isEpic = { gte: 1 }
  if ((body.epic      as string) === '1') where.isEpic = { gte: 2 }
  if ((body.mythic    as string) === '1') where.isEpic = { gte: 3 }  // "mythic" параметр = Legendary в UI
  if ((body.legendary as string) === '1') where.isEpic = 4           // "legendary" параметр = Mythic в UI

  // original=1: только оригинальные уровни (не копии)
  if ((body.original as string) === '1') where.originalId = 0

  // coins=1: только уровни с верифицированными монетами
  if ((body.coins as string) === '1') {
    where.verifiedCoins = true
  }

  // twoPlayer=1: только двухплеерные
  if ((body.twoPlayer as string) === '1') {
    where.twoPlayer = true
  }

  // song + customSong: фильтр по треку (GD шлёт "song", не "songID"!)
  // Официальные треки: GD шлёт 1-indexed (song=1 = Stereo Madness),
  // но audioTrack при загрузке 0-indexed → вычитаем 1
  const songIdParam = parseInt((body.song as string) || (body.songID as string))
  if (!isNaN(songIdParam) && songIdParam > 0) {
    if ((body.customSong as string) === '1') {
      where.customSongId = songIdParam
    } else {
      where.songId       = songIdParam - 1
      where.customSongId = 0
    }
  }

  // demonFilter: уточнение типа демона (1=easy,2=medium,3=hard,4=insane,5=extreme)
  const demonFilter = parseInt(body.demonFilter as string)
  if (!isNaN(demonFilter) && demonFilter >= 1 && demonFilter <= 5) {
    where.isDemon    = true
    where.demonDiff  = demonFilter
  }

  // completedLevels=(id1,id2,...): uncompleted=1 → исключить, onlyCompleted=1 → только они
  const completedStr = ((body.completedLevels as string) || '').replace(/[()]/g, '')
  const completedIds = completedStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
  if (completedIds.length > 0) {
    if ((body.uncompleted as string) === '1')    where.id = { notIn: completedIds }
    if ((body.onlyCompleted as string) === '1')  where.id = { in:    completedIds }
  }

  // Скрытые гаунтлет-копии никогда не показываем в обычных поисках
  if (type !== 10) where.isHidden = false

  const [total, levels] = await Promise.all([
    prisma.gDLevel.count({ where }),
    prisma.gDLevel.findMany({
      where,
      orderBy,
      skip:    page * limit,
      take:    limit,
      include: { profile: true },
    }),
  ])

  if (levels.length === 0) return c.text('-1')

  const levelStrings = levels.map(levelRow)

  const seen = new Set<string>()
  const creators: string[] = []
  for (const l of levels) {
    if (!seen.has(l.profileId)) {
      seen.add(l.profileId)
      const numId = uuidToGDId(l.profileId)
      creators.push(`${numId}:${l.profile.gdLogin}:${numId}`)
    }
  }

  // GD Docs: первая цифра ID + последняя цифра ID + stars + verifiedCoins (0/1)
  const hashInput    = levels.map(l => `${String(l.id)[0]}${l.id % 10}${l.stars}${l.verifiedCoins ? 1 : 0}`).join('') + 'xI25fpAapCQg'
  const responseHash = createHash('sha1').update(hashInput).digest('hex')

  const allSongIds   = [...new Set(levels.map(l => l.customSongId > 0 ? l.customSongId : l.songId).filter(id => id >= 0))]
  const songStrs     = await Promise.all(allSongIds.map(id => getSongStr(id)))
  const songsSection = songStrs.filter(Boolean).join('~|~')

  log('getLevels', 'выдан список уровней', { type, query: str, page, count: levels.length, total })

  return c.text(`${levelStrings.join('|')}#${creators.join('|')}#${songsSection}#${total}:${page * limit}:${limit}#${responseHash}`)
}

export async function handleUploadLevel(body: Body, c: Context) {
  const accountID      = body.accountID   as string
  const levelName      = body.levelName   as string
  const levelStringRaw = body.levelString as string
  if (!accountID || !levelName || !levelStringRaw) return c.text('-1')

  // form-parser заменяет '+' на пробел — возвращаем обратно для base64
  const levelString = levelStringRaw.replace(/ /g, '+')

  const allProfiles = await prisma.gDProfile.findMany()
  const profile = allProfiles.find(p => uuidToGDId(p.id) === parseInt(accountID))
  if (profile.isBanned) {log.warn('uploadLevel', `игрок ${profile.gdLogin} (${profile.id}) заблокирован`); return c.text('-1')}
  if (!profile) return c.text('-1')

  // ВНИМАНИЕ: ключа 'level' в LIMITS (lib/rateLimit.ts) нет — действует дефолт 30/мин.
  const rlLvl = hitLimit('level', accountID)
  if (!rlLvl.ok) return blockedResponse(c, rlLvl, 'generic')

  const num = (k: string, def = 0) => { const v = parseInt(body[k] as string); return isNaN(v) ? def : v }

  let description = ''
  try {
    description = Buffer.from((body.levelDesc as string) || '', 'base64').toString('utf8')
  } catch { description = (body.levelDesc as string) || '' }

  const existing = await prisma.gDLevel.findFirst({
    where: { profileId: profile.id, name: levelName }
  })

  let level: any
  if (existing) {
    level = await prisma.gDLevel.update({
      where: { id: existing.id },
      data: {
        levelData:      levelString,
        description,
        version:        existing.version + 1,
        length:         num('levelLength'),
        songId:         num('audioTrack'),
        customSongId:   num('songID'),
        twoPlayer:      num('twoPlayer') === 1,
        isUnlisted:     num('unlisted')  === 1,
        coins:          num('coins'),
        objects:        num('objects'),
        // 2.2: клиент теперь всегда шлёт password="1" (вне зависимости от того,
        // ставил ли игрок пароль), поэтому просто || '0' не срабатывал — "1"
        // сохранялось буквально и ломало загрузку уровня (проверено на практике).
        // Игнорируем то, что прислал клиент, и всегда храним "0".
        password:       '0',
        extra:          (body.extraString as string) || '',
        requestedStars: num('requestedStars'),
      }
    })
    log('uploadLevel', `обновлён "${levelName}" id=${level.id} v${level.version}`)
    // Синк скрытых копий этого уровня (originalId -> level.id, isHidden=true) —
    // это дейлики/виклики/ивенты/гаунтлеты/маппаки, все они клоны оригинала
    // и должны получать актуальные данные при апдейте оригинального уровня.
    const gauntletClones = await prisma.gDLevel.findMany({
      where: { originalId: level.id, isHidden: true },
    })
    if (gauntletClones.length > 0) {
      await prisma.gDLevel.updateMany({
        where: { id: { in: gauntletClones.map(g => g.id) } },
        data: {
          levelData: levelString,
          version:   level.version,
          length:    num('levelLength'),
          objects:   num('objects'),
        },
      })
      log('uploadLevel', `синк ${gauntletClones.length} гаунтлет-копий уровня ${level.id}`)
    }
  } else {
    level = await prisma.gDLevel.create({
      data: {
        profileId:      profile.id,
        name:           levelName,
        levelData:      levelString,
        description,
        version:        num('levelVersion', 1),
        length:         num('levelLength'),
        songId:         num('audioTrack'),
        customSongId:   num('songID'),
        twoPlayer:      num('twoPlayer') === 1,
        isUnlisted:     num('unlisted')  === 1,
        coins:          num('coins'),
        objects:        num('objects'),
        password:       '0',   // всегда '0', причину см. выше в handleUploadLevel
        extra:          (body.extraString as string) || '',
        requestedStars: num('requestedStars'),
        originalId:     num('original', 0),
        isSent:         num('requestedStars') > 0,
      }
    })
    log('uploadLevel', `создан "${levelName}" id=${level.id}`)
  }

  return c.text(level.id.toString())
}

// GD-эндпоинт getGJLevelLists (GD 2.2+)
export async function handleGetLevelLists(body: Body, c: Context) {
  const type  = parseInt(body.type as string) || 0
  const str   = (body.str as string) || ''
  const page  = parseInt(body.page as string) || 0
  const limit = 10

  let where: any = { isPublic: true, isDeleted: false }
  let orderBy: any = { createdAt: 'desc' }

  if (type === 5) {
    // Свои листы / листы конкретного игрока
    const reqId      = parseInt(str) || parseInt(body.accountID as string) || 0
    const allProfiles = await prisma.gDProfile.findMany()
    const profile = allProfiles.find(p => uuidToGDId(p.id) === reqId)
    if (!profile) { log.warn('getLevelLists', `профиль ${reqId} не найден`); return c.text('-1') }
    where   = { profileId: profile.id }
    orderBy = { createdAt: 'desc' }
  } else if (str) {
    where = { isPublic: true, name: { contains: str, mode: 'insensitive' } }
  }

  // diff: сложность листа (-1=N/A, -2=demons, 1=easy..5=insane)
  const listDiff = (body.diff as string) || ''
  if (listDiff && listDiff !== '-') {
    const d = parseInt(listDiff)
    if (!isNaN(d)) {
      if (d === -1)               where.difficulty = -1
      else if (d === -2)          where.difficulty = { gte: 6 }
      else if (d >= 1 && d <= 5)  where.difficulty = d
    }
  }

  // star=1: только оценённые (isRated)
  if ((body.star as string) === '1') {
    where.isRated = true
  }

  const [total, lists] = await Promise.all([
    prisma.gDLevelList.count({ where }),
    prisma.gDLevelList.findMany({
      where, orderBy,
      skip:    page * limit,
      take:    limit,
      include: { profile: true },
    }),
  ])

  if (lists.length === 0) { log('getLevelLists', ` нет листов`); return c.text('#0:0:10') }

  const listStrings = lists.map(lst => {
    const creatorId = uuidToGDId(lst.profile.id)
    const desc      = lst.description ? Buffer.from(lst.description).toString('base64') : ''
    // key 7: difficulty (-1=N/A, 0=Auto, 1=Easy, 2=Normal, 3=Hard, 4=Harder, 5=Insane, 6-10=Demon)
    // DB хранит raw GD enum; старые записи имеют -1 → N/A
    const diff   = lst.difficulty              // возвращаем как есть
    const rated  = lst.isRated ? 1 : 0        // key 19: rated модератором
    return [
      1,  lst.id,
      2,  lst.name,
      3,  desc,
      5,  lst.version,
      7,  diff,                   // difficulty
      10, lst.downloads,
      14, lst.likes,
      19, rated,                  // rated bool
      49, creatorId,              // accountID создателя
      50, lst.profile.gdLogin,   // username создателя
      51, lst.levelIds || '',    // level IDs через запятую
      55, lst.diamonds,
      56, lst.diamonds > 0 ? 1 : 0,
    ].join(':')
  })

  const seen = new Set<string>()
  const creators: string[] = []
  for (const l of lists) {
    if (!seen.has(l.profileId)) {
      seen.add(l.profileId)
      const numId = uuidToGDId(l.profile.id)
      creators.push(`${numId}:${l.profile.gdLogin}:${numId}`)
    }
  }

  // По GD Docs хэш для листов всегда фиксирован:
  const hash = 'f5da5823d94bbe7208dd83a30ff427c7d88fdb99'

  log('getLevelLists', 'выдан список листов', { type, query: str, page, count: lists.length, total })
  return c.text(`${listStrings.join('|')}#${creators.join('|')}#${total}:${page * limit}:${limit}#${hash}`)
}

// GD-эндпоинт uploadGJLevelList
export async function handleUploadLevelList(body: Body, c: Context) {
  const accountID = body.accountID as string
  const listName  = (body.listName  as string) || (body.name as string) || ''
  if (!accountID || !listName) return c.text('-1')

  const allProfiles = await prisma.gDProfile.findMany()
  const profile = allProfiles.find(p => uuidToGDId(p.id) === parseInt(accountID))
  if (!profile) return c.text('-1')

  // ВНИМАНИЕ: ключа 'levellist' в LIMITS (lib/rateLimit.ts) нет — действует дефолт 30/мин.
  const rlList = hitLimit('levellist', accountID)
  if (!rlList.ok) return blockedResponse(c, rlList, 'generic')

  const num = (k: string, def = 0) => { const v = parseInt(body[k] as string); return isNaN(v) ? def : v }

  let description = ''
  try {
    const raw = ((body.listDesc as string) || (body.description as string) || '').replace(/ /g, '+')
    description = Buffer.from(raw, 'base64').toString('utf8')
  } catch { description = (body.listDesc as string) || '' }

  // GD 2.2 шлёт listLevels (ID через запятую); fallback: levels / levelIDs
  const levelIds = ((body.listLevels as string) || (body.levels as string) || (body.levelIDs as string) || '').trim()
  const listID    = num('listID')
  // GD шлёт difficulty (enum: 0=auto, 1=easy, 2=normal, 3=hard, 4=harder, 5=insane, 6+=demon)
  const difficulty = num('difficulty', 0)
  const diamonds   = num('diamonds', 0)
  const isPublic   = (body.unlisted as string) !== '1'

  let list: any
  if (listID > 0) {
    const existing = await prisma.gDLevelList.findUnique({ where: { id: listID } })
    if (!existing || existing.profileId !== profile.id) return c.text('-1')
    list = await prisma.gDLevelList.update({
      where: { id: listID },
      data:  { name: listName, description, levelIds, version: existing.version + 1, difficulty, isPublic },
    })
    log('uploadLevelList', `обновлён "${listName}" id=${list.id} v${list.version}`)
  } else {
    list = await prisma.gDLevelList.create({
      data: { profileId: profile.id, name: listName, description, levelIds, difficulty, diamonds, isPublic },
    })
    log('uploadLevelList', `создан "${listName}" id=${list.id}`)
  }

  return c.text(list.id.toString())
}

// GD-эндпоинт getGJEventLevels21.
// В отличие от daily/weekly, GD ожидает полные данные уровня + |timeLeft в конце
export async function handleGetEventLevels(body: Body, c: Context) {
  const page  = parseInt(body.page as string) || 0
  const limit = 10

  const eventSlots = await prisma.gDDailyLevel.findMany({
    where:   { type: 2, activatedAt: { not: null } },
    orderBy: { activatedAt: 'desc' },
    skip:    page * limit,
    take:    limit,
    include: { level: { include: { profile: true } } },
  })

  if (eventSlots.length === 0) { log('getEventLevels', ' нет event-слотов'); return c.text('-1') }

  const levelStrings = eventSlots.map(slot => {
    // Добавляем key 41 = номер эвента (клиент использует для идентификации)
    return levelRow(slot.level) + ':41:' + slot.number
  })

  const levels = eventSlots.map(s => s.level)

  const seen = new Set<string>()
  const creators: string[] = []
  for (const l of levels) {
    if (!seen.has(l.profileId)) {
      seen.add(l.profileId)
      const numId = uuidToGDId(l.profile.id)
      creators.push(`${numId}:${l.profile.gdLogin}:${numId}`)
    }
  }

  const hashInput = levels.map(l =>
    `${String(l.id)[0]}${l.id % 10}${l.stars}${l.verifiedCoins ? 1 : 0}`
  ).join('') + 'xI25fpAapCQg'
  const hash = createHash('sha1').update(hashInput).digest('hex')

  const allSongIds   = [...new Set(levels.map(l => l.customSongId > 0 ? l.customSongId : l.songId).filter(id => id >= 0))]
  const songStrs     = await Promise.all(allSongIds.map(id => getSongStr(id)))
  const songsSection = songStrs.filter(Boolean).join('~|~')

  // Секунд до следующего обновления эвента (до полуночи UTC)
  const now  = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  const timeLeft = Math.max(10, Math.floor((next.getTime() - now.getTime()) / 1000))

  log('getEventLevels', 'выдан список event-уровней', { page, count: levels.length, timeLeft })
  return c.text(`${levelStrings.join('|')}#${creators.join('|')}#${songsSection}#${levels.length}:${page * limit}:${limit}#${hash}|${timeLeft}`)
}

// Дедуп downloads: один identifier (аккаунт, иначе IP) засчитывается
// один раз навсегда на один уровень — повторные открытия экрана
// уровня тем же игроком счётчик больше не крутят.
const downloadedSet = new Set<string>()

function shouldCountDownload(dedupKey: string): boolean {
  if (downloadedSet.has(dedupKey)) return false
  downloadedSet.add(dedupKey)
  if (downloadedSet.size > 200_000) downloadedSet.clear()
  return true
}

export async function handleDownloadLevel(body: Body, c: Context) {
  let reqLevelID = parseInt(body.levelID as string)
  if (isNaN(reqLevelID)) return c.text('-1')

  // -1=daily, -2=weekly, -3=event → ищем в GDDailyLevel
  let dailyNumber  = 0
  let specialType  = -1  // -1=обычный, 0=daily, 1=weekly, 2=event
  if (reqLevelID <= 0) {
    const type = Math.abs(reqLevelID) - 1   // -1→0, -2→1, -3→2
    const slot = await prisma.gDDailyLevel.findFirst({ where: { type, activatedAt: { not: null } }, orderBy: { activatedAt: 'desc' } })
    if (!slot) { log('downloadLevel', `daily/weekly type=${type}: нет слота`); return c.text('-1') }
    dailyNumber = slot.number
    reqLevelID  = slot.levelId
    specialType = type
  }

  const levelID = reqLevelID
  const level = await prisma.gDLevel.findUnique({
    where:   { id: levelID },
    include: { profile: true }
  })
  if (!level || level.isDeleted) { log.warn('downloadLevel', `уровень ${levelID} не найден или удалён`); return c.text('-1') }

  // Определяем "кто скачивает" — так же, как в лайках: аккаунт приоритетнее IP.
  const accountID = (body.accountID as string) || ''
  const ip = c.req.header('x-real-ip')
    || c.req.header('cf-connecting-ip')
    || c.req.header('x-forwarded-for')?.split(',')[0].trim()
    || '127.0.0.1'
  const profile    = accountID ? await findProfile(accountID) : null
  const identifier = profile ? profile.id : ip
  const dedupKey   = `download:${levelID}:${identifier}`

  // ВАЖНО: в отличие от лайков, тут дедуп НЕ прерывает функцию —
  // клиенту в любом случае нужно вернуть полные данные уровня,
  // мы только решаем, инкрементить счётчик или нет.
  if (shouldCountDownload(dedupKey)) {
    await prisma.gDLevel.update({ where: { id: levelID }, data: { downloads: { increment: 1 } } })
    level.downloads += 1  // чтобы значение ниже по коду (level.downloads + 1) не задвоило инкремент
  }

  const creatorId  = uuidToGDId(level.profile.id)
  const descBase64 = level.description ? Buffer.from(level.description).toString('base64') : ''

  const ldUrlSafe = level.levelData  // URL-safe base64 — отправляем в поле 4 как есть

  // hash1: SHA1 от 40 символов строки уровня (по официальной документации)
  // https://boomlings.dev/resources/server/hashes#downloadgjlevel-hash-1
  let hash1: string
  if (ldUrlSafe.length < 41) {
    hash1 = createHash('sha1').update(ldUrlSafe + 'xI25fpAapCQg').digest('hex')
  } else {
    const m = Math.floor(ldUrlSafe.length / 40)
    let h1chars = ''
    for (let i = 0; i < 40; i++) h1chars += ldUrlSafe[i * m] ?? ''
    hash1 = createHash('sha1').update(h1chars + 'xI25fpAapCQg').digest('hex')
  }

  // hash2: поля через запятую + соль
  // Поля (по документации): creatorId, stars, isDemon, levelId,
  //   verifiedCoins, featureScore, password, dailyNumber
  // Пароль: 0=нет копирования, 1=свободно, иначе +1000000
  const rawPw = level.password || '0'
  let hash2pw: string
  if (rawPw === '0' || rawPw === '1') {
    hash2pw = rawPw
  } else {
    const n = parseInt(rawPw)
    hash2pw = isNaN(n) ? rawPw : (n + 1000000).toString()
  }
  // Ключ 41: то что идёт в level data И в hash2
  // daily  → dailyNumber
  // weekly → dailyNumber + 100000  (клиент вычитает 100000 чтобы распознать weekly)
  // event  → dailyNumber
  // обычный → 0
  const key41 =
    specialType === 1 ? dailyNumber + 100000 :
    specialType >= 0  ? dailyNumber : 0

  // hash2: "dailyNumber" в документации = значение key41 из level object
  const hash2 = createHash('sha1').update([
    creatorId,
    level.stars,
    level.isDemon ? 1 : 0,
    level.id,
    level.verifiedCoins ? 1 : 0,
    level.isEpic > 0 ? 1 : 0,   // featureScore — должно совпадать с key 19
    hash2pw,
    key41,  // weekly=100001, daily=1, обычный=0
  ].join(',') + 'xI25fpAapCQg').digest('hex')

  const levelDataStr = [
    1,  level.id,
    2,  level.name,
    3,  descBase64,
    4,  ldUrlSafe,
    5,  level.version,
    6,  creatorId,
    8,  level.stars > 0 ? 10 : 0,                      // difficultyDenominator (10=rated, 0=N/A)
    9,  level.difficulty,                               // difficultyNumerator (10/20/30/40/50)
    10, level.downloads,                                // downloads (уже учитывает инкремент выше, если он был)
    12, level.customSongId > 0 ? 0 : level.songId,     // officialSong
    13, 21,                                             // gameVersion
    14, level.likes,                                    // likes
    15, level.length,                                   // length (0-4)
    17, level.isDemon ? 1 : 0,
    18, level.stars,
    19, level.isEpic > 0 ? 1 : 0,                      // featureScore (non-zero = featured)
    25, level.isAuto ? 1 : 0,
    27, encodePassword(level.password),
    28, 0,
    29, 0,
    30, 0,
    31, level.twoPlayer ? 1 : 0,
    35, level.customSongId > 0 ? level.customSongId : 0,
    36, level.extra || '',
    37, level.coins,
    38, level.verifiedCoins ? 1 : 0,
    39, level.requestedStars,
    40, 0,
    42, level.isEpic > 1 ? level.isEpic - 1 : 0,
    43, level.isDemon ? (level.demonDiff || 3) : 0,      // 3=easy,4=medium,0=hard,5=insane,6=extreme
    44, 0,   // значок гаунтлета: косметика, отдельный lookup не делаем
    45, level.objects,
    46, 0,
    47, 0,
    // Ключ 41 только для daily/weekly/event
    ...(key41 > 0 ? [41, key41] : []),
  ].join(':')

  // Секция songs (кастомные; встроенные передаются через key 12)
  let songsSection = ''
  if (level.customSongId > 0) {
    const songStr = await getSongStr(level.customSongId)
    if (songStr) songsSection = songStr
  }

  log('downloadLevel', `"${level.name}" id=${level.id} specialType=${specialType} key41=${key41} hash1=${hash1.slice(0,8)}… hash2=${hash2.slice(0,8)}…`)

  // Формат: {level}#{hash1}#{hash2}#{user}#{songs}#{extraArtists}
  // {user} только для daily/weekly/event (-1/-2/-3)
  // GD 2.2 (binaryVersion >= 42) всегда ожидает секции songs и extraArtists
  if (specialType >= 0) {
    const userStr = `${creatorId}:${level.profile.gdLogin}:${creatorId}`
    return c.text(`${levelDataStr}#${hash1}#${hash2}#${userStr}#${songsSection}#`)
  }

  // Обычный уровень — без {user}, но songs секция нужна
  return c.text(`${levelDataStr}#${hash1}#${hash2}##${songsSection}#`)
}

// Отправка уровня на оценку (suggestGJStars20)
// Игрок: голос копится в скользящее среднее (voteSum/voteCount), значок
// сложности (requestedStars) выставляется только после 5+ голосов.
// Модератор/элдер: НЕ рейтит мгновенно — только эскалирует уровень в
// очередь isSent=true. Финальную оценку ставит элдер отдельно, через
// rateGJStars/rateGJDemon (там уже есть защита от самооценки).
const votedSet = new Set<string>()  // дедуп: один аккаунт — один голос на уровень

export async function handleSuggestStars(body: Body, c: Context) {
  const accountID = body.accountID as string
  const levelID   = parseInt(body.levelID as string)
  const stars     = parseInt(body.stars   as string) || 0
  // feature: 0=star rate, 1=feature, 2=epic, 3=legendary, 4=mythic (см. boomlings.dev)
  const feature   = parseInt(body.feature as string) || 0

  if (!accountID || isNaN(levelID)) return c.text('-1')

  const profile = await findProfile(accountID)
  if (!profile) return c.text('-1')

  const level = await prisma.gDLevel.findUnique({ where: { id: levelID } })
  if (!level) return c.text('-1')

  // Обычный модератор: только эскалирует в очередь, сам не рейтит.
  if (profile.role === 'MODERATOR') {
    await prisma.gDLevel.update({
      where: { id: levelID },
      data: { isSent: true, requestedStars: stars > 0 ? stars : level.requestedStars },
    })
    log('suggestStars', 'оценка модератора передана элдерам', { login: profile.gdLogin, levelID })
    return c.text('1')
  }

  // Элдер: рейтит мгновенно (кроме своих уровней — там та же защита от самооценки,
  // что и в handleRateStars/handleRateDemon).
  if (profile.role === 'ELDER_MODERATOR') {
    if (level.profileId === profile.id) {
      if (level.isSent) return c.text('OWN_ALREADY_SENT')
      await prisma.gDLevel.update({ where: { id: levelID }, data: { isSent: true } })
      log('suggestStars', 'самооценка запрещена, передано другим элдерам', { login: profile.gdLogin, levelID })
      return c.text('OWN_SENT')
    }

    const difficulty = stars <= 1 ? 0 : stars === 2 ? 10 : stars === 3 ? 20 : stars <= 5 ? 30 : stars <= 7 ? 40 : 50

    const updatedLevel = await prisma.gDLevel.update({
      where: { id: levelID },
      data: {
        stars, isRated: stars > 0, isSent: false, difficulty,
        isAuto: stars === 1,
        isEpic: feature,
        isDemon: stars === 10,
      },
      select: { profileId: true }
    })

    if (updatedLevel.profileId) {
      const creatorPoints = await calcCp(updatedLevel.profileId)
      await prisma.gDProfile.update({ where: { id: updatedLevel.profileId }, data: { creatorPoints } })
    }

    log('suggestStars', 'уровень оценён элдером', { login: profile.gdLogin, levelID, stars, feature })
    return c.text('1')
  }

  // Обычный игрок: голосует за сложность
  if (stars < 1 || stars > 10) return c.text('-1')

  const voteKey = `vote:${levelID}:${profile.id}`
  if (votedSet.has(voteKey)) return c.text('1')  // уже голосовал этим аккаунтом — молча игнорируем повтор
  votedSet.add(voteKey)
  if (votedSet.size > 200_000) votedSet.clear()

  const voteSum   = level.voteSum + stars
  const voteCount = level.voteCount + 1
  const avgStars  = Math.round(voteSum / voteCount)

  await prisma.gDLevel.update({
    where: { id: levelID },
    data: {
      voteSum,
      voteCount,
      requestedStars: voteCount >= 5 ? avgStars : level.requestedStars,
    },
  })
  log('suggestStars', 'принят голос игрока', { login: profile.gdLogin, levelID, stars, votes: voteCount, avg: avgStars })

  return c.text('1')
}
