// ВНИМАНИЕ: скрипт разрушительный — чистит БД до одного RobsVault.
// Требует флаг --yes. Перед удалением делает JSON-дамп всей БД (страховка).
// Запуск: cd /opt/justland/gd-server && /root/.bun/bin/bun db-cleanup.ts --yes
import { prisma } from './lib/prisma'
import { writeFileSync } from 'fs'
import { join } from 'path'

async function main() {
  if (!process.argv.includes('--yes')) {
    console.log('Это разрушительная операция. Запусти с флагом --yes для подтверждения.')
    process.exit(1)
  }

  const vault = await prisma.gDProfile.findFirst({ where: { gdLogin: 'RobsVault' } })
  if (!vault) { console.error('RobsVault не найден, отмена'); process.exit(1) }

  // Оставляем все уровни, принадлежащие RobsVault (26 Basement-уровней)
  const keep = await prisma.gDLevel.findMany({
    where:  { profileId: vault.id },
    select: { id: true },
  })
  const keepIds = keep.map(l => l.id)
  if (keepIds.length === 0) { console.error('keep-set пуст, отмена (страховка)'); process.exit(1) }
  console.log(`Оставляем профиль RobsVault и ${keepIds.length} уровней: ${keepIds.join(', ')}`)

  // 1. БЭКАП всей БД в JSON
  const backup: Record<string, any> = {
    _ts: new Date().toISOString(),
    User:             await prisma.user.findMany(),
    NewsFilter:       await prisma.newsFilter.findMany(),
    GDProfile:        await prisma.gDProfile.findMany(),
    GDLevel:          await prisma.gDLevel.findMany(),
    GDLevelComment:   await prisma.gDLevelComment.findMany(),
    GDProfileComment: await prisma.gDProfileComment.findMany(),
    GDMessage:        await prisma.gDMessage.findMany(),
    GDFriendship:     await prisma.gDFriendship.findMany(),
    GDLevelScore:     await prisma.gDLevelScore.findMany(),
    GDGauntlet:       await prisma.gDGauntlet.findMany(),
    GDMapPack:        await prisma.gDMapPack.findMany(),
    GDDailyLevel:     await prisma.gDDailyLevel.findMany(),
    GDLevelList:      await prisma.gDLevelList.findMany(),
    GDDemon:          await prisma.gDDemon.findMany(),
    GDCompletedLevel: await prisma.gDCompletedLevel.findMany(),
    GDEventResult:    await prisma.gDEventResult.findMany(),
    GDSong:           await prisma.gDSong.findMany(),
  }
  const backupPath = join(import.meta.dir, `db-backup-${Date.now()}.json`)
  writeFileSync(backupPath, JSON.stringify(backup, null, 2))
  console.log(`бэкап сохранён: ${backupPath}`)

  // 2. Вайпим дочерние/тестовые таблицы под ноль
  const wiped: Record<string, number> = {}
  wiped.GDLevelComment   = (await prisma.gDLevelComment.deleteMany({})).count
  wiped.GDProfileComment = (await prisma.gDProfileComment.deleteMany({})).count
  wiped.GDMessage        = (await prisma.gDMessage.deleteMany({})).count
  wiped.GDFriendship     = (await prisma.gDFriendship.deleteMany({})).count
  wiped.GDLevelScore     = (await prisma.gDLevelScore.deleteMany({})).count
  wiped.GDGauntlet       = (await prisma.gDGauntlet.deleteMany({})).count
  wiped.GDMapPack        = (await prisma.gDMapPack.deleteMany({})).count
  wiped.GDDailyLevel     = (await prisma.gDDailyLevel.deleteMany({})).count
  wiped.GDLevelList      = (await prisma.gDLevelList.deleteMany({})).count
  wiped.GDDemon          = (await prisma.gDDemon.deleteMany({})).count
  wiped.GDCompletedLevel = (await prisma.gDCompletedLevel.deleteMany({})).count
  wiped.GDEventResult    = (await prisma.gDEventResult.deleteMany({})).count

  // 3. Уровни: оставляем только keepIds
  wiped.GDLevel = (await prisma.gDLevel.deleteMany({ where: { id: { notIn: keepIds } } })).count

  // ── 4. Тестовые GD-аккаунты: удаляем User (каскад снесёт GDProfile+NewsFilter),
  //      кроме User'а RobsVault. Чистые сайтовые User (без gdProfile) не трогаем. ──
  const otherProfiles = await prisma.gDProfile.findMany({ where: { id: { not: vault.id } }, select: { userId: true } })
  const otherUserIds  = otherProfiles.map(p => p.userId)
  wiped.User_cascade = (await prisma.user.deleteMany({ where: { id: { in: otherUserIds } } })).count

  console.log('Удалено:', JSON.stringify(wiped))

  // 5. Сброс счётчиков (новые данные с 1)
  for (const t of ['GDLevel', 'GDLevelComment', 'GDProfileComment', 'GDMessage', 'GDDailyLevel', 'GDMapPack', 'GDLevelList']) {
    try { await prisma.$executeRawUnsafe(`ALTER SEQUENCE "${t}_id_seq" RESTART WITH 1`); }
    catch (e: any) { console.log(`  (sequence ${t}_id_seq: ${e.message?.slice(0,60)})`) }
  }
  console.log('Счётчики сброшены на 1.')

  // 6. Скрываем RobsVault (флаг isHidden на профиле)
  const col: any[] = await prisma.$queryRawUnsafe(
    `SELECT column_name::text FROM information_schema.columns WHERE table_name='GDProfile' AND column_name='isHidden'`
  )
  if (col.length === 0) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "GDProfile" ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false`)
    console.log('Колонка GDProfile.isHidden добавлена.')
  }
  await prisma.$executeRawUnsafe(`UPDATE "GDProfile" SET "isHidden"=true WHERE "gdLogin"='RobsVault'`)
  console.log('RobsVault помечен isHidden=true (скрытие из поиска/лидерборда — после деплоя фильтров).')

  const finalProfiles = await prisma.gDProfile.count()
  const finalLevels   = await prisma.gDLevel.count()
  console.log(`готово: профилей=${finalProfiles} уровней=${finalLevels} бэкап=${backupPath}`)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
