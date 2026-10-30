import { Context } from 'hono'
import { prisma } from '../lib/prisma'
import { uuidToGDId } from '../lib/crypto'
import { createHash } from 'crypto'
import { deflateSync } from 'zlib'
import { getActiveIcon, findProfile, gdAge } from '../lib/gdHelpers'
import { GD_OFFICIAL_SONGS, makeSongKV, getSongStr } from '../lib/songs'
import { hitLimit, blockedResponse } from '../lib/rateLimit'
import { notifyRate } from '../lib/notifyBot'
import { log } from '../lib/logger'

type Body = Record<string, string | File>

// XOR + base64 — универсальная функция (base64EncodeEnc из GD)
function xorEncode(text: string, key: string): string {
  const buf = Buffer.from(text, 'utf8')
  const xored = buf.map((b, i) => b ^ key.charCodeAt(i % key.length))
  return Buffer.from(xored).toString('base64')
}

// XOR-кодирование тела сообщения (ключ 14251) + base64
function encodeMessageBody(text: string): string {
  return xorEncode(text, '14251')
}

// Кодирование контента комментария для ответа сервера (ключ 26364)
function encodeCommentContent(storedBase64: string): string {
  let text = storedBase64
  try { text = Buffer.from(storedBase64, 'base64').toString('utf8') } catch {}
  return xorEncode(text, '26364')
}

function decodeMessageBody(encoded: string): string {
  try {
    const buf    = Buffer.from(encoded, 'base64')
    const key    = '14251'
    const xored  = buf.map((b, i) => b ^ key.charCodeAt(i % key.length))
    return Buffer.from(xored).toString('utf8')
  } catch { return encoded }
}

export async function handleSaveData(body: Body, c: Context) {
  const accountID = body.accountID as string
  const saveData  = ((body.saveData  as string) || '').replace(/ /g, '+')
  const saveData2 = ((body.saveData2 as string) || '').replace(/ /g, '+')
  const gjp2      = body.gjp2 as string

  if (!accountID || !saveData) { log.warn('saveData', 'нет accountID или saveData'); return c.text('-1') }

  const profile = await findProfile(accountID)
  if (!profile) { log.warn('saveData', `профиль ${accountID} не найден`); return c.text('-1') }
  if (!gjp2 || gjp2 !== profile.gdPassword) {
    // gjp2 — производная от пароля, в лог его писать нельзя: достаточно факта отказа.
    log.warn('saveData', 'отклонено: неверный gjp2', { login: profile.gdLogin })
    return c.text('-1')
  }

  const updateData: any = { saveData }
  if (saveData2) updateData.saveData2 = saveData2

  await prisma.gDProfile.update({ where: { id: profile.id }, data: updateData })
  log('saveData', `сохранено для ${profile.gdLogin} (${saveData.length} + ${saveData2.length} байт)`)
  return c.text('1')
}

export async function handleSyncData(body: Body, c: Context) {
  const accountID     = body.accountID    as string
  const gjp2          = body.gjp2         as string
  const gameVersion   = (body.gameVersion   as string) || '22'
  const binaryVersion = (body.binaryVersion as string) || '47'

  if (!accountID) { log.warn('syncData', 'нет accountID'); return c.text('-1') }

  const profile = await findProfile(accountID)
  if (!profile) { log.warn('syncData', `профиль ${accountID} не найден`); return c.text('-1') }

  if (!gjp2 || gjp2 !== profile.gdPassword) {
    log.warn('syncData', 'отклонено: неверный gjp2', { login: profile.gdLogin })
    return c.text('-1')
  }

  if (!profile.saveData) {
    log.warn('syncData', `нет saveData для ${profile.gdLogin}`)
    return c.text('-1')
  }

  const ratedLevels = await prisma.gDLevel.findMany({
    where:  { stars: { gt: 0 }, isDeleted: false },
    select: { id: true, stars: true },
  })
  const ratedStr = ratedLevels.map(l => `${l.id},${l.stars}`).join(',')

  const mapPacks = await prisma.gDMapPack.findMany()
  const packsStr = mapPacks.map(p =>
    `1:${p.id}:3:${p.name}:4:${p.stars}:5:${p.coins}`
  ).join('|')

  const ratedSection = makeDeflateSection(ratedStr)
  const packsSection = makeDeflateSection(packsStr)

  const response = `${profile.saveData};${gameVersion};${binaryVersion};${ratedSection};${packsSection}`

  log('syncData', `отдаём saveData для ${profile.gdLogin} (${profile.saveData.length} байт), rated=${ratedLevels.length}`)
  return c.text(response)
}

function makeDeflateSection(data: string): string {
  const compressed = deflateSync(Buffer.from(data, 'utf8'))
  const b64 = compressed.toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
  return randomStr(20) + b64 + randomStr(20)
}

function randomStr(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let r = ''
  for (let i = 0; i < len; i++) r += chars[Math.floor(Math.random() * chars.length)]
  return r
}

function xorCycle(buf: Buffer, key: string): Buffer {
  return Buffer.from(buf.map((b, i) => b ^ key.charCodeAt(i % key.length)))
}

function decodeChkNumber(chk: string, key = '59182'): string {
  try {
    const encoded = chk.slice(5)
    const decoded = xorCycle(Buffer.from(encoded, 'base64'), key).toString('utf8')
    return decoded.replace(/[^\d]/g, '') || '0'
  } catch { return '0' }
}

function encodeRewardData(data: string): string {
  const xored = xorCycle(Buffer.from(data, 'utf8'), '59182')
  return xored.toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
}

function rewardHash(encoded: string): string {
  return createHash('sha1').update(encoded + 'pC26fpYaQCtg').digest('hex')
}

