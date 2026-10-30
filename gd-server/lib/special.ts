// Клон-схема для спец-контента
// Та же механика, что у гаунтлетов (см. /admin/gauntlet в index.ts):
// при добавлении уровня в мап-пак / daily / weekly / event сервер создаёт
// СКРЫТУЮ КОПИЮ уровня, и спец-контент ссылается именно на копию.
//   • isHidden   = true  → сервер жёстко исключает копию из ВСЕХ веток
//                          поиска (where.isHidden = false в getLevels),
//                          включая поиск по точному ID — не найти даже модом.
//   • isUnlisted = true  → не попадает в публичные списки.
//   • originalId         → ID уровня-источника (для отладки/связи).
//   • password = '0'     → копию нельзя скопировать в редакторе.
//   • stars >= 1, isRated → чтобы прохождение/прогрессия корректно трекались.
// Оригинал остаётся в поиске нетронутым.

import type { Context } from 'hono'
import { prisma } from './prisma'
import { hashPassword, computeGJP2, uuidToGDId } from './crypto'
import { findProfile } from './gdHelpers'
import { assignSpecial, advanceSpecial } from './rotation'
import { calcCp } from '../routes/extras'
import { log } from './logger'

// Создаёт скрытую копию уровня origId. Возвращает id копии или null,
// если оригинал не найден / сам является копией / удалён.
export async function createHiddenCopy(origId: number): Promise<number | null> {
  const orig = await prisma.gDLevel.findFirst({
    where: { id: origId, isHidden: false, isDeleted: false },
  })
  if (!orig) return null

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
      password:       '0',
      twoPlayer:      orig.twoPlayer,
      isUnlisted:     true,
      isHidden:       true,   // скрытая копия — не видна ни в одной ветке поиска (вкл. по ID)
      originalId:     orig.id,
      extra:          orig.extra,
    },
  })
  return copy.id
}

// /admin/mappack
// GET /admin/mappack                                                   → список паков
// GET /admin/mappack?id=N&delete=1                                     → удалить пак + копии
// GET /admin/mappack?name=Foo&levels=1,2,3[&id=N][&stars=&coins=&difficulty=&color1=&color2=]
//                                                                      → создать/обновить (с клонами)
export async function handleAdminMappack(url: URL, c: Context) {
  const idParam     = url.searchParams.get('id')
  const id          = idParam !== null ? parseInt(idParam) : NaN
  const isDelete    = url.searchParams.get('delete') === '1'
  const levelsParam = url.searchParams.get('levels')

  if (idParam === null && levelsParam === null) {
    const all = await prisma.gDMapPack.findMany({ orderBy: { id: 'asc' } })
    if (all.length === 0) return c.text('Мап-паков нет')
    return c.text(all.map(p => `Пак #${p.id} "${p.name}": levels=[${p.levelIds}] stars=${p.stars} coins=${p.coins}`).join('\n'))
  }

  if (isDelete) {
    if (isNaN(id)) return c.text('Для удаления нужен id: /admin/mappack?id=N&delete=1')
    const existing = await prisma.gDMapPack.findUnique({ where: { id } })
    if (!existing) return c.text(`Пак ${id} не найден`)
    const oldIds = existing.levelIds.split(',').map(Number).filter(n => !isNaN(n))
    await prisma.gDLevel.deleteMany({ where: { id: { in: oldIds }, isHidden: true } })
    await prisma.gDMapPack.delete({ where: { id } })
    return c.text(`Пак ${id} и ${oldIds.length} скрытых копий удалены`)
  }

  const name     = url.searchParams.get('name') ?? ''
  const levelIds = (levelsParam ?? '').split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
  if (!name)               return c.text('Нужно имя пака: &name=...')
  if (levelIds.length < 1) return c.text('Нужны ID уровней: &levels=1,2,3')

  // Проверяем, что оригиналы существуют и сами не являются копиями
  const originals = await prisma.gDLevel.findMany({
    where: { id: { in: levelIds }, isHidden: false, isDeleted: false },
  })
  const missing = levelIds.filter(lid => !originals.find(o => o.id === lid))
  if (missing.length > 0) return c.text(`Уровни не найдены или сами являются копиями: ${missing.join(', ')}`)

  // При обновлении удаляем старые скрытые копии
  if (!isNaN(id)) {
    const existing = await prisma.gDMapPack.findUnique({ where: { id } })
    if (existing) {
      const oldIds = existing.levelIds.split(',').map(Number).filter(n => !isNaN(n))
      await prisma.gDLevel.deleteMany({ where: { id: { in: oldIds }, isHidden: true } })
    }
  }

  // Создаём скрытые копии в исходном порядке
  const copies: number[] = []
  for (const lid of levelIds) {
    const cid = await createHiddenCopy(lid)
    if (cid) copies.push(cid)
  }

  const stars      = parseInt(url.searchParams.get('stars')      ?? '') || 0
  const coins      = parseInt(url.searchParams.get('coins')      ?? '') || 3
  const difficulty = parseInt(url.searchParams.get('difficulty') ?? '') || 0
  const color1     = url.searchParams.get('color1') ?? '255,255,255'
  const color2     = url.searchParams.get('color2') ?? '255,255,255'

  const data = { name, levelIds: copies.join(','), stars, coins, difficulty, color1, color2 }
  const pack = !isNaN(id)
    ? await prisma.gDMapPack.upsert({ where: { id }, create: { id, ...data }, update: data })
    : await prisma.gDMapPack.create({ data })

  const details = levelIds.map((o, i) => `  ${i + 1}. orig #${o} → копия #${copies[i]}`).join('\n')
  return c.text(`Мап-пак #${pack.id} "${name}" готов. Скрытые копии:\n${details}`)
}

