import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const level = await prisma.gDLevel.findUnique({ where: { id: 10 } })
  if (!level) {
    console.error('Уровень id=10 не найден')
    process.exit(1)
  }
  console.log(`Уровень найден: "${level.name}" (id=10)`)

  await prisma.gDDailyLevel.deleteMany({ where: { type: 0 } })
  await prisma.gDDailyLevel.create({ data: { levelId: 10, type: 0, number: 1 } })
  console.log('Daily уровень: id=10, number=1')

  await prisma.gDDailyLevel.deleteMany({ where: { type: 1 } })
  await prisma.gDDailyLevel.create({ data: { levelId: 10, type: 1, number: 1 } })
  console.log('Weekly уровень: id=10, number=1')

  await prisma.gDDailyLevel.deleteMany({ where: { type: 2 } })
  await prisma.gDDailyLevel.create({ data: { levelId: 10, type: 2, number: 1 } })
  console.log('Event уровень: id=10, number=1')

  await prisma.gDGauntlet.deleteMany()
  await prisma.gDGauntlet.create({
    data: { id: 1, levelIds: '10,10,10,10,10' }
  })
  console.log('Gauntlet id=1: 5 слотов, levelId=10')

  await prisma.gDMapPack.deleteMany()
  await prisma.gDMapPack.create({
    data: {
      name: 'Test Pack',
      levelIds: '10,10,10',
      stars: 5,
      coins: 3,
      difficulty: 2,
      color1: '100,255,175',
      color2: '100,255,175',
    }
  })
  console.log('Map Pack "Test Pack": 3 слота, levelId=10')

  console.log('\n Готово! Все тестовые записи созданы')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
