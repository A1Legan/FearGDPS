import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const firstLevel = await prisma.gDLevel.findFirst({ orderBy: { id: 'asc' } })
  if (!firstLevel) {
    console.error('Нет ни одного уровня в БД')
    process.exit(1)
  }
  const levelId = firstLevel.id
  console.log(`Используем уровень: "${firstLevel.name}" (id=${levelId})`)

  try {
    await prisma.$executeRaw`ALTER TABLE "GDDailyLevel" DROP CONSTRAINT IF EXISTS "GDDailyLevel_levelId_key"`
    console.log('Unique constraint убран (или не существовал)')
  } catch (e: any) {
    console.log('Constraint:', e.message)
  }

  // 2. Очищаем все записи и вставляем заново
  await prisma.$executeRaw`DELETE FROM "GDDailyLevel"`
  console.log('Старые записи удалены')

  // 3. Вставляем Daily (type=0)
  await prisma.$executeRaw`
    INSERT INTO "GDDailyLevel" ("levelId", "type", "number", "createdAt")
    VALUES (${levelId}, 0, 1, NOW())
  `
  console.log(`Daily: levelId=${levelId}, number=1`)

  // 4. Вставляем Weekly (type=1)
  await prisma.$executeRaw`
    INSERT INTO "GDDailyLevel" ("levelId", "type", "number", "createdAt")
    VALUES (${levelId}, 1, 1, NOW())
  `
  console.log(`weekly: levelId=${levelId} number=1`)

  // 5. Вставляем Event (type=2)
  await prisma.$executeRaw`
    INSERT INTO "GDDailyLevel" ("levelId", "type", "number", "createdAt")
    VALUES (${levelId}, 2, 1, NOW())
  `
  console.log(`event: levelId=${levelId} number=1`)

  // 6. Проверяем
  const all = await prisma.$queryRaw<any[]>`SELECT id, "levelId", type, number FROM "GDDailyLevel" ORDER BY type`
  console.log('текущие записи GDDailyLevel:')
  for (const r of all) {
    const name = ['Daily','Weekly','Event'][r.type] ?? `type=${r.type}`
    console.log(`  ${name}: levelId=${r.levelId}, number=${r.number}`)
  }

  console.log('миграция завершена')
}

main()
  .catch(e => { console.error('миграция не выполнена:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