// /admin/daily (daily / weekly / event)
// GET /admin/daily?levelId=N&type=0   → daily   (создаёт скрытую копию)
// GET /admin/daily?levelId=N&type=1   → weekly
// GET /admin/daily?levelId=N&type=2   → event
// GET /admin/daily                    → показать текущие слоты
export async function handleAdminDaily(url: URL, c: Context) {
  const levelId = parseInt(url.searchParams.get('levelId') ?? '')
  const type    = parseInt(url.searchParams.get('type')    ?? '0')
  const names   = ['daily', 'weekly', 'event']

  if (!isNaN(levelId) && levelId > 0) {
    const orig = await prisma.gDLevel.findFirst({
      where: { id: levelId, isHidden: false, isDeleted: false },
    })
    if (!orig) return c.text(`Уровень ${levelId} не найден (или это уже копия)`)

    const r = await assignSpecial(levelId, type)
    if (!r) return c.text(`Не удалось добавить уровень ${levelId}`)
    const slotWord = r.queued ? 'в очередь (появится по ротации или /admin/advance)' : 'активирован сразу'
    return c.text(`OK: ${names[type] ?? type} ${slotWord}: "${orig.name}" (orig #${levelId} → копия #${r.copyId})`)
  }

  const slots = await prisma.gDDailyLevel.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15,
    include: { level: true },
  })
  return c.json(slots.map(s => ({
    type:       names[s.type] ?? s.type,
    number:     s.number,
    levelId:    s.levelId,
    levelName:  s.level.name,
    originalId: s.level.originalId,
    date:       s.createdAt.toISOString(),
  })))
}

// /admin/seed-vault
// Дверь Basement в LevelSelectLayer запрашивает у сервера копии официальных
// уровней RobTop'а по фиксированным ID. Заводим служебный аккаунт RobsVault и
// импортируем эти уровни с официальных серверов GD (boomlings) на нужные ID.
// Если уровень недоступен — кладём проигрываемый плейсхолдер (копию первого
// реального уровня), чтобы дверь не показывала ошибку.
//   GET /admin/seed-vault           → создать аккаунт + импортировать уровни
//   GET /admin/seed-vault?delete=1  → удалить аккаунт RobsVault и его уровни
const VAULT_LEVEL_IDS = [
  77236587, 77236588, 77236592, 77236593, 77237540, 77237542, 77237545,
  77237547, 77237548, 77238470, 77238474, 77238477, 77238483, 77238488,
  77239587, 77239588, 77239595, 77239599, 77239604, 77240630, 77240633,
  97459478, 97459496, 97459505, 97459509, 97459514,
]

// Скачивает официальный уровень с серверов GD и разбирает key:value поля.
async function fetchOfficialLevel(id: number): Promise<Record<number, string> | null> {
  try {
    const res = await fetch('http://www.boomlings.com/database/downloadGJLevel22.php', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': '' },
      body:    `levelID=${id}&secret=Wmfd2893gb7&gameVersion=22&binaryVersion=42`,
    })
    const text = await res.text()
    if (!text || !text.startsWith('1:')) return null
    const parts = text.split('#')[0].split(':')
    const f: Record<number, string> = {}
    for (let i = 0; i + 1 < parts.length; i += 2) f[parseInt(parts[i])] = parts[i + 1]
    return f
  } catch { return null }
}

