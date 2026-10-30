import { Context } from 'hono'
import { prisma } from '../lib/prisma'
import { uuidToGDId } from '../lib/crypto'
import { encodeObject, encodeList } from '../lib/gdFormat'
import { getActiveIcon, findProfile, gdAge } from '../lib/gdHelpers'

type Body = Record<string, string | File>

// Креатор-поинты: считаем по рейтингованным ПУБЛИЧНЫМ уровням автора
// (isHidden:false — исключаем скрытые копии из дейли/викли/ивентов/гаунтлетов).
// Тир по isEpic: 0=rated(1) 1=featured(2) 2=epic(3) 3=legendary(4) 4=mythic(5)
async function calculateCreatorPoints(profileId: string): Promise<number> {
  const levels = await prisma.gDLevel.findMany({
    where: { profileId, isDeleted: false, isRated: true, isHidden: false },
    select: { isEpic: true },
  })
  return levels.reduce((acc, lvl) => {
    let cp = 1
    if (lvl.isEpic === 4) cp = 5
    else if (lvl.isEpic === 3) cp = 4
    else if (lvl.isEpic === 2) cp = 3
    else if (lvl.isEpic === 1) cp = 2
    return acc + cp
  }, 0)
}

export async function handleUserInfo(body: Body, c: Context) {
  const targetAccountID = body.targetAccountID as string
  if (!targetAccountID) return c.text('-1')
  const profile = await findProfile(targetAccountID)
  if (!profile) return c.text('-1')
  const numericId = uuidToGDId(profile.id)
  const creatorPoints = await calculateCreatorPoints(profile.id)
  if (profile.creatorPoints !== creatorPoints) {
    await prisma.gDProfile.update({
      where: { id: profile.id },
      data: { creatorPoints },
    })
  }

  return c.text(encodeObject({
    1:  profile.gdLogin,
    2:  numericId,
    3:  profile.stars,
    4:  profile.demonCount,
    6:  profile.leaderboardPos ?? 0,
    7:  numericId,
    8:  creatorPoints,
    9:  getActiveIcon(profile),
    10: profile.color1,
    11: profile.color2,
    13: profile.coins,
    14: profile.iconType,
    15: profile.glowEnabled ? 1 : 0,
    16: numericId,
    17: profile.userCoins,
    18: profile.messageState,
    19: profile.friendState,
    20: '',
    21: profile.cube,
    22: profile.ship,
    23: profile.ball,
    24: profile.ufo,
    25: profile.wave,
    26: profile.robot,
    28: profile.glowEnabled ? 1 : 0,
    29: 1,
    30: profile.leaderboardPos ?? 0,
    38: 0,
    39: 0,
    40: 0,
    43: profile.explosion,
    46: 0,
    48: profile.color3,
    49: profile.role === 'ELDER_MODERATOR' ? 2 : profile.role === 'MODERATOR' ? 1 : 0,
    52: profile.moons,
    53: profile.spider,
    54: profile.swing,
    55: profile.jetpack,
  }))
}

