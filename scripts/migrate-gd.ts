import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log('запуск миграции')

  try {
    await prisma.$executeRaw`ALTER TABLE "GDDailyLevel" DROP CONSTRAINT IF EXISTS "GDDailyLevel_levelId_key"`
    console.log('Constraint GDDailyLevel_levelId_key удалён (или не существовал)')
  } catch (e: any) {
    console.log('Не удалось удалить constraint:', e.message)
  }

  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "GDGauntlet" (
        "id"       INTEGER NOT NULL,
        "levelIds" TEXT    NOT NULL,
        CONSTRAINT "GDGauntlet_pkey" PRIMARY KEY ("id")
      )
    `
    console.log('Таблица GDGauntlet создана (или уже существовала)')
  } catch (e: any) {
    console.log('Ошибка создания GDGauntlet:', e.message)
  }

  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "GDMapPack" (
        "id"         SERIAL      NOT NULL,
        "name"       TEXT        NOT NULL,
        "levelIds"   TEXT        NOT NULL,
        "stars"      INTEGER     NOT NULL DEFAULT 0,
        "coins"      INTEGER     NOT NULL DEFAULT 3,
        "difficulty" INTEGER     NOT NULL DEFAULT 0,
        "color1"     TEXT        NOT NULL DEFAULT '255,255,255',
        "color2"     TEXT        NOT NULL DEFAULT '255,255,255',
        CONSTRAINT "GDMapPack_pkey" PRIMARY KEY ("id")
      )
    `
    console.log('Таблица GDMapPack создана (или уже существовала)')
  } catch (e: any) {
    console.log('Ошибка создания GDMapPack:', e.message)
  }

  console.log('\n Миграция завершена')
}

main()
  .catch(e => { console.error('Ошибка', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