// Кастомные треки платформер-уровней Башни (файлы public/music/<gdId>.ogg)
const VAULT_SONGS = [
  { gdId: 10000104, name: 'Stranding',              artist: 'Sebaravila',          size: '2.28' },
  { gdId: 10000748, name: 'Casual Game Music 09',   artist: 'Ostinarium',          size: '2.11' },
  { gdId: 10002867, name: 'Chambers Of Hell 2',     artist: 'Cyberwave Orchestra', size: '1.32' },
  { gdId: 10002875, name: 'The Secret Cave',        artist: 'Cyberwave Orchestra', size: '1.23' },
  { gdId: 10003039, name: 'Desert City',            artist: 'Kevin MacLeod',       size: '1.61' },
  { gdId: 10003129, name: 'Scheming Weasel faster', artist: 'Kevin MacLeod',       size: '1.31' },
  { gdId: 10005829, name: 'Dungeon 09',             artist: 'Atlas Reach',         size: '2.04' },
  { gdId: 10006086, name: 'Awakening of Darkness',  artist: 'Daniel Carl',         size: '3.99' },
  { gdId: 10006555, name: 'Tomb',                   artist: 'BoomKitty',           size: '3.70' },
]

export async function handleAdminSeedVault(url: URL, c: Context) {
  const isDelete = url.searchParams.get('delete') === '1'

  let profile = await prisma.gDProfile.findUnique({ where: { gdLogin: 'RobsVault' } })

  if (isDelete) {
    await prisma.gDLevel.deleteMany({ where: { id: { in: VAULT_LEVEL_IDS } } })
    if (profile) await prisma.user.delete({ where: { id: profile.userId } }) // каскадом снесёт gdProfile
    return c.text('RobsVault и его уровни удалены')
  }

  if (!profile) {
    const rnd  = Math.random().toString(36).slice(2)
    const pw   = await hashPassword('robsvault_' + rnd)
    const gjp2 = computeGJP2('robsvault_' + rnd)
    const user = await prisma.user.create({
      data: {
        username: 'RobsVault',
        email:    'robsvault@feargdps.local',
        password: pw,
        newsFilter: { create: {} },
        gdProfile:  { create: { gdLogin: 'RobsVault', gdPassword: gjp2 } },
      },
      include: { gdProfile: true },
    })
    profile = user.gdProfile!
  }

  // Регистрируем кастомные треки платформеров (файлы заливаются в public/music)
  const songBase = process.env.GD_SERVER_URL ?? 'https://feargdps.duckdns.org'
  for (const sng of VAULT_SONGS) {
    const songData = {
      name: sng.name, artistName: sng.artist, artistId: 0,
      downloadUrl: `${songBase}/music/${sng.gdId}.ogg`, fileSize: sng.size, source: 'upload',
    }
    await prisma.gDSong.upsert({ where: { gdId: sng.gdId }, create: { gdId: sng.gdId, ...songData }, update: songData })
  }

  // Приоритет: реальные данные из .gmd (lib/vault-data.ts), сгенерированные
  // scripts/build-vault-data.cjs. Если файла нет — падаем на импорт с boomlings.
  try {
    const mod: any = await import('./vault-data')
    const local = mod.VAULT_LEVELS as any[] | undefined
    if (local && local.length) {
      for (const lv of local) {
        const data = {
          profileId: profile.id, name: lv.name, description: lv.description ?? '',
          levelData: lv.levelData, version: 1, length: lv.length ?? 0, objects: lv.objects ?? 0,
          stars: lv.stars ?? 0, isRated: (lv.stars ?? 0) > 0, difficulty: lv.difficulty ?? 0,
          isDemon: !!lv.isDemon, coins: 0, songId: lv.songId ?? 0, customSongId: lv.customSongId ?? 0,
          isUnlisted: true,
        }
        await prisma.gDLevel.upsert({ where: { id: lv.id }, create: { id: lv.id, ...data }, update: data })
      }
      const gdId = uuidToGDId(profile.id)
      return c.text(`RobsVault (creator #${gdId}) готов из локальных .gmd: ${local.length} уровней`)
    }
  } catch { /* vault-data.ts ещё нет — идём в boomlings */ }

  // Запасной источник данных — первый реальный уровень (для плейсхолдеров)
  const source = await prisma.gDLevel.findFirst({
    where:   { isDeleted: false, isHidden: false },
    orderBy: { id: 'asc' },
  })

  let imported = 0, placeholders = 0

  // Качаем с офиц. серверов небольшими пачками (по 5), чтобы не упереться в таймаут
  const BATCH = 5
  for (let start = 0; start < VAULT_LEVEL_IDS.length; start += BATCH) {
    const batch = VAULT_LEVEL_IDS.slice(start, start + BATCH)
    const fetched = await Promise.all(batch.map(id => fetchOfficialLevel(id)))

    for (let j = 0; j < batch.length; j++) {
      const id = batch[j]
      const f  = fetched[j]
      let data: any

      if (f && f[4]) {
        const stars = parseInt(f[18]) || 0
        data = {
          profileId:     profile.id,
          name:          f[2] || `Official ${start + j + 1}`,
          description:   f[3] ? Buffer.from(f[3], 'base64').toString('utf8') : '',
          levelData:     f[4],
          version:       parseInt(f[5])  || 1,
          length:        parseInt(f[15]) || 0,
          objects:       parseInt(f[45]) || 0,
          stars,
          isRated:       stars > 0,
          difficulty:    parseInt(f[9])  || 0,
          isDemon:       f[17] === '1',
          demonDiff:     parseInt(f[43]) || 0,
          isAuto:        f[25] === '1',
          coins:         parseInt(f[37]) || 0,
          verifiedCoins: f[38] === '1',
          songId:        parseInt(f[12]) || 0,
          customSongId:  parseInt(f[35]) || 0,
          isUnlisted:    true,
        }
        imported++
      } else {
        // Плейсхолдер: копия первого реального уровня (проигрываемый)
        data = {
          profileId:    profile.id,
          name:         `Official ${start + j + 1}`,
          description:  '',
          levelData:    source?.levelData ?? '',
          version:      1,
          length:       source?.length  ?? 0,
          objects:      source?.objects ?? 0,
          stars:        source && source.stars > 0 ? source.stars : 10,
          isRated:      true,
          difficulty:   source && source.difficulty > 0 ? source.difficulty : 50,
          coins:        0,
          songId:       source?.songId       ?? 0,
          customSongId: source?.customSongId ?? 0,
          isUnlisted:   true,
        }
        placeholders++
      }

      await prisma.gDLevel.upsert({ where: { id }, create: { id, ...data }, update: data })
    }
  }

  const gdId = uuidToGDId(profile.id)
  return c.text(
    `RobsVault (creator #${gdId}) готов.\n` +
    `Импортировано с офиц. серверов: ${imported}\n` +
    `Плейсхолдеров (уровень недоступен): ${placeholders}\n` +
    `Всего: ${VAULT_LEVEL_IDS.length}`
  )
}

