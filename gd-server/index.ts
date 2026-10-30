import { Hono } from 'hono'
import { existsSync } from 'fs'
import { join, extname } from 'path'
import { handleRegister, handleLogin } from './routes/accounts'
import { handleUpdateScore, handleUserInfo, handleLeaderboard, handleGetLevelScores, handleUpdateAttempts } from './routes/game'
import { handleGetLevels, handleUploadLevel, handleDownloadLevel, handleGetLevelLists, handleUploadLevelList, handleGetEventLevels, handleSuggestStars } from './routes/levels'
import {
  handleSaveData, handleSyncData,
  handleGetRewards, handleGetDailyWeekly,
  handleGetFriends, handleGetFriendRequests, handleSendFriendRequest, handleFriendOrBlockStub,
  handleGetMessages, handleSendMessage, handleReadMessage, handleDeleteMessage,
  handleGetChallenges,
  handleGetGauntlets,
  handleGetMapPacks,
  handleLikeItem,
  handleGetProfileComments, handleUploadProfileComment, handleDeleteProfileComment,
  handleGetLevelComments, handleUploadLevelComment, handleDeleteLevelComment,
  handleGetCommentHistory,
  handleDeleteLevel,
  handleGetSongInfo,
  handleRequestUserAccess,
  handleRateStars,
  handleRateDemon,
  handleRateQuality,
  handleVerifyCoins,
  handleBanUser,
} from './routes/extras'
import { log } from './lib/logger'

function writeLog(entry: string) {
  process.stdout.write(entry + '\n')
}

const SENSITIVE_FIELDS = new Set(['gjp2', 'gjp', 'password', 'secret', 'comment', 'body', 'saveData', 'saveData2'])

const app = new Hono()

const postBurstCache = new Map<string, { ts: number; count: number }>()
const BURST_WINDOW   = 8_000

app.use('*', async (c, next) => {
  const method    = c.req.method
  const url       = new URL(c.req.url)
  const path      = url.pathname
  const query     = url.search
  const timestamp = new Date().toISOString()

  const headers: Record<string, string> = {}
  c.req.raw.headers.forEach((v, k) => { headers[k] = v })

  let body: Record<string, string> = {}
  if (method === 'POST') {
    const parsed = await c.req.parseBody()
    for (const [k, v] of Object.entries(parsed)) {
      body[k] = typeof v === 'string' ? v : String(v)
    }
    c.set('body' as never, body)
  }

  await next()

  let responseText = ''
  try { responseText = await c.res.clone().text() } catch {}
  const status = c.res.status

  const D = '═'.repeat(72)
  const lines: string[] = [
    '',
    D,
    `  [${timestamp}]  ${method}  ${path}${query}`,
    D,
  ]

  const SKIP_HEADERS = new Set(['accept-encoding', 'connection', 'host', 'content-length'])
  const usefulHeaders = Object.entries(headers).filter(([k]) => !SKIP_HEADERS.has(k))
  if (usefulHeaders.length > 0) {
    lines.push('  HEADERS:')
    for (const [k, v] of usefulHeaders) {
      lines.push(`    ${k}: ${v}`)
    }
  }

  if (method === 'POST') {
    const keys = Object.keys(body)
    lines.push('')
    if (keys.length === 0) {
      lines.push('  BODY: (пусто)')
    } else {
      lines.push('  BODY:')
      const maxKey = Math.max(...keys.map(k => k.length))
      for (const k of keys) {
        const v = SENSITIVE_FIELDS.has(k) ? '***' : body[k]
        const truncated = v.length > 150
          ? v.slice(0, 150) + ` …(всего ${v.length} симв.)`
          : v
        lines.push(`    ${k.padEnd(maxKey)}  =  ${truncated}`)
      }
    }
  }

  if (method === 'GET' && url.searchParams.size > 0) {
    lines.push('')
    lines.push('  QUERY:')
    url.searchParams.forEach((v, k) => lines.push(`    ${k} = ${v}`))
  }

  lines.push('')
  const respTrunc = responseText.length > 400
    ? responseText.slice(0, 400) + ` …(всего ${responseText.length} симв.)`
    : responseText
  lines.push(`  RESPONSE [${status}]:  ${respTrunc}`)
  lines.push(D)

  writeLog(lines.join('\n'))
})