export async function handleUpdateScore(body: Body, c: Context) {
  const accountID = body.accountID as string
  if (!accountID) return c.text('-1')

  const profile = await findProfile(accountID)
  if (!profile) return c.text('-1')

  // Анти-чит: клампим статы в разумные пределы
  const parseStat = (key: string, current: number, limit: number) => {
    const val = parseInt(body[key] as string)
    return isNaN(val) ? current : Math.max(0, Math.min(limit, val))
  }

  await prisma.gDProfile.update({
    where: { id: profile.id },
    data: {
      stars:       parseStat('stars', profile.stars, 500000),
      moons:       parseStat('moons', profile.moons, 100000),
      demonCount:  parseStat('demons', profile.demonCount, 30000),
      coins:       parseStat('coins', profile.coins, 200),
      userCoins:   parseStat('userCoins', profile.userCoins, 30000),
      diamonds:    parseStat('diamonds', profile.diamonds, 1000000),
      orbs:         parseStat('orbs', profile.orbs, 20000000),
      iconType:    parseStat('iconType', profile.iconType, 10),
      color1:      parseStat('color1', profile.color1, 255),
      color2:      parseStat('color2', profile.color2, 255),
      color3:      parseStat('color3', profile.color3, 255),
      glowEnabled: body.accGlow !== undefined ? parseInt(body.accGlow as string) !== 0 : profile.glowEnabled,
      cube:        parseStat('accIcon', profile.cube, 500),
      ship:        parseStat('accShip', profile.ship, 500),
      ball:        parseStat('accBall', profile.ball, 500),
      ufo:         parseStat('accBird', profile.ufo, 500),
      wave:        parseStat('accDart', profile.wave, 500),
      robot:       parseStat('accRobot', profile.robot, 500),
      spider:      parseStat('accSpider', profile.spider, 500),
      swing:       parseStat('accSwing', profile.swing, 500),
      jetpack:     parseStat('accJetpack', profile.jetpack, 500),
      explosion:   parseStat('accExplosion', profile.explosion, 500),
    }
  })

  return c.text('1')
}

export async function handleLeaderboard(body: Body, c: Context) {
  const type      = (body.type as string) || ''
  const stat      = parseInt(body.stat as string) || 0
  const accountID = body.accountID as string
  const boardFilter = { isHidden: false, bannedFromBoards: false, isBanned: false }

  let orderField = 'stars'
  if (type === 'creators') {
    orderField = 'creatorPoints'
  } else if (stat === 1 || type === 'moons') {
    orderField = 'moons'
  }

  let profiles: any[] = []
  let startRank = 1

  if (type === 'friends') {
    if (!accountID) return c.text('-1')
    const all     = await prisma.gDProfile.findMany()
    const profile = all.find(p => uuidToGDId(p.id) === parseInt(accountID))

    if (!profile) return c.text('-1')

    const friendships = await prisma.gDFriendship.findMany({
      where: {
        OR: [{ fromId: profile.id }, { toId: profile.id }],
        status: 'ACCEPTED',
      },
    })
    const ids = new Set<string>([profile.id])
    for (const f of friendships) { ids.add(f.fromId); ids.add(f.toId); }

    profiles = await prisma.gDProfile.findMany({
      where:   { ...boardFilter, id: { in: Array.from(ids) } },
      orderBy: { [orderField]: 'desc' },
    })
  } else if (type === 'relative') {
    const profile = accountID ? await findProfile(accountID) : null
    if (profile) {
      const val = (profile as any)[orderField] ?? 0
      const rank = await prisma.gDProfile.count({
        where: { ...boardFilter, [orderField]: { gt: val } }
      }) + 1

      startRank = Math.max(1, rank - 25)
      profiles = await prisma.gDProfile.findMany({
        where:   { ...boardFilter },
        orderBy: { [orderField]: 'desc' },
        skip:    Math.max(0, rank - 26),
        take:    100,
      })
    } else {
      profiles = await prisma.gDProfile.findMany({
        where:   { ...boardFilter },
        orderBy: { [orderField]: 'desc' },
        take:    100,
      })
    }
  } else {
    const extraWhere = type === 'creators' ? { creatorPoints: { gt: 0 } } : {}
    profiles = await prisma.gDProfile.findMany({
      where:   { ...boardFilter, ...extraWhere },
      orderBy: { [orderField]: 'desc' },
      take:    100,
    })
  }

  if (profiles.length === 0) return c.text('-1')

  return c.text(encodeList(
    profiles.map((p, index) => {
      const displayRank = type === 'friends' ? index + 1 : startRank + index
      return {
        1:  p.gdLogin,
        2:  uuidToGDId(p.id),
        3:  p.stars,
        4:  p.demonCount,
        6:  displayRank,
        7:  uuidToGDId(p.id),
        8:  Math.round(p.creatorPoints || 0),
        9:  getActiveIcon(p),
        10: p.color1,
        11: p.color2,
        13: p.coins,
        14: p.iconType,
        15: p.glowEnabled ? 1 : 0,
        16: uuidToGDId(p.id),
        17: p.userCoins,
        29: 1,
        46: p.diamonds || 0,
        52: p.moons,
      }
    })
  ))
}