// Защищённое назначение daily/weekly/event (кнопка GJ_ModBtn у элдера)
// POST: accountID, gjp2, levelID, type (0=daily 1=weekly 2=event)
// Ответы: 1=ok | -1=плохой запрос | -2=неверный пароль | -3=не элдер
//         -4=уровень не найден | -5=авто/неоценённый (нельзя в спецконтент)
export async function handleModSetSpecial(body: Record<string, string>, c: Context) {
  const accountID = body.accountID
  const gjp2      = body.gjp2
  const levelID   = parseInt(body.levelID)
  const type      = parseInt(body.type)
  if (!accountID || !gjp2 || isNaN(levelID) || isNaN(type) || type < 0 || type > 2) return c.text('-1')

  const profile = await findProfile(accountID)
  if (!profile)                              return c.text('-1')
  if (profile.gdPassword !== gjp2)           return c.text('-2')
  if (profile.role !== 'ELDER_MODERATOR')    return c.text('-3')

  const orig = await prisma.gDLevel.findFirst({ where: { id: levelID, isHidden: false, isDeleted: false } })
  if (!orig)                       return c.text('-4')
  if (orig.stars < 2 || orig.isAuto) return c.text('-5')

  const r = await assignSpecial(levelID, type)
  if (!r) return c.text('-1')

  const names = ['daily', 'weekly', 'event']
  log('modSpecial', 'назначен спец-уровень', { login: profile.gdLogin, slot: names[type], levelID, copyId: r.copyId, queued: r.queued })
  return c.text('1')
}