// Защита админ-эндпоинтов: /admin/* требует ADMIN_TOKEN (?token= или X-Admin-Token).
// Fail-closed: без ADMIN_TOKEN админка закрыта.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''
app.use('*', async (c, next) => {
  const u = new URL(c.req.url)
  if (u.pathname.startsWith('/admin/')) {
    const token = u.searchParams.get('token') || c.req.header('x-admin-token') || ''
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) return c.text('Forbidden', 403)
  }
  await next()
})

// Rate-limit чувствительных эндпоинтов (анти-брутфорс/спам) по IP
const RL_WINDOW = 60_000
const RL_MAX = 15
const RL_PATHS = ['loginGJAccount', 'registerGJAccount', 'uploadGJComment', 'uploadGJMessage', 'uploadGJAccComment']
const rlCache = new Map<string, { ts: number; count: number }>()
app.use('*', async (c, next) => {
  const p = new URL(c.req.url).pathname
  const bucket = RL_PATHS.find(s => p.includes(s))
  if (bucket) {
    const ip = c.req.header('x-real-ip') || c.req.header('x-forwarded-for') || 'unknown'
    const key = ip + '|' + bucket
    const now = Date.now()
    const e = rlCache.get(key)
    if (!e || now - e.ts > RL_WINDOW) rlCache.set(key, { ts: now, count: 1 })
    else if (++e.count > RL_MAX) {
      log.warn('rateLimit', 'превышен лимит запросов', { ip, bucket, count: e.count, max: RL_MAX })
      return c.text('-1')
    }
    // Раньше кэш очищался целиком. Это давало обход: достаточно было
    // раздуть его запросами с разных IP, чтобы сбросить чужие счётчики.
    // Теперь выкидываем только протухшие записи.
    if (rlCache.size > 5000) {
      for (const [k, v] of rlCache) if (now - v.ts > RL_WINDOW) rlCache.delete(k)
    }
  }
  await next()
})

const MUSIC_DIR = join(import.meta.dir, '..', 'public', 'music')

const GD_CDN = 'https://geometrydashfiles.b-cdn.net'

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
}

