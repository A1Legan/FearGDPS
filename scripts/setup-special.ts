import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const level = await prisma.gDLevel.findFirst({ orderBy: { id: 'asc' } })
  if (!level) {
    console.error('Нет ни одного уровня. Загрузи уровень через GD')
    process.exit(1)
  }
  const lid = level.id
  console.log(`Уровень: "${level.name}" (id=${lid})\n`)

  const indexes = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'GDDailyLevel'
      AND indexname <> 'GDDailyLevel_pkey'
  `
  console.log(`  Индексы на GDDailyLevel: ${indexes.map(i => i.indexname).join(', ') || 'нет'}`)

  for (const { indexname, indexdef } of indexes) {
    if (indexdef.toUpperCase().includes('UNIQUE')) {
      await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${indexname}"`)
      console.log(`Удалён unique index: ${indexname}`)
    }
  }

  // 2. Пересоздаём записи Daily/Weekly/Event
  await prisma.$executeRaw`DELETE FROM "GDDailyLevel"`
  console.log('Старые записи очищены')

  for (const [type, name] of [[0,'Daily'],[1,'Weekly'],[2,'Event']] as const) {
    await prisma.$executeRaw`
      INSERT INTO "GDDailyLevel" ("levelId", "type", "number", "createdAt")
      VALUES (${lid}, ${type}, 1, NOW())
    `
    console.log(`${name} (type=${type}) → levelId=${lid}, number=1`)
  }

  // 3. Gauntlet
  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "GDGauntlet" (
        "id"       INTEGER NOT NULL,
        "levelIds" TEXT    NOT NULL,
        CONSTRAINT "GDGauntlet_pkey" PRIMARY KEY ("id")
      )
    `
  } catch {}
  await prisma.$executeRaw`DELETE FROM "GDGauntlet"`
  const ids5 = [lid,lid,lid,lid,lid].join(',')
  await prisma.$executeRaw`INSERT INTO "GDGauntlet"("id","levelIds") VALUES (1, ${ids5})`
  console.log(`Gauntlet id=1: ${ids5}`)

  // 4. Map Pack
  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "GDMapPack" (
        "id"         SERIAL  NOT NULL,
        "name"       TEXT    NOT NULL,
        "levelIds"   TEXT    NOT NULL,
        "stars"      INTEGER NOT NULL DEFAULT 0,
        "coins"      INTEGER NOT NULL DEFAULT 3,
        "difficulty" INTEGER NOT NULL DEFAULT 0,
        "color1"     TEXT    NOT NULL DEFAULT '255,255,255',
        "color2"     TEXT    NOT NULL DEFAULT '255,255,255',
        CONSTRAINT "GDMapPack_pkey" PRIMARY KEY ("id")
      )
    `
  } catch {}
  await prisma.$executeRaw`DELETE FROM "GDMapPack"`
  const ids3 = [lid,lid,lid].join(',')
  await prisma.$executeRaw`
    INSERT INTO "GDMapPack"("name","levelIds","stars","coins","difficulty","color1","color2")
    VALUES ('Test Pack', ${ids3}, 5, 3, 2, '100,255,175', '100,255,175')
  `
  console.log(`Map Pack "Test Pack": ${ids3}`)

  // Проверка
  console.log('\n Итог:')
  const daily = await prisma.$queryRaw<any[]>`
    SELECT type, number, "levelId" FROM "GDDailyLevel" ORDER BY type
  `
  for (const r of daily) {
    const name = ['Daily','Weekly','Event'][r.type] ?? `type=${r.type}`
    console.log(`  ${name}: levelId=${r.levelId}, number=${r.number}`)
  }
  const gauntlets = await prisma.$queryRaw<any[]>`SELECT id,"levelIds" FROM "GDGauntlet"`
  for (const g of gauntlets) console.log(`  Gauntlet id=${g.id}: ${g.levelIds}`)
  const packs = await prisma.$queryRaw<any[]>`SELECT id,name,"levelIds" FROM "GDMapPack"`
  for (const p of packs) console.log(`  MapPack "${p.name}": ${p.levelIds}`)

  console.log('\n Готово!')
}

main()
  .catch(e => { console.error('Ошибка', e.message ?? e); process.exit(1) })
  .finally(() => prisma.$disconnect())