// Реальный счётчик попыток на уровне присылает наш geode-мод при выходе
// с уровня (см. FearAttemptsMod в ModButton.cpp) — сама GD никогда не шлёт
// это на сервер, поэтому это отдельный кастомный эндпоинт, а не часть
// стандартного протокола getGJLevelScores.
export async function handleUpdateAttempts(body: Body, c: Context) {
  const accountID = body.accountID as string
  const levelID   = parseInt(body.levelID as string)
  const attempts  = parseInt(body.attempts as string)

  if (!accountID || isNaN(levelID) || isNaN(attempts)) return c.text('-1')

  const profile = await findProfile(accountID)
  if (!profile) return c.text('-1')

  const existing = await prisma.gDLevelScore.findUnique({
    where: { levelId_profileId: { levelId: levelID, profileId: profile.id } },
  })
  // Если по этому уровню ещё нет записи (например, игрок ещё не проходил
  // уровень достаточно, чтобы отправился percent) — создавать нечего,
  // просто игнорируем: запись появится вместе с первым percent-сабмитом.
  if (!existing) return c.text('1')

  await prisma.gDLevelScore.update({
    where: { levelId_profileId: { levelId: levelID, profileId: profile.id } },
    data:  { attempts: Math.max(existing.attempts, attempts) },
  })

  return c.text('1')
}

export async function handleGetLevelScores(body: Body, c: Context) {
  const levelID   = parseInt(body.levelID as string)
  const accountID = body.accountID as string

  if (isNaN(levelID)) return c.text('-1')

  if (accountID) {
    const profile = await findProfile(accountID)
    const percent = Math.max(1, Math.min(100, parseInt(body.percent as string)))
    const coins   = Math.max(0, Math.min(3, parseInt(body.coins as string) || 0))

    if (profile && !isNaN(percent)) {
      const existing = await prisma.gDLevelScore.findUnique({
        where: { levelId_profileId: { levelId: levelID, profileId: profile.id } },
      })
      const bestPercent = Math.max(existing?.percent ?? 0, percent)
      // Монетки сохраняем только для лучшего результата (как в оригинальной GD —
      // на лидерборде показываются монетки именно с рекордной попытки)
      const bestCoins = percent >= bestPercent ? coins : (existing?.coins ?? 0)
      await prisma.gDLevelScore.upsert({
        where:  { levelId_profileId: { levelId: levelID, profileId: profile.id } },
        create: { levelId: levelID, profileId: profile.id, percent, coins, attempts: 1 },
        update: { percent: bestPercent, coins: bestCoins, attempts: { increment: 1 } },
      })
    }
  }

  const scores = await prisma.gDLevelScore.findMany({
    where:   { levelId: levelID, profile: { bannedFromBoards: false, isBanned: false, isHidden: false } },
    orderBy: { percent: 'desc' },
    take:    100,
    include: { profile: true },
  })
  if (scores.length === 0) return c.text('-1')

  return c.text(encodeList(scores.map((s, index) => {
    const gid = uuidToGDId(s.profile.id)
    return {
      1:  s.profile.gdLogin,
      2:  gid,
      3:  s.percent,
      6:  index + 1,
      9:  getActiveIcon(s.profile),
      10: s.profile.color1,
      11: s.profile.color2,
      13: s.coins,
      42: gdAge(s.updatedAt),
      14: s.profile.iconType,
      15: s.profile.glowEnabled ? 1 : 0,
      16: gid,
    }
  })))
}