app.get('*', async (c) => {
  const url    = new URL(c.req.url)
  const path   = url.pathname
  const songID = url.searchParams.get('songID')

  if (path.startsWith('/sfx/')) {
    try {
      const upstream = await fetch(`${GD_CDN}${path}`, { signal: AbortSignal.timeout(20000) })
      return new Response(upstream.body, {
        status:  upstream.status,
        headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream' },
      })
    } catch {
      return c.text('SFX upstream error', 502)
    }
  }

  if (path.startsWith('/music/')) {
    const filename = path.slice(7).replace(/[^a-zA-Z0-9._\-]/g, '')
    const filepath = join(MUSIC_DIR, filename)
    const ext      = extname(filename).toLowerCase()
    if (existsSync(filepath) && MIME[ext]) {
      const file = Bun.file(filepath)
      return new Response(file, {
        headers: { 'Content-Type': MIME[ext] ?? 'audio/mpeg' }
      })
    }
    try {
      const upstream = await fetch(`${GD_CDN}${path}`, { signal: AbortSignal.timeout(20000) })
      return new Response(upstream.body, {
        status:  upstream.status,
        headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'audio/ogg' },
      })
    } catch {
      return c.text('Not found', 404)
    }
  }

  // GET /admin/gauntlet?id=1&levels=101,102,103,104,105   → создать/обновить гаунтлет
  // GET /admin/gauntlet?id=1&delete=1                     → удалить гаунтлет
  // GET /admin/gauntlet                                   → список всех
  if (path === '/admin/mappack') {
    const { handleAdminMappack } = await import('./lib/special')
    return handleAdminMappack(url, c)
  }

  if (path === '/admin/seed-vault') {
    const { handleAdminSeedVault } = await import('./lib/special')
    return handleAdminSeedVault(url, c)
  }

  if (path === '/admin/advance') {
    const { handleAdminAdvance } = await import('./lib/special')
    return handleAdminAdvance(url, c)
  }

  // GET /admin/coins?levelId=123&verify=1|0
  if (path === '/admin/coins') {
    const { handleAdminCoins } = await import('./lib/special')
    return handleAdminCoins(url, c)
  }

  // GET /admin/rate?levelId=123&stars=7&feature=2  ИЛИ  ?levelId=123&demon=3
  if (path === '/admin/rate') {
    const { handleAdminRate } = await import('./lib/special')
    return handleAdminRate(url, c)
  }

  if (path === '/admin/gauntlet') {
    const { prisma } = await import('./lib/prisma')
    const { uuidToGDId } = await import('./lib/crypto')
    const id          = parseInt(url.searchParams.get('id') ?? '')
    const levelsParam = url.searchParams.get('levels') ?? ''
    const isDelete    = url.searchParams.get('delete') === '1'

    if (isNaN(id)) {
      const all = await prisma.gDGauntlet.findMany({ orderBy: { id: 'asc' } })
      if (all.length === 0) return c.text('Гаунтлетов нет')
      const lines = await Promise.all(all.map(async g => {
        const ids = g.levelIds.split(',').map(Number)
        const originals = await prisma.gDLevel.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, originalId: true },
        })
        const info = ids.map(id => {
          const l = originals.find(o => o.id === id)
          return l ? `${id}(orig:${l.originalId},"${l.name}")` : `${id}(не найден)`
        }).join(', ')
        return `Гаунтлет #${g.id}: [${info}]`
      }))
      return c.text(lines.join('\n'))
    }

    if (isDelete) {
      const existing = await prisma.gDGauntlet.findUnique({ where: { id } })
      if (!existing) return c.text(`Гаунтлет ${id} не найден`)
      const oldIds = existing.levelIds.split(',').map(Number).filter(n => !isNaN(n))
      await prisma.gDLevel.deleteMany({ where: { id: { in: oldIds }, isHidden: true } })
      await prisma.gDGauntlet.delete({ where: { id } })
      return c.text(`Гаунтлет ${id} и ${oldIds.length} скрытых копий удалены`)
    }

    const levelIds = levelsParam.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
    if (levelIds.length !== 5) {
      return c.text('Нужно ровно 5 ID уровней. Пример: /admin/gauntlet?id=1&levels=101,102,103,104,105')
    }

    const originals = await prisma.gDLevel.findMany({
      where: { id: { in: levelIds }, isHidden: false, isDeleted: false },
    })
    const missing = levelIds.filter(id => !originals.find(o => o.id === id))
    if (missing.length > 0) {
      return c.text(`Уровни не найдены или сами гаунтлет-копии: ${missing.join(', ')}`)
    }

    // Удаляем старые копии, если гаунтлет уже существует
    const existing = await prisma.gDGauntlet.findUnique({ where: { id } })
    if (existing) {
      const oldIds = existing.levelIds.split(',').map(Number).filter(n => !isNaN(n))
      await prisma.gDLevel.deleteMany({ where: { id: { in: oldIds }, isHidden: true } })
    }

    // Создаём скрытые копии (порядок соответствует levelIds)
    const sorted = levelIds.map(lid => originals.find(o => o.id === lid)!)
    const copies: number[] = []
    for (const orig of sorted) {
      const copy = await prisma.gDLevel.create({
        data: {
          profileId:      orig.profileId,
          name:           orig.name,
          description:    orig.description,
          levelData:      orig.levelData,
          version:        orig.version,
          length:         orig.length,
          objects:        orig.objects,
          stars:          orig.stars > 0 ? orig.stars : 1,   // минимум 1 звезда для трекинга прогрессии
          isRated:        true,
          difficulty:     orig.difficulty > 0 ? orig.difficulty : 10,
          isDemon:        orig.isDemon,
          demonDiff:      orig.demonDiff,
          isAuto:         orig.isAuto,
          isSent:         false,
          isEpic:         orig.isEpic,
          requestedStars: orig.requestedStars,
          coins:          orig.coins,
          verifiedCoins:  orig.verifiedCoins,
          downloads:      0,
          likes:          0,
          songId:         orig.songId,
          customSongId:   orig.customSongId,
          password:       '0',       // нельзя копировать из гаунтлета
          twoPlayer:      orig.twoPlayer,
          isUnlisted:     true,
          isHidden:       true,
          originalId:     orig.id,
          extra:          orig.extra,
        },
      })
      copies.push(copy.id)
    }

    await prisma.gDGauntlet.upsert({
      where:  { id },
      create: { id, levelIds: copies.join(',') },
      update: { levelIds: copies.join(',') },
    })

    const details = sorted.map((o, i) => `  ${i + 1}. "${o.name}" (orig #${o.id} → копия #${copies[i]})`).join('\n')
    return c.text(`Гаунтлет #${id} готов. Скрытые копии:\n${details}`)
  }

  if (path === '/admin/clear-messages') {
    const { prisma } = await import('./lib/prisma')
    const { count } = await prisma.gDMessage.deleteMany({})
    return c.text(`Удалено ${count} сообщений`)
  }
  if (path === '/admin/list-messages') {
    const { prisma } = await import('./lib/prisma')
    const msgs = await prisma.gDMessage.findMany({ include: { from: true, to: true } })
    return c.json(msgs.map(m => ({
      id: m.id, from: m.from.gdLogin, to: m.to.gdLogin,
      subject: m.subject, isRead: m.isRead,
      date: m.createdAt.toISOString()
    })))
  }

  // GET /admin/daily?levelId=123&type=0   (0=daily, 1=weekly, 2=event)
  if (path === '/admin/daily') {
    const { handleAdminDaily } = await import('./lib/special'); return handleAdminDaily(url, c)
    const { prisma } = await import('./lib/prisma')
    const levelId = parseInt(url.searchParams.get('levelId') ?? '')
    const type    = parseInt(url.searchParams.get('type')    ?? '0')
    if (!isNaN(levelId) && levelId > 0) {
      const level = await prisma.gDLevel.findUnique({ where: { id: levelId } })
      if (!level) return c.text(`Уровень ${levelId} не найден`)
      const last = await prisma.gDDailyLevel.findFirst({ where: { type }, orderBy: { number: 'desc' } })
      const number = (last?.number ?? 0) + 1
      await prisma.gDDailyLevel.create({ data: { levelId, type, number } })
      const names = ['daily', 'weekly', 'event']
      return c.text(`OK: ${names[type] ?? type} #${number} = уровень "${level.name}" (id=${levelId})`)
    }
    const slots = await prisma.gDDailyLevel.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { level: true },
    })
    return c.json(slots.map(s => ({
      type: ['daily','weekly','event'][s.type] ?? s.type,
      number: s.number, levelId: s.levelId,
      levelName: s.level.name,
      date: s.createdAt.toISOString(),
    })))
  }

  if (path.includes('getCustomContentURL')) {
    return c.text(process.env.GD_SERVER_URL ?? 'https://feargdps.duckdns.org')
  }
  if (path.includes('getAccountURL')) {
    return c.text(process.env.GD_SERVER_URL ?? 'https://feargdps.duckdns.org')
  }

  if (songID) {
    return handleGetSongInfo({ songID } as Record<string, string>, c)
  }
  return c.text('GD Server is running')
})

