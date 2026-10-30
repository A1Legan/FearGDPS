// Поиск аккаунтов (getGJUsers20.php)
// GD ищет игрока по нику (str) ИЛИ по числовому ID (если str — число).
// Ответ: <user-object>(|<user-object>...) + '#' + total:offset:pageSize
// Документация: https://boomlings.dev/endpoints/users/getGJUsers20
import { Context } from 'hono'
import { prisma } from '../lib/prisma'
import { uuidToGDId } from '../lib/crypto'
import { encodeObject } from '../lib/gdFormat'
import { getActiveIcon } from '../lib/gdHelpers'
import { log } from '../lib/logger'

type Body = Record<string, string | File>

// Креатор-поинты считаем так же, как в userInfo (динамически)
async function creatorPointsFor(profileId: string): Promise<number> {
  const rated = await prisma.gDLevel.findMany({
    where:  { profileId, isRated: true, isDeleted: false, isHidden: false },
    select: { isEpic: true },
  })
  let cp = 0
  for (const l of rated) { cp += 1; if (l.isEpic >= 1) cp += 1; if (l.isEpic >= 2) cp += 1 }
  return cp
}

export async function handleGetUsers(body: Body, c: Context) {
  const str   = ((body.str as string) || '').trim()
  const page  = parseInt(body.page as string) || 0
  const limit = 10
  if (!str) { log('getUsers', 'пустой str'); return c.text('-1') }

  const all = await prisma.gDProfile.findMany({ where: { isHidden: false } })

  let matched
  const asNum = parseInt(str)
  if (!isNaN(asNum) && /^\d+$/.test(str)) {
    matched = all.filter(p => uuidToGDId(p.id) === asNum)
  } else {
    const q = str.toLowerCase()
    matched = all.filter(p => p.gdLogin.toLowerCase().includes(q))
    // точное совпадение ника — вперёд
    matched.sort((a, b) => {
      const ae = a.gdLogin.toLowerCase() === q ? 0 : 1
      const be = b.gdLogin.toLowerCase() === q ? 0 : 1
      return ae - be || a.gdLogin.localeCompare(b.gdLogin)
    })
  }

  const total = matched.length
  if (total === 0) { log.warn('getUsers', 'поиск не дал результатов', { query: str }); return c.text('-1') }

  const pageItems = matched.slice(page * limit, page * limit + limit)

  const userStrings: string[] = []
  for (const p of pageItems) {
    const numId = uuidToGDId(p.id)
    const cp    = await creatorPointsFor(p.id)
    userStrings.push(encodeObject({
      1:  p.gdLogin,
      2:  numId,                 // playerID
      3:  p.stars,
      4:  p.demonCount,
      6:  p.leaderboardPos ?? 0, // ranking
      8:  cp,                    // creator points
      9:  getActiveIcon(p),      // iconID
      10: p.color1,
      11: p.color2,
      13: p.coins,               // secret coins
      14: p.iconType,
      15: p.glowEnabled ? 1 : 0,
      16: numId,                 // accountID
      17: p.userCoins,
      52: p.moons,               // GD 2.2 moons
    }))
  }

  log('getUsers', 'выдан результат поиска', { query: str, count: pageItems.length, total })
  return c.text(`${userStrings.join('|')}#${total}:${page * limit}:${limit}`)
}