export async function handleGetRewards(body: Body, c: Context) {
  const rewardType = parseInt(body.rewardType as string) || 0
  const accountID  = body.accountID as string
  const udid       = (body.udID as string) || (body.udid as string) || '0'
  const chk        = (body.chk as string) || ''

  const profile = accountID ? await findProfile(accountID) : null
  if (!profile) { log.warn('rewards', `профиль ${accountID} не найден`); return c.text('-1') }

  const now           = new Date()
  const cooldownSmall = 4  * 60 * 60 * 1000
  const cooldownLarge = 24 * 60 * 60 * 1000
  const playerGdId    = uuidToGDId(profile.id)

  const chkNumber = decodeChkNumber(chk)

  let smallLeft = profile.lastSmallChest
    ? Math.max(0, cooldownSmall - (now.getTime() - profile.lastSmallChest.getTime()))
    : 0
  let largeLeft = profile.lastLargeChest
    ? Math.max(0, cooldownLarge - (now.getTime() - profile.lastLargeChest.getTime()))
    : 0

  let smallCount = profile.smallChestCount
  let largeCount = profile.largeChestCount

  if (rewardType === 1 && smallLeft === 0) {
    await prisma.gDProfile.update({
      where: { id: profile.id },
      data: { lastSmallChest: now, smallChestCount: { increment: 1 } }
    })
    smallCount += 1
    smallLeft = cooldownSmall
    log('rewards', `малый сундук #${smallCount} выдан для ${profile.gdLogin}`)
  } else if (rewardType === 2 && largeLeft === 0) {
    await prisma.gDProfile.update({
      where: { id: profile.id },
      data: { lastLargeChest: now, largeChestCount: { increment: 1 } }
    })
    largeCount += 1
    largeLeft = cooldownLarge
    log('rewards', `большой сундук #${largeCount} выдан для ${profile.gdLogin}`)
  }

  const smallSecs = Math.ceil(smallLeft / 1000)
  const largeSecs = Math.ceil(largeLeft / 1000)

  const rs = randomStr(5)

  const data = [
    rs,
    playerGdId,
    chkNumber,
    udid,
    playerGdId,
    smallSecs,
    '50,2,0,0',
    smallCount,
    largeSecs,
    '250,6,0,0',
    largeCount,
    rewardType,
  ].join(':')

  const encoded = encodeRewardData(data)
  const hash = rewardHash(encoded)

  const prefix = randomStr(5)
  log('rewards', `type=${rewardType} ${profile.gdLogin}: small=${smallSecs}с large=${largeSecs}с`)
  return c.text(`${prefix}${encoded}|${hash}`)
}

export async function handleGetDailyWeekly(body: Body, c: Context) {
  const rawType = body.type !== undefined ? body.type : body.weekly
  const type    = parseInt(rawType as string)
  if (isNaN(type)) return c.text('-1')

  const typeStr = ['daily', 'weekly', 'event'][type] ?? `type=${type}`

  const slot = await prisma.gDDailyLevel.findFirst({ where: { type, activatedAt: { not: null } }, orderBy: { activatedAt: 'desc' } })
  if (!slot) { log('daily', `${typeStr}: нет активного уровня`); return c.text('-1') }

  let secondsLeft: number
  if (type === 2) {
    secondsLeft = 10
  } else if (type === 1) {
    const now  = new Date()
    const next = new Date(now)
    next.setUTCDate(now.getUTCDate() + ((1 - now.getUTCDay() + 7) % 7 || 7))
    next.setUTCHours(0, 0, 0, 0)
    secondsLeft = Math.max(1, Math.floor((next.getTime() - now.getTime()) / 1000))
  } else {
    const now  = new Date()
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    secondsLeft = Math.max(1, Math.floor((next.getTime() - now.getTime()) / 1000))
  }

  // По официальному протоколу getGJDailyLevel только EVENT (type=2)
  // возвращает доп. chest-хендшейк (rs:playerGdId:chk:...|hash) —
  // daily/weekly должны отдавать короткий "number|secondsLeft".
  // (Проверено: добавление хендшейка для daily/weekly сломало формат ещё сильнее.)
  if (type === 2) {
    const accountID  = body.accountID as string
    const udid       = (body.udID as string) || (body.udid as string) || '0'
    const chk        = (body.chk  as string) || ''
    const chkNumber  = decodeChkNumber(chk)

    const profile    = accountID ? await findProfile(accountID) : null
    const playerGdId = profile ? uuidToGDId(profile.id) : '0'

    const rs   = randomStr(5)
    const data = [rs, playerGdId, chkNumber, udid, playerGdId,
                  0, '0,0,0,0', 0, 0, '0,0,0,0', 0, 0].join(':')

    const encoded = encodeRewardData(data)
    const prefix  = randomStr(5)
    const hash = rewardHash(prefix + encoded)

    log('daily', `event: number=${slot.number} chk=${chkNumber} playerGdId=${playerGdId}`)
    return c.text(`${slot.number}|${secondsLeft}|${prefix}${encoded}|${hash}`)
  }

  log('daily', `${typeStr}: number=${slot.number} secondsLeft=${secondsLeft}`)
  return c.text(`${slot.number}|${secondsLeft}`)
}

// GD-эндпоинт getGJSongInfo
export async function handleGetSongInfo(body: Body, c: Context) {
  const songIDStr = body.songID as string
  if (!songIDStr) { log.warn('songInfo', 'нет songID'); return c.text('-1') }
  const songID = parseInt(songIDStr)
  if (isNaN(songID) || songID < 0) { log.warn('songInfo', `невалидный songID=${songIDStr}`); return c.text('-1') }

  const kv = await getSongStr(songID)
  if (!kv) { log.warn('songInfo', `песня ${songID} не найдена`); return c.text('-1') }

  log.debug('songInfo', 'песня выдана', { songID })
  return c.text(kv)
}

export async function handleGetFriends(body: Body, c: Context) {
  const accountID = body.accountID as string
  const type      = parseInt(body.type as string) || 0
  if (!accountID) { log.warn('friends', 'нет accountID'); return c.text('-1') }

  const profile = await findProfile(accountID)
  if (!profile) { log.warn('friends', `профиль ${accountID} не найден`); return c.text('-1') }

  const status = type === 1 ? 'BLOCKED' : 'ACCEPTED'

  const friendships = await prisma.gDFriendship.findMany({
    where: {
      OR: [{ fromId: profile.id }, { toId: profile.id }],
      status: status as any,
    },
    include: { from: true, to: true },
  })

  log('friends', `list для ${profile.gdLogin}: найдено ${friendships.length} (status=${status})`)
  if (friendships.length === 0) return c.text('-2')

  const rows = friendships.map(f => {
    const friend   = f.fromId === profile.id ? f.to : f.from
    const friendId = uuidToGDId(friend.id)
    return [
      `1:${friend.gdLogin}`,
      `2:${friendId}`,
      `9:${getActiveIcon(friend)}`,
      `10:${friend.color1}`,
      `11:${friend.color2}`,
      `14:${friend.iconType}`,
      `15:${friend.glowEnabled ? 1 : 0}`,
      `16:${friendId}`,
      `18:${friend.messageState}`,
      `41:0`,
      `44:0`,
    ].join(':')
  })

  return c.text(`${rows.join('|')}#${rows.length}:0:${rows.length}`)
}