app.post('*', async (c) => {
  const body     = c.get('body' as never) as Record<string, string>
  const reqPath  = new URL(c.req.url).pathname

  if (reqPath.includes('getCustomContentURL')) {
    return c.text(process.env.GD_SERVER_URL ?? 'https://feargdps.duckdns.org')
  }
  if (reqPath.includes('getAccountURL')) {
    return c.text(process.env.GD_SERVER_URL ?? 'https://feargdps.duckdns.org')
  }

  if (reqPath.includes('getDailyLevel') || reqPath.includes('getGJDailyLevel')) {
    return handleGetDailyWeekly(body, c)
  }
  if (reqPath.includes('backupGJAccountNew')) return handleSaveData(body, c)
  if (reqPath.includes('syncGJAccountNew'))   return handleSyncData(body, c)

  if (reqPath.includes('uploadGJLevelList') || reqPath.includes('UploadLevelList')) return handleUploadLevelList(body, c)
  if (reqPath.includes('LevelList') || reqPath.includes('levelList')) return handleGetLevelLists(body, c)

  if (reqPath.includes('deleteGJLevelUser'))    return handleDeleteLevel(body, c)
  if (reqPath.includes('deleteGJComment'))      return handleDeleteLevelComment(body, c)
  if (reqPath.includes('deleteGJAccComment') || reqPath.includes('deleteGJAccountComment')) return handleDeleteProfileComment(body, c)
  if (reqPath.includes('requestUserAccess')) return handleRequestUserAccess(body, c)
  if (reqPath.includes('feargModSpecial')) { const { handleModSetSpecial } = await import('./lib/special'); return handleModSetSpecial(body, c) }
  if (reqPath.includes('getGJUsers')) { const { handleGetUsers } = await import('./routes/users'); return handleGetUsers(body, c) }

  // Обновление счёта игрока после прохождения уровня.
  // GD ждёт ответ, чтобы зафиксировать прогрессию (гаунтлет, звёзды и т.д.).
  // Возвращаем ранг = 1 (любое положительное число).
  if (reqPath.includes('updateGJUserScore')) return handleUpdateScore(body, c)
  if (reqPath.includes('suggestGJStars')) return handleSuggestStars(body, c)
  if (reqPath.includes('rateGJStars'))   return handleRateStars(body, c)
  if (reqPath.includes('rateGJDemon')) return handleRateDemon(body, c)
  if (reqPath.includes('feargRateQuality'))  return handleRateQuality(body, c)
  if (reqPath.includes('feargBanUser')) return handleBanUser(body, c)
  if (reqPath.includes('feargVerifyCoins'))  return handleVerifyCoins(body, c)
  if (reqPath.includes('feargUpdateAttempts')) return handleUpdateAttempts(body, c)
  if (reqPath.includes('getGJLevelScores') || reqPath.includes('LevelScores')) return handleGetLevelScores(body, c)
  if (reqPath.includes('MapPacks') || reqPath.includes('mapPacks')) return handleGetMapPacks(body, c)
  if (reqPath.includes('EventLevels') || reqPath.includes('eventLevels')) return handleGetEventLevels(body, c)

  // Друзья и заявки — роутим по пути (иначе acceptGJFriendRequest перехватывает targetAccountID→userInfo)
  if (reqPath.includes('uploadFriendRequest'))   return handleSendFriendRequest(body, c)
  if (reqPath.includes('getGJFriendRequests'))   return handleGetFriendRequests(body, c)
  if (reqPath.includes('acceptGJFriendRequest')) return handleFriendOrBlockStub(body, c)
  if (reqPath.includes('deleteGJFriendRequest')) return handleFriendOrBlockStub(body, c)
  if (reqPath.includes('readGJFriendRequest'))   return c.text('1')
  if (reqPath.includes('removeGJFriend'))        return handleFriendOrBlockStub(body, c)
  if (reqPath.includes('blockGJUser'))           return handleFriendOrBlockStub(body, c)
  if (reqPath.includes('unblockGJUser'))         return handleFriendOrBlockStub(body, c)

  if (body.vkey !== undefined) return handleGetGauntlets(body, c)
  if (body.email) return handleRegister(body, c)
  if (body.saveData !== undefined) return handleSaveData(body, c)

  if (body.levelString !== undefined) return handleUploadLevel(body, c)
  if (body.levelID !== undefined && body.comment !== undefined) return handleUploadLevelComment(body, c)
  if (body.levelID !== undefined && body.page    !== undefined) return handleGetLevelComments(body, c)
  if (body.levelID !== undefined) return handleDownloadLevel(body, c)

  if (body.comment !== undefined) return handleUploadProfileComment(body, c)
  if (body.targetAccountID !== undefined && body.page !== undefined) return handleGetProfileComments(body, c)
  if (body.targetAccountID !== undefined) return handleUserInfo(body, c)

  if (body.stars !== undefined) return handleUpdateScore(body, c)
  if (body.like !== undefined && body.itemID !== undefined) return handleLikeItem(body, c)

  if ((body.type === '0' || body.type === '1') && body.gjp2 && body.str === undefined) return handleGetFriends(body, c)

  if (body.weekly !== undefined) return handleGetDailyWeekly(body, c)
  if (body.type !== undefined && body.str === undefined && body.page === undefined) {
    const t = parseInt(body.type as string)
    if (!isNaN(t) && t <= 2) return handleGetDailyWeekly(body, c)
  }

  if (body.gauntlet !== undefined) return handleGetLevels(body, c)

  if (body.type !== undefined) {
    const t = parseInt(body.type)
    if (isNaN(t)) return handleLeaderboard(body, c)
    if (t >= 100) return handleLeaderboard(body, c)
    return handleGetLevels(body, c)
  }

  if (body.rewardType !== undefined) return handleGetRewards(body, c)
  if (body.songID !== undefined) return handleGetSongInfo(body, c)
  if (body.chk !== undefined && !body.comment && !body.ctype) return handleGetChallenges(body, c)

  if (body.toAccountID !== undefined && body.subject !== undefined) return handleSendMessage(body, c)
  if (body.messageID   !== undefined && body.body    !== undefined) return handleReadMessage(body, c)
  if (body.messageID   !== undefined) return handleDeleteMessage(body, c)

  if (body.userID !== undefined && body.mode !== undefined) return handleGetCommentHistory(body, c)

  if (
    body.mode     !== undefined &&
    body.total    !== undefined &&
    body.gjp2 &&
    body.levelID  === undefined
  ) {
    const targetID = (body.targetAccountID as string) || (body.accountID as string)
    const b = { ...body, targetAccountID: targetID }
    return handleGetProfileComments(b as Record<string, string>, c)
  }

  if (reqPath.includes('FriendRequests')) return handleGetFriendRequests(body, c)
  if (reqPath.includes('AccountComments')) {
    const b = { ...body, targetAccountID: body.targetAccountID ?? body.accountID }
    return handleGetProfileComments(b as Record<string, string>, c)
  }
  if (reqPath.includes('Messages')) return handleGetMessages(body, c)
  if (body.getSent !== undefined) return handleGetFriendRequests(body, c)

  if (
    body.gjp2 && body.accountID &&
    (body.udID !== undefined || body.udid !== undefined) &&
    body.saveData  === undefined &&
    body.total     === undefined &&
    body.stars     === undefined &&
    body.type      === undefined &&
    body.comment   === undefined &&
    body.levelID   === undefined &&
    body.like      === undefined
  ) return handleSyncData(body, c)

  // type + str = поиск уровней (type=25 — уровни из листа); не давать перехватить burst cache
  if (body.type !== undefined && body.str !== undefined) {
    const t = parseInt(body.type as string)
    if (!isNaN(t)) return handleGetLevels(body, c)
  }

  if (body.total !== undefined && body.gjp2) {
    const totalCount = parseInt(body.total as string) || 0
    const targetID   = (body.targetAccountID as string) || (body.accountID as string)
    const key        = `${body.accountID as string}:${(body.page as string) ?? '0'}`
    const now        = Date.now()
    const entry      = postBurstCache.get(key)

    if (totalCount > 0) {
      postBurstCache.set(key, { ts: now, count: 1 })
      const b = { ...body, targetAccountID: targetID }
      return handleGetProfileComments(b as Record<string, string>, c)
    }

    if (!entry || now - entry.ts > BURST_WINDOW) {
      postBurstCache.set(key, { ts: now, count: 1 })
      const b = { ...body, targetAccountID: targetID }
      return handleGetProfileComments(b as Record<string, string>, c)
    } else if (entry.count === 1) {
      postBurstCache.set(key, { ts: entry.ts, count: 2 })
      return handleGetMessages(body, c)
    } else if (entry.count === 2) {
      postBurstCache.set(key, { ts: entry.ts, count: 3 })
      return handleGetFriendRequests(body, c)
    } else {
      postBurstCache.set(key, { ts: entry.ts, count: entry.count + 1 })
      return c.text('-2')
    }
  }

  if (body.toAccountID    !== undefined) return handleSendFriendRequest(body, c)
  if (body.requestID      !== undefined) return handleFriendOrBlockStub(body, c)
  if (body.blockAccountID !== undefined) return handleFriendOrBlockStub(body, c)

  if (body.gjp2 && body.accountID) return handleSyncData(body, c)
  if (body.gjp2 || body.password) return handleLogin(body, c)

  return c.text('-1')
})

const NO_TLS   = process.env.GD_NO_TLS === '1'
const PORT     = parseInt(process.env.GD_PORT ?? '443')
const certPath = process.env.GD_CERT ?? './127.0.0.1.pem'
const keyPath  = process.env.GD_KEY  ?? './127.0.0.1-key.pem'

log('startup', 'сервер запущен', { port: PORT, protocol: NO_TLS ? 'http' : 'https' })

export default {
  port: PORT,
  fetch: app.fetch,
  ...(NO_TLS ? {} : {
    tls: {
      cert: Bun.file(certPath),
      key:  Bun.file(keyPath),
    },
  }),
}
