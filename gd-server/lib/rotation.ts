// Ротация дейли/викли/ивентов (очередь + авто-прокрутка)
// Модель:
//   • Мод-кнопка/админка кладут уровень В ОЧЕРЕДЬ (activatedAt = null).
//   • Крон в 00:00 МСК (21:00 UTC) активирует следующий из очереди:
//       daily — каждый день, weekly — по понедельникам.
//   • Очередь пуста → берём случайный уровень под критерии вкладки.
//   • Ивенты (type=2) не ротируются: добавляются СРАЗУ активными,
//     висят все вместе, пока модераторы не добавят новые.
//   • «Текущий» = слот с activatedAt != null и самым свежим activatedAt.

import { prisma } from './prisma'

// Создаёт скрытую копию уровня origId (как у гаунтлетов: не в поиске, минимум 1 звезда).
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
      stars:          orig.stars > 0 ? orig.stars : 1,
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

// Следующий порядковый номер среди активированных слотов этого типа
async function nextNumber(type: number): Promise<number> {
  const last = await prisma.gDDailyLevel.findFirst({
    where:   { type, activatedAt: { not: null } },
    orderBy: { number: 'desc' },
  })
  return (last?.number ?? 0) + 1
}

// Добавить уровень: event — сразу активен; daily/weekly — в очередь
export async function assignSpecial(levelId: number, type: number):
    Promise<{ copyId: number; queued: boolean } | null> {
  const copyId = await createHiddenCopy(levelId)
  if (!copyId) return null

  if (type === 2) {
    const number = await nextNumber(2)
    await prisma.gDDailyLevel.create({
      data: { levelId: copyId, type, number, activatedAt: new Date() },
    })
    return { copyId, queued: false }
  }

  // daily / weekly — в очередь (активируется кроном/advance)
  await prisma.gDDailyLevel.create({
    data: { levelId: copyId, type, number: 0, activatedAt: null },
  })
  return { copyId, queued: true }
}

// Случайный уровень-фолбэк под критерии вкладки
async function randomFallbackLevel(type: number) {
  const where: any = { isHidden: false, isDeleted: false, isUnlisted: false }
  if (type === 1) {
    // weekly: демон на 10 звёзд, сложность easy(4)/medium(5)
    where.stars = 10; where.isDemon = true; where.demonDiff = { in: [4, 5] }
  } else {
    // daily: любой уровень на 2-9 звёзд
    where.stars = { gte: 2, lte: 9 }
  }
  const count = await prisma.gDLevel.count({ where })
  if (count === 0) return null
  const skip = Math.floor(Math.random() * count)
  const found = await prisma.gDLevel.findMany({ where, skip, take: 1 })
  return found[0] ?? null
}

// Прокрутить вкладку: активировать следующий из очереди, иначе случайный фолбэк.
// type 0=daily, 1=weekly. (event не ротируется.)
export async function advanceSpecial(type: number): Promise<string> {
  const names = ['daily', 'weekly', 'event']
  if (type === 2) return 'event не ротируется по таймеру'

  const number = await nextNumber(type)

  const queued = await prisma.gDDailyLevel.findFirst({
    where:   { type, activatedAt: null },
    orderBy: { createdAt: 'asc' },   // FIFO — первый добавленный
  })
  if (queued) {
    await prisma.gDDailyLevel.update({
      where: { id: queued.id },
      data:  { activatedAt: new Date(), number },
    })
    return `${names[type]} #${number}: активирован из очереди (levelId=${queued.levelId})`
  }

  // Очередь пуста — случайный фолбэк
  const orig = await randomFallbackLevel(type)
  if (!orig) return `${names[type]}: очередь пуста и нет подходящих уровней для фолбэка`
  const copyId = await createHiddenCopy(orig.id)
  if (!copyId) return `${names[type]}: не удалось создать копию фолбэка`
  await prisma.gDDailyLevel.create({
    data: { levelId: copyId, type, number, activatedAt: new Date() },
  })
  return `${names[type]} #${number}: фолбэк "${orig.name}" (orig #${orig.id} → копия #${copyId})`
}