export async function handleGetFriendRequests(body: Body, c: Context) {
  const accountID = body.accountID as string
  const getSent   = (body.getSent as string) === '1'
  if (!accountID) { log.warn('friendReqs', 'нет accountID'); return c.text('-1') }

  const profile = await findProfile(accountID)
  if (!profile) { log.warn('friendReqs', `профиль ${accountID} не найден`); return c.text('-1') }

  const requests = await prisma.gDFriendship.findMany({
    where: getSent
      ? { fromId: profile.id, status: 'PENDING' }
      : { toId:   profile.id, status: 'PENDING' },
    include: { from: true, to: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  log('friendReqs', `для ${profile.gdLogin} (getSent=${getSent}): ${requests.length} заявок`)
  if (requests.length === 0) return c.text('#0:0:0')

  const rows = requests.map(r => {
    const other   = getSent ? r.to : r.from
    const otherId = uuidToGDId(other.id)
    return [
      `1:${other.gdLogin}`,
      `2:${otherId}`,
      `9:${getActiveIcon(other)}`,
      `10:${other.color1}`,
      `11:${other.color2}`,
      `14:${other.iconType}`,
      `15:${other.glowEnabled ? 1 : 0}`,
      `16:${otherId}`,
      `32:${otherId}`,
      `35:`,
      `41:0`,
      `44:0`,
    ].join(':')
  })

  return c.text(`${rows.join('|')}#${rows.length}:0:20`)
}

export async function handleSendFriendRequest(body: Body, c: Context) {
  const accountID   = body.accountID   as string
  const toAccountID = body.toAccountID as string
  if (!accountID || !toAccountID) { log.warn('friendReqs', 'нет accountID/toAccountID'); return c.text('-1') }

  const rlFr = hitLimit('friendreq', accountID)
  if (!rlFr.ok) { log.warn('friendReqs', `лимит заявок для ${accountID}`); return blockedResponse(c, rlFr, 'generic') }

  const from = await findProfile(accountID)
  const to   = await findProfile(toAccountID)
  if (!from || !to) { log.warn('friendReqs', 'профиль не найден'); return c.text('-1') }
  if (from.id === to.id) return c.text('-1')

  const blocked = await prisma.gDFriendship.findFirst({
    where: {
      OR: [
        { fromId: from.id, toId: to.id },
        { fromId: to.id, toId: from.id },
      ],
      status: 'BLOCKED',
    }
  })
  if (blocked) { log.warn('friendReqs', 'заблокирован'); return c.text('-1') }

  const existing = await prisma.gDFriendship.findFirst({
    where: {
      OR: [
        { fromId: from.id, toId: to.id },
        { fromId: to.id, toId: from.id },
      ]
    }
  })
  if (existing) { log.warn('friendReqs', `уже существует (${existing.status})`); return c.text('1') }

  await prisma.gDFriendship.create({ data: { fromId: from.id, toId: to.id, status: 'PENDING' } })
  log('friendReqs', 'заявка отправлена', { from: from.gdLogin, to: to.gdLogin })
  return c.text('1')
}

// Принять/отклонить заявку, удалить друга, заблокировать
export async function handleFriendOrBlockStub(body: Body, c: Context) {
  const path      = new URL(c.req.url).pathname
  const accountID = body.accountID as string
  if (!accountID) return c.text('-1')

  const profile = await findProfile(accountID)
  if (!profile) return c.text('-1')

  const targetIdStr = (body.targetAccountID as string) || (body.blockAccountID as string) || ''
  const pair = (a: string, b: string) => ({ OR: [{ fromId: a, toId: b }, { fromId: b, toId: a }] })

  if (path.includes('blockGJUser')) {
    const target = await findProfile(targetIdStr)
    if (!target) return c.text('-1')
    const existing = await prisma.gDFriendship.findFirst({ where: pair(profile.id, target.id) })
    if (existing) {
      await prisma.gDFriendship.update({ where: { id: existing.id }, data: { status: 'BLOCKED', fromId: profile.id, toId: target.id } })
    } else {
      await prisma.gDFriendship.create({ data: { fromId: profile.id, toId: target.id, status: 'BLOCKED' } })
    }
    log('friends', `${profile.gdLogin} заблокировал ${target.gdLogin}`)
    return c.text('1')
  }

  if (path.includes('unblockGJUser')) {
    const target = await findProfile(targetIdStr)
    if (!target) return c.text('-1')
    await prisma.gDFriendship.deleteMany({ where: { status: 'BLOCKED', ...pair(profile.id, target.id) } })
    log('friends', `${profile.gdLogin} разблокировал ${target.gdLogin}`)
    return c.text('1')
  }

  if (path.includes('removeGJFriend')) {
    const target = await findProfile(targetIdStr)
    if (!target) return c.text('-1')
    await prisma.gDFriendship.deleteMany({ where: { status: 'ACCEPTED', ...pair(profile.id, target.id) } })
    log('friends', `${profile.gdLogin} удалил из друзей ${target.gdLogin}`)
    return c.text('1')
  }

  if (path.includes('acceptGJFriendRequest')) {
    const requester = await findProfile(targetIdStr)
    if (!requester) return c.text('-1')
    const friendship = await prisma.gDFriendship.findFirst({
      where: { fromId: requester.id, toId: profile.id, status: 'PENDING' },
    })
    if (!friendship) { log.warn('friends', `заявка от ${targetIdStr} не найдена`); return c.text('1') }
    await prisma.gDFriendship.update({ where: { id: friendship.id }, data: { status: 'ACCEPTED' } })
    log('friends', `${profile.gdLogin} принял заявку от ${requester.gdLogin}`)
    return c.text('1')
  }

  if (path.includes('deleteGJFriendRequest')) {
    const other = await findProfile(targetIdStr)
    if (other) {
      await prisma.gDFriendship.deleteMany({ where: { status: 'PENDING', ...pair(profile.id, other.id) } })
      log('friends', `${profile.gdLogin} отклонил заявку ${other.gdLogin}`)
    }
    return c.text('1')
  }

  return c.text('1')
}

export async function handleGetMessages(body: Body, c: Context) {
  const accountID = body.accountID as string
  const getSent   = (body.getSent as string) === '1'
  if (!accountID) { log.warn('messages', 'нет accountID'); return c.text('-1') }

  const profile = await findProfile(accountID)
  if (!profile) { log.warn('messages', `профиль ${accountID} не найден`); return c.text('-1') }

  const messages = await prisma.gDMessage.findMany({
    where: getSent ? { fromId: profile.id } : { toId: profile.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { from: true, to: true },
  })

  log('messages', `для ${profile.gdLogin} (getSent=${getSent}): ${messages.length} сообщений`)
  if (messages.length === 0) return c.text('#0:0:0')

  const rows = messages.map(m => {
    const other   = getSent ? m.to : m.from
    const otherId = uuidToGDId(other.id)
    const subjectB64 = Buffer.from(m.subject).toString('base64')
    const isReadFlag = m.isRead ? 1 : 0
    const isSentFlag = getSent ? 1 : 0
    const date       = m.createdAt.toISOString().slice(0, 10).replace(/-/g, ',')
    return [
      `1:${m.id}`,
      `2:${otherId}`,
      `3:${otherId}`,
      `4:${subjectB64}`,
      `5:${m.body.length}`,
      `6:${other.gdLogin}`,
      `7:${date}`,
      `8:${isReadFlag}`,
      `9:${other.gdLogin}`,
      `10:${isSentFlag}`,
    ].join(':')
  })

  return c.text(`${rows.join('|')}#${rows.length}:0:10`)
}

export async function handleSendMessage(body: Body, c: Context) {
  const accountID   = body.accountID   as string
  const toAccountID = body.toAccountID as string
  const subject     = body.subject     as string
  const msgBody     = body.body        as string
  if (!accountID || !toAccountID) { log.warn('messages', 'нет accountID/toAccountID'); return c.text('-1') }

  const rlMsg = hitLimit('message', accountID)
  if (!rlMsg.ok) { log.warn('messages', `лимит сообщений для ${accountID}`); return blockedResponse(c, rlMsg, 'generic') }

  const from = await findProfile(accountID)
  const to   = await findProfile(toAccountID)
  if (!from || !to) { log.warn('messages', 'профиль не найден'); return c.text('-1') }

  let decodedSubject = subject || ''
  try { decodedSubject = Buffer.from(subject || '', 'base64').toString('utf8') } catch {}

  const decodedBody = decodeMessageBody(msgBody || '')

  const msg = await prisma.gDMessage.create({
    data: { fromId: from.id, toId: to.id, subject: decodedSubject, body: decodedBody }
  })
  log('messages', 'сообщение отправлено', { id: msg.id, from: from.gdLogin, to: to.gdLogin })
  return c.text(msg.id.toString())
}

export async function handleReadMessage(body: Body, c: Context) {
  const accountID = body.accountID as string
  const messageID = parseInt(body.messageID as string)
  if (!accountID || !messageID) { log.warn('messages', 'нет accountID/messageID'); return c.text('-1') }

  const profile = await findProfile(accountID)
  if (!profile) { log.warn('messages', `профиль ${accountID} не найден`); return c.text('-1') }

  const msg = await prisma.gDMessage.findUnique({
    where: { id: messageID },
    include: { from: true, to: true },
  })
  if (!msg) { log.warn('messages', `сообщение ${messageID} не найдено`); return c.text('-1') }
  if (msg.fromId !== profile.id && msg.toId !== profile.id) { log.warn('messages', 'нет доступа'); return c.text('-1') }

  if (!msg.isRead && msg.toId === profile.id) {
    await prisma.gDMessage.update({ where: { id: messageID }, data: { isRead: true } })
  }

  const encoded = encodeMessageBody(msg.body)
  log('messages', `прочитано id=${messageID} для ${profile.gdLogin}`)
  return c.text(encoded)
}

export async function handleDeleteMessage(body: Body, c: Context) {
  const accountID = body.accountID as string
  const messageID = parseInt(body.messageID as string)
  if (!accountID || !messageID) { log.warn('messages', 'нет accountID/messageID'); return c.text('-1') }

  const profile = await findProfile(accountID)
  if (!profile) { log.warn('messages', `профиль ${accountID} не найден`); return c.text('-1') }

  const msg = await prisma.gDMessage.findUnique({ where: { id: messageID } })
  if (!msg) { log.warn('messages', `сообщение ${messageID} не найдено`); return c.text('1') }
  if (msg.fromId !== profile.id && msg.toId !== profile.id) return c.text('-1')

  await prisma.gDMessage.delete({ where: { id: messageID } })
  log('messages', `удалено id=${messageID} для ${profile.gdLogin}`)
  return c.text('1')
}

export async function handleGetCommentHistory(body: Body, c: Context) {
  const userID = body.userID as string
  const page   = parseInt(body.page as string) || 0
  if (!userID) { log.warn('commentHistory', 'нет userID'); return c.text('-1') }

  const profile = await findProfile(userID)
  if (!profile) { log.warn('commentHistory', `профиль ${userID} не найден`); return c.text('-1') }

  const comments = await prisma.gDLevelComment.findMany({
    where:   { profileId: profile.id, isSpam: false, isDeleted: false },
    orderBy: { createdAt: 'desc' },
    skip:    page * 10,
    take:    10,
  })
  const total = await prisma.gDLevelComment.count({ where: { profileId: profile.id, isDeleted: false } })

  log('commentHistory', `для ${profile.gdLogin} page=${page}: ${comments.length} из ${total}`)
  if (comments.length === 0) return c.text('-2')

  const gdId       = uuidToGDId(profile.id)
  const activeIcon = getActiveIcon(profile)
  const encoded = comments.map(cm => {
    const date    = gdAge(cm.createdAt)
    const content = cm.content
    const cmPart   = `1~${cm.levelId}~2~${content}~3~${gdId}~4~${cm.likes}~7~0~10~${cm.percent}~9~${date}~6~${cm.id}`
    const userPart = `1~${profile.gdLogin}~2~${gdId}~9~${activeIcon}~10~${profile.color1}~11~${profile.color2}~14~${profile.iconType}~15~${profile.glowEnabled ? 1 : 0}~16~${gdId}`
    return `${cmPart}:${userPart}`
  })

  return c.text(`${encoded.join('|')}#${total}:${page}:10`)
}

// Анти-накрутка: rate-limit (accountID + IP) + дедуп в памяти на пару
// identifier×item, чтобы один пользователь не накручивал один и тот же объект.
const likedSet = new Set<string>()

export async function handleLikeItem(body: Body, c: Context) {
  const itemID   = parseInt(body.itemID as string) || 0
  const likeType = parseInt(body.type   as string) || 1
  const isLike   = parseInt(body.like   as string)
  if (isNaN(isLike) || itemID <= 0) return c.text('-1')

  const ip = c.req.header('x-real-ip')
    || c.req.header('cf-connecting-ip')
    || c.req.header('x-forwarded-for')?.split(',')[0].trim()
    || '127.0.0.1'
  const likeAccount = (body.accountID as string) || ''

  // Анти-бот: лимиты по аккаунту и по IP
  if (likeAccount && !hitLimit('like', likeAccount).ok) return c.text('-1')
  if (!hitLimit('like_ip', ip).ok) return c.text('-1')

  const profile = likeAccount ? await findProfile(likeAccount) : null
  const identifier = profile ? profile.id : ip

  // Дедуп: один identifier лайкает один объект один раз
  const dedupKey = `${likeType}:${itemID}:${identifier}`
  if (likedSet.has(dedupKey)) return c.text('1')
  likedSet.add(dedupKey)
  if (likedSet.size > 200_000) likedSet.clear()

  const delta = isLike === 1 ? 1 : -1
  try {
    if (likeType === 1)      await prisma.gDLevel.update({ where: { id: itemID }, data: { likes: { increment: delta } } })
    else if (likeType === 2) await prisma.gDLevelComment.update({ where: { id: itemID }, data: { likes: { increment: delta } } })
    else if (likeType === 3) await prisma.gDProfileComment.update({ where: { id: itemID }, data: { likes: { increment: delta } } })
  } catch { /* объект мог быть удалён — молча игнорируем */ }

  return c.text('1')
}

export async function handleGetGauntlets(_body: Body, c: Context) {
  const gauntlets = await prisma.gDGauntlet.findMany({ orderBy: { id: 'asc' } })
  if (gauntlets.length === 0) {
    const hash = createHash('sha1').update('xI25fpAapCQg').digest('hex')
    log('gauntlets', ' нет гантлетов')
    return c.text(`#${hash}`)
  }

  const rows = gauntlets.map(g => `1:${g.id}:3:${g.levelIds}`)
  const hashInput = gauntlets.map(g => `${g.id}${g.levelIds}`).join('') + 'xI25fpAapCQg'
  const hash = createHash('sha1').update(hashInput).digest('hex')
  log('gauntlets', 'выдан список', { count: gauntlets.length })
  return c.text(`${rows.join('|')}#${hash}`)
}

export async function handleGetMapPacks(body: Body, c: Context) {
  const page  = parseInt(body.page as string) || 0
  const limit = 10
  const [total, packs] = await Promise.all([
    prisma.gDMapPack.count(),
    prisma.gDMapPack.findMany({ orderBy: { id: 'asc' }, skip: page * limit, take: limit }),
  ])
  if (packs.length === 0) {
    const hash = createHash('sha1').update('xI25fpAapCQg').digest('hex')
    log('mappacks', ` нет паков`)
    return c.text(`#${total}:${page * limit}:${limit}#${hash}`)
  }
  const rows = packs.map(p =>
    `1:${p.id}:2:${p.name}:3:${p.levelIds}:4:${p.stars}:5:${p.coins}:6:${p.difficulty}:7:${p.color1}:8:${p.color2}`
  )
  const hashInput = packs.map(p => {
    const s = p.id.toString()
    return s[0] + s[s.length - 1] + p.stars + p.coins
  }).join('') + 'xI25fpAapCQg'
  const hash = createHash('sha1').update(hashInput).digest('hex')
  log('mappacks', 'выдан список', { count: packs.length, total })
  return c.text(`${rows.join('|')}#${total}:${page * limit}:${limit}#${hash}`)
}

// GD-эндпоинт getGJChallenges
export async function handleGetChallenges(body: Body, c: Context) {
  const accountID = body.accountID as string
  const udid      = (body.udID as string) || (body.udid as string) || (body.uuid as string) || '0'
  const chk       = (body.chk as string) || ''

  const profile      = accountID ? await findProfile(accountID) : null
  const playerGdId   = profile ? uuidToGDId(profile.id) : 0

  const chkNumber = decodeChkNumber(chk, '19847')

  const now  = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  const secondsLeft = Math.max(1, Math.floor((next.getTime() - now.getTime()) / 1000))

  const rs = randomStr(5)

  const data = [
    rs,
    playerGdId,
    chkNumber,
    udid,
    playerGdId,
    secondsLeft,
    '0,1,500,3,Orbmaster',
    '0,3,20,5,Stargazer',
    '0,2,5,4,Coinmaster',
  ].join(':')

  const encoded = xorCycle(Buffer.from(data, 'utf8'), '19847')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  const hash   = createHash('sha1').update(encoded + 'oC36fpYaPtdg').digest('hex')
  const prefix = randomStr(5)

  log('quests', `для ${profile?.gdLogin ?? 'anon'}, secondsLeft=${secondsLeft}`)
  return c.text(`${prefix}${encoded}|${hash}`)
}

export async function handleGetProfileComments(body: Body, c: Context) {
  const targetAccountID = (body.targetAccountID as string) || (body.accountID as string)
  if (!targetAccountID) { log.warn('profileComments', 'нет targetAccountID/accountID'); return c.text('-1') }

  const all     = await prisma.gDProfile.findMany()
  const profile = all.find(p => uuidToGDId(p.id) === parseInt(targetAccountID))
  if (!profile) { log.warn('profileComments', `профиль ${targetAccountID} не найден`); return c.text('-1') }

  const comments = await prisma.gDProfileComment.findMany({
    where: { profileId: profile.id, isSpam: false, isDeleted: false },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { author: true },
  })

  log('profileComments', `для ${profile.gdLogin}: найдено ${comments.length} постов`)
  if (comments.length === 0) return c.text('#0:0:10')

  const encoded = comments.map(cm => {
    const authorGdId = uuidToGDId(cm.author.id)
    const content    = cm.content
    const date       = gdAge(cm.createdAt)
    return `2~${content}~3~${authorGdId}~4~${cm.likes}~5~0~7~0~9~${date}~6~${cm.id}~16~${authorGdId}`
  })

  return c.text(`${encoded.join('|')}#${comments.length}:0:10`)
}

export async function handleUploadProfileComment(body: Body, c: Context) {
  const accountID       =   body.accountID       as string
  const rawComment      = ((body.comment         as string) || '').replace(/ /g, '+')
  const targetAccountID =  (body.targetAccountID as string) || accountID

  if (!accountID || !rawComment) { log.warn('profileComments', 'нет accountID или comment'); return c.text('-1') }
  
  const rlPost = hitLimit('post', accountID)
  if (!rlPost.ok) { log.warn('profileComments', `лимит постов для ${accountID}`); return blockedResponse(c, rlPost, 'post') }

  const all     = await prisma.gDProfile.findMany()
  const author  = all.find(p => uuidToGDId(p.id) === parseInt(accountID))
  const profile = all.find(p => uuidToGDId(p.id) === parseInt(targetAccountID))
  if (!author || !profile) { log.warn('profileComments', `автор или профиль не найден`); return c.text('-1') }
  if (author.isBanned) {log.warn('profileComments', `игрок ${author.gdLogin} (${author.id}) заблокирован`); return c.text('-1')}

  const content = rawComment.replace(/-/g, '+').replace(/_/g, '/')

  const created = await prisma.gDProfileComment.create({ data: { profileId: profile.id, authorId: author.id, content } })
  log('profileComments', `пост создан id=${created.id} на профиле ${profile.gdLogin} от ${author.gdLogin}`)
  return c.text('1')
}

export async function handleGetLevelComments(body: Body, c: Context) {
  const levelID = parseInt(body.levelID as string)
  const page    = parseInt(body.page    as string) || 0
  if (!levelID) { log.warn('levelComments', 'нет levelID'); return c.text('-1') }

  const comments = await prisma.gDLevelComment.findMany({
    where: { levelId: levelID, isSpam: false, isDeleted: false },
    orderBy: { createdAt: 'desc' },
    skip: page * 20,
    take: 20,
    include: { profile: true },
  })

  const total = await prisma.gDLevelComment.count({ where: { levelId: levelID, isDeleted: false } })
  log('levelComments', `levelId=${levelID} page=${page}: найдено ${comments.length} из ${total}`)
  if (comments.length === 0) return c.text('#0:0:20')

  const encoded = comments.map(cm => {
    const authorId   = uuidToGDId(cm.profile.id)
    const content    = cm.content
    const activeIcon = getActiveIcon(cm.profile)
    const date       = gdAge(cm.createdAt)
    const cmPart   = `2~${content}~3~${authorId}~4~${cm.likes}~7~0~10~${cm.percent}~9~${date}~6~${cm.id}`
    const userPart = `1~${cm.profile.gdLogin}~2~${authorId}~9~${activeIcon}~10~${cm.profile.color1}~11~${cm.profile.color2}~14~${cm.profile.iconType}~15~${cm.profile.glowEnabled ? 1 : 0}~16~${authorId}`
    return `${cmPart}:${userPart}`
  })

  return c.text(`${encoded.join('|')}#${total}:${page}:20`)
}

export async function handleUploadLevelComment(body: Body, c: Context) {
  const accountID = body.accountID as string
  const levelID   = parseInt(body.levelID as string)
  const rawComment = ((body.comment as string) || '').replace(/ /g, '+')
  const content    = rawComment.replace(/-/g, '+').replace(/_/g, '/')
  if (!accountID || !levelID || !content) { log.warn('levelComments', 'нет accountID/levelID/comment'); return c.text('-1') }

  const all     = await prisma.gDProfile.findMany()
  const profile = all.find(p => uuidToGDId(p.id) === parseInt(accountID))
  if (!profile) { log.warn('levelComments', `профиль ${accountID} не найден`); return c.text('-1') }
  if (profile.isBanned) {log.warn('levelComments', `игрок ${profile.gdLogin} (${profile.id}) заблокирован`); return c.text('-1')}

  // анти-спам комментариев. Модов не ограничиваем (используют команды рейтинга).
  if (profile.role !== 'ELDER_MODERATOR' && profile.role !== 'MODERATOR') {
    const rlC = hitLimit('comment', accountID)
    if (!rlC.ok) { log.warn('levelComments', `лимит комментариев для ${accountID}`); return blockedResponse(c, rlC, 'comment') }
  }

  const level = await prisma.gDLevel.findUnique({ where: { id: levelID } })
  if (!level) { log.warn('levelComments', `уровень ${levelID} не найден`); return c.text('-1') }

  // Мод-команды (только Elder/Mod)
  if (profile.role === 'ELDER_MODERATOR' || profile.role === 'MODERATOR') {
    let decoded = ''
    try { decoded = Buffer.from(content, 'base64').toString('utf8').trim() } catch {}

    if (decoded === '!unrate') {
      await prisma.gDLevel.update({
        where: { id: levelID },
        data: { stars: 0, isRated: false, isEpic: 0 }
      })
      log('levelComments', `!unrate применён к уровню ${levelID} модератором ${profile.gdLogin}`)
      return c.text('1')
    }
  }

  const percent = parseInt(body.percent as string) || 0
  const created = await prisma.gDLevelComment.create({ data: { levelId: levelID, profileId: profile.id, content, percent } })
  log('levelComments', `комментарий id=${created.id} к уровню ${levelID} от ${profile.gdLogin} (${percent}%)`)
  return c.text('1')
}

// Запрос статуса модератора
export async function handleRequestUserAccess(body: Body, c: Context) {
  const accountID = body.accountID as string
  if (!accountID) return c.text('-1')
  const all     = await prisma.gDProfile.findMany()
  const profile = all.find(p => uuidToGDId(p.id) === parseInt(accountID))
  if (!profile) return c.text('-1')
  if (profile.role === 'ELDER_MODERATOR') { log('requestAccess', 'роль подтверждена', { login: profile.gdLogin, role: 'elder_mod' }); return c.text('2') }
  if (profile.role === 'MODERATOR')       { log('requestAccess', 'роль подтверждена', { login: profile.gdLogin, role: 'mod' });       return c.text('1') }
  log('requestAccess', 'роль подтверждена', { login: profile.gdLogin, role: 'user' })
  return c.text('-1')
}

// Креатор-поинты: только рейтингованные ПУБЛИЧНЫЕ уровни (без скрытых копий).
export async function calcCp(profileId: string): Promise<number> {
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

// GD-эндпоинт rateGJStars.
// Только ELDER_MODERATOR (обычный MODERATOR сюда больше не допускается —
// это отдельный нативный экран RateLevelLayer, а не общая suggest-кнопка).
// Самооценка: если уровень принадлежит самому элдеру —
//   • первый заход  → просто ставим isSent=true (уходит другим элдерам), 'OWN_SENT'
//   • уже отправлен → ничего не трогаем, 'OWN_ALREADY_SENT'
const difficultySet = new Set<string>()

export async function handleRateStars(body: Body, c: Context) {
  const accountID = body.accountID as string
  const gjp2      = body.gjp2 as string
  const levelID   = parseInt(body.levelID as string)
  const stars     = parseInt(body.stars   as string)
  const feature   = parseInt(body.feature as string) || 0

  if (!accountID || !gjp2 || isNaN(levelID) || isNaN(stars)) return c.text('-1')

  const profile = await findProfile(accountID)
  if (!profile)                            return c.text('-1')
  if (gjp2 !== profile.gdPassword)         return c.text('-1')
      if (profile.role !== 'ELDER_MODERATOR' && profile.role !== 'MODERATOR') {
    const difficultyKey = `vote:${levelID}:${profile.id}`
    if (difficultySet.has(difficultyKey)) return c.text('1')  // уже голосовал этим аккаунтом — молча игнорируем повтор
    difficultySet.add(difficultyKey)
    if (difficultySet.size > 200_000) difficultySet.clear()
    return c.text('1')
  }
  if (profile.role !== 'ELDER_MODERATOR')  return c.text('-1')

  const level = await prisma.gDLevel.findUnique({ where: { id: levelID }, select: { profileId: true, isSent: true } })
  if (!level) return c.text('-1')

  if (level.profileId === profile.id) {
    if (level.isSent) return c.text('OWN_ALREADY_SENT')
    await prisma.gDLevel.update({ where: { id: levelID }, data: { isSent: true } })
    return c.text('OWN_SENT')
  }

  const difficulty = stars <= 1 ? 0 : stars === 2 ? 10 : stars === 3 ? 20 : stars <= 5 ? 30 : stars <= 7 ? 40 : 50

  const updatedLevel = await prisma.gDLevel.update({
    where: { id: levelID },
    data: { stars, isRated: stars > 0, isSent: false, isEpic: feature, difficulty, isAuto: stars === 1, isDemon: stars === 10 },
    select: { profileId: true }
  })

  if (updatedLevel.profileId) {
    const creatorPoints = await calcCp(updatedLevel.profileId)
    await prisma.gDProfile.update({
      where: { id: updatedLevel.profileId },
      data: { creatorPoints }
    })
  }

  void notifyRate({ type: 'stars', levelID, moderator: profile.gdLogin })

  return c.text('1')
}

// GD-эндпоинт rateGJDemon.
// Та же логика ролей/самооценки, что и в handleRateStars.
const demonSet = new Set<string>()

export async function handleRateDemon(body: Body, c: Context) {
  const accountID = body.accountID as string
  const gjp2      = body.gjp2 as string
  const levelID   = parseInt(body.levelID as string)
  const rating    = parseInt(body.rating  as string)

  if (!accountID || !gjp2 || isNaN(levelID) || isNaN(rating)) return c.text('-1')

  const profile = await findProfile(accountID)
  if (!profile)                            return c.text('-1')
  if (gjp2 !== profile.gdPassword)         return c.text('-1')
  if (profile.role !== 'ELDER_MODERATOR' && profile.role !== 'MODERATOR') {
    const difficultyKey = `vote:${levelID}:${profile.id}`
    if (demonSet.has(difficultyKey)) return c.text('1')  // уже голосовал этим аккаунтом — молча игнорируем повтор
    demonSet.add(difficultyKey)
    if (demonSet.size > 200_000) demonSet.clear()
    return c.text('1')
  }
  if (profile.role !== 'ELDER_MODERATOR')  return c.text('-1')

  const level = await prisma.gDLevel.findUnique({ where: { id: levelID }, select: { profileId: true, isSent: true } })
  if (!level) return c.text('-1')

  if (level.profileId === profile.id) {
    if (level.isSent) return c.text('OWN_ALREADY_SENT')
    await prisma.gDLevel.update({ where: { id: levelID }, data: { isSent: true } })
    return c.text('OWN_SENT')
  }

  const ratingToDemonDiff: Record<number, number> = { 1: 3, 2: 4, 3: 0, 4: 5, 5: 6 }
  const demonDiff = ratingToDemonDiff[rating] ?? 3

  const updatedLevel = await prisma.gDLevel.update({
    where: { id: levelID },
    data: { isDemon: true, demonDiff, difficulty: 50, isRated: true, stars: 10, isAuto: false },
    select: { profileId: true }
  })

  if (updatedLevel.profileId) {
    const creatorPoints = await calcCp(updatedLevel.profileId)
    await prisma.gDProfile.update({
      where: { id: updatedLevel.profileId },
      data: { creatorPoints }
    })
  }

  void notifyRate({ type: 'demon', levelID, moderator: profile.gdLogin })

  return c.text('1')
}

  // Нестандартный эндпоинт: в протоколе GD его нет, добавлен для кнопки бана.

  export async function handleBanUser(body: Body, c: Context) {
    const accountID       =          body.accountID       as string
    const gjp2            =          body.gjp2            as string
    const targetAccountID =          body.targetAccountID as string
    const level           = parseInt(body.level           as string)

    if (!accountID || !gjp2 || !targetAccountID || isNaN(level) || level < 0 || level > 2 ) {
      log.warn('banUser', 'невалидные параметры', { accountID, hasGjp2: !!gjp2, targetAccountID, level: body.level })
      return c.text('-1')
    }

    const profile = await findProfile(accountID)
    if (!profile) { log.warn('banUser', `банящий accountID=${accountID} не найден`); return c.text('-1') }
    if (gjp2 !== profile.gdPassword) { log.warn('banUser', 'отклонено: неверный gjp2', { login: profile.gdLogin }); return c.text('-1') }
    if (profile.role !== 'ELDER_MODERATOR') { log.warn('banUser', 'недостаточно прав, нужен ELDER_MODERATOR', { login: profile.gdLogin, role: profile.role }); return c.text('-1') }

    const targetProfile = await findProfile(targetAccountID)
    if (!targetProfile) { log.warn('banUser', `цель targetAccountID=${targetAccountID} не найдена`); return c.text('-1') }

    let bannedFromBoards: boolean
    let isBanned: boolean

    if (level === 0) {
      bannedFromBoards = false
      isBanned = false
      log('banUser', `Модератор ${profile.gdLogin} разблокировал ${targetProfile.gdLogin}`)
    } else if (level === 1) {
      bannedFromBoards = true
      isBanned = false
      log('banUser', `Модератор ${profile.gdLogin} заблокировал ${targetProfile.gdLogin} в лидербордах`)
    } else {
      bannedFromBoards = true
      isBanned = true
      log('banUser', `Модератор ${profile.gdLogin} полностью заблокировал ${targetProfile.gdLogin}`)
    }

    await prisma.gDProfile.update({
      where: { id: targetProfile.id },
      data: { bannedFromBoards, isBanned },
    })

    return c.text('1')
  }

// Статус бана игрока (для кнопки в моде — какую иконку показать)
//   POST /feargBanStatus  targetAccountID
// Ответ: "bannedFromBoards:isBanned", например "0:0"/"1:0"/"1:1". Доступно
// без проверки роли — это не действие, а просто чтение статуса (сам показ
// кнопок в UI уже гейтится элдер-проверкой на стороне мода).
export async function handleBanStatus(body: Body, c: Context) {
  const targetAccountID = body.targetAccountID as string
  if (!targetAccountID) return c.text('-1')

  const targetProfile = await findProfile(targetAccountID)
  if (!targetProfile) return c.text('-1')

  return c.text(`${targetProfile.bannedFromBoards ? 1 : 0}:${targetProfile.isBanned ? 1 : 0}`)
}

// Смена степени качества после первичной оценки (наш попап)
// Роль-авторизованный аналог /admin/rate, но только для isEpic —
// звёзды/сложность не трогает. Только ELDER_MODERATOR.
//   POST /feargRateQuality  accountID, gjp2, levelID, feature
export async function handleRateQuality(body: Body, c: Context) {
  const accountID =          body.accountID as string
  const gjp2      =          body.gjp2      as string
  const levelID   = parseInt(body.levelID   as string)
  const feature   = parseInt(body.feature   as string)

  if (!accountID || !gjp2 || isNaN(levelID) || isNaN(feature) || feature < 0 || feature > 4) return c.text('-1')

  const profile = await findProfile(accountID)
  if (!profile)                            return c.text('-1')
  if (gjp2 !== profile.gdPassword)         return c.text('-1')
  if (profile.role !== 'ELDER_MODERATOR')  return c.text('-1')

  const level = await prisma.gDLevel.findUnique({ where: { id: levelID }, select: { profileId: true, isRated: true } })
  if (!level) return c.text('-1')
  if (!level.isRated) return c.text('-2')  // ещё не оценён на звёзды — качество менять рано

  const updatedLevel = await prisma.gDLevel.update({
    where: { id: levelID },
    data: { isEpic: feature },
    select: { profileId: true }
  })

  if (updatedLevel.profileId) {
    const creatorPoints = await calcCp(updatedLevel.profileId)
    await prisma.gDProfile.update({
      where: { id: updatedLevel.profileId },
      data: { creatorPoints }
    })
  }

  void notifyRate({ type: 'quality', levelID, moderator: profile.gdLogin })

  return c.text('1')
}

// Нестандартный эндпоинт: роль-авторизованный аналог /admin/coins.
// Роль-авторизованный аналог /admin/coins. Только ELDER_MODERATOR.
//   POST /feargVerifyCoins  accountID, gjp2, levelID, verify (0|1)
export async function handleVerifyCoins(body: Body, c: Context) {
  const accountID = body.accountID as string
  const gjp2      = body.gjp2 as string
  const levelID   = parseInt(body.levelID as string)
  const verify    = body.verify as string

  if (!accountID || !gjp2 || isNaN(levelID) || (verify !== '0' && verify !== '1')) return c.text('-1')

  const profile = await findProfile(accountID)
  if (!profile)                            return c.text('-1')
  if (gjp2 !== profile.gdPassword)         return c.text('-1')
  if (profile.role !== 'ELDER_MODERATOR')  return c.text('-1')

  const level = await prisma.gDLevel.findUnique({ where: { id: levelID }, select: { id: true } })
  if (!level) return c.text('-1')

  await prisma.gDLevel.update({ where: { id: levelID }, data: { verifiedCoins: verify === '1' } })
  return c.text('1')
}

// GD-эндпоинт deleteGJLevelUser20
export async function handleDeleteLevel(body: Body, c: Context) {
  const accountID = body.accountID as string
  const levelID   = parseInt(body.levelID as string)
  if (!accountID || isNaN(levelID)) return c.text('-1')

  const all     = await prisma.gDProfile.findMany()
  const profile = all.find(p => uuidToGDId(p.id) === parseInt(accountID))
  if (!profile) return c.text('-1')

  const level = await prisma.gDLevel.findUnique({ where: { id: levelID } })
  if (!level) return c.text('-1')

  const isMod = profile.role === 'MODERATOR' || profile.role === 'ELDER_MODERATOR'
  if (level.profileId !== profile.id && !isMod) return c.text('-1')

  await prisma.gDLevel.update({ where: { id: levelID }, data: { isDeleted: true } })
  log('deleteLevel', `уровень ${levelID} скрыт (${profile.gdLogin})`)
  return c.text('1')
}

// Удаление комментария к уровню (deleteGJComment21)
export async function handleDeleteLevelComment(body: Body, c: Context) {
  const accountID = body.accountID as string
  const commentID = parseInt(body.commentID as string)
  if (!accountID || isNaN(commentID)) return c.text('-1')

  const all     = await prisma.gDProfile.findMany()
  const profile = all.find(p => uuidToGDId(p.id) === parseInt(accountID))
  if (!profile) return c.text('-1')

  const comment = await prisma.gDLevelComment.findUnique({ where: { id: commentID } })
  if (!comment) return c.text('-1')

  const isMod = profile.role === 'MODERATOR' || profile.role === 'ELDER_MODERATOR'
  if (comment.profileId !== profile.id && !isMod) return c.text('-1')

  await prisma.gDLevelComment.update({ where: { id: commentID }, data: { isDeleted: true } })
  log('deleteComment', `комментарий ${commentID} скрыт (${profile.gdLogin})`)
  return c.text('1')
}

// Удаление поста на профиле (deleteGJAccountComment20)
export async function handleDeleteProfileComment(body: Body, c: Context) {
  const accountID = body.accountID as string
  const commentID = parseInt(body.commentID as string)
  if (!accountID || isNaN(commentID)) return c.text('-1')

  const all     = await prisma.gDProfile.findMany()
  const profile = all.find(p => uuidToGDId(p.id) === parseInt(accountID))
  if (!profile) return c.text('-1')

  const comment = await prisma.gDProfileComment.findUnique({ where: { id: commentID } })
  if (!comment) return c.text('-1')

  const isMod = profile.role === 'MODERATOR' || profile.role === 'ELDER_MODERATOR'
  if (comment.authorId !== profile.id && comment.profileId !== profile.id && !isMod) return c.text('-1')

  await prisma.gDProfileComment.update({ where: { id: commentID }, data: { isDeleted: true } })
  log('deleteProfileComment', `пост ${commentID} скрыт (${profile.gdLogin})`)
  return c.text('1')
}