// /admin/advance?type=0|1
// Прокрутить дейли(0)/викли(1) немедленно (для теста и для крона в 00:00 МСК):
// активирует следующий уровень из очереди, иначе берёт случайный фолбэк.
export async function handleAdminAdvance(url: URL, c: Context) {
  const type = parseInt(url.searchParams.get('type') ?? '')
  if (type !== 0 && type !== 1) return c.text('Нужен type=0 (daily) или type=1 (weekly)')
  const msg = await advanceSpecial(type)
  log('advance', msg)
  return c.text(msg)
}

// /admin/coins
// GET /admin/coins?levelId=123&verify=1   → верифицировать монеты уровня
// GET /admin/coins?levelId=123&verify=0   → снять верификацию
export async function handleAdminCoins(url: URL, c: Context) {
  const levelId = parseInt(url.searchParams.get('levelId') ?? '')
  const verify  = url.searchParams.get('verify')

  if (isNaN(levelId) || levelId <= 0) return c.text('Нужен levelId=<число>')
  if (verify !== '0' && verify !== '1') return c.text('Нужен verify=1 (верифицировать) или verify=0 (снять)')

  const level = await prisma.gDLevel.findUnique({ where: { id: levelId } })
  if (!level) return c.text(`Уровень ${levelId} не найден`)

  const verifiedCoins = verify === '1'
  await prisma.gDLevel.update({ where: { id: levelId }, data: { verifiedCoins } })

  return c.text(`OK: "${level.name}" (id=${levelId}) → монеты ${verifiedCoins ? 'верифицированы' : 'сняты с верификации'}`)
}

// /admin/rate
// GET /admin/rate?levelId=123&stars=7&feature=2   → рейтинг звёздами (0-10) + фичер (0=none 1=featured 2=epic 3=legendary 4=mythic)
// GET /admin/rate?levelId=123&demon=3             → демон (1=easy 2=medium 3=hard 4=insane 5=extreme)
// Прямой административный аналог rateGJStars/rateGJDemon — не требует
// заходить в игру модератором, но так же пересчитывает КП владельца.
export async function handleAdminRate(url: URL, c: Context) {
  const levelId = parseInt(url.searchParams.get('levelId') ?? '')
  if (isNaN(levelId) || levelId <= 0) return c.text('Нужен levelId=<число>')

  const level = await prisma.gDLevel.findUnique({ where: { id: levelId } })
  if (!level) return c.text(`Уровень ${levelId} не найден`)

  const demonParam = url.searchParams.get('demon')
  if (demonParam !== null) {
    const rating = parseInt(demonParam)
    if (isNaN(rating) || rating < 1 || rating > 5) return c.text('demon должен быть от 1 до 5')
    const ratingToDemonDiff: Record<number, number> = { 1: 3, 2: 4, 3: 0, 4: 5, 5: 6 }
    const demonDiff = ratingToDemonDiff[rating] ?? 3

    await prisma.gDLevel.update({
      where: { id: levelId },
      data: { isDemon: true, demonDiff, difficulty: 50, isRated: true, isSent: false },
    })
    if (level.profileId) {
      const creatorPoints = await calcCp(level.profileId)
      await prisma.gDProfile.update({ where: { id: level.profileId }, data: { creatorPoints } })
    }
    return c.text(`OK: "${level.name}" (id=${levelId}) → демон, rating=${rating}`)
  }

  const stars   = parseInt(url.searchParams.get('stars') ?? '')
  const feature = parseInt(url.searchParams.get('feature') ?? '') || 0
  if (isNaN(stars) || stars < 0 || stars > 10) return c.text('Нужен stars=<0-10> или demon=<1-5>')

  const difficulty = stars <= 1 ? 0 : stars === 2 ? 10 : stars === 3 ? 20 : stars <= 5 ? 30 : stars <= 7 ? 40 : 50
  await prisma.gDLevel.update({
    where: { id: levelId },
    data: { stars, isRated: stars > 0, isSent: false, isEpic: feature, difficulty, isAuto: stars === 1 },
  })
  if (level.profileId) {
    const creatorPoints = await calcCp(level.profileId)
    await prisma.gDProfile.update({ where: { id: level.profileId }, data: { creatorPoints } })
  }
  return c.text(`OK: "${level.name}" (id=${levelId}) → stars=${stars} feature=${feature} difficulty=${difficulty}`)
}
