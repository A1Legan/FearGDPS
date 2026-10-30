// READ-ONLY инвентаризация перед чисткой. Ничего не меняет.
// Запуск: cd /opt/justland/gd-server && /root/.bun/bin/bun db-inventory.ts
import { prisma } from './lib/prisma'

async function main() {
  const vault = await prisma.gDProfile.findFirst({ where: { gdLogin: 'RobsVault' } })
  if (!vault) { console.error('профиль RobsVault не найден'); process.exit(1) }

  const vaultLevels = await prisma.gDLevel.findMany({
    where: { profileId: vault.id },
    select: { id: true, name: true, customSongId: true, songId: true },
    orderBy: { id: 'asc' },
  })
  const songIds = [...new Set(vaultLevels.map(l => l.customSongId).filter(id => id > 0))]

  console.log('=== ОСТАВЛЯЕМ ===')
  console.log(`RobsVault: profileId=${vault.id}  (gdLogin=${vault.gdLogin})`)
  console.log(`Уровней RobsVault: ${vaultLevels.length}`)
  console.log('  ID:', vaultLevels.map(l => l.id).join(', '))
  console.log(`Кастомных песен у этих уровней: ${songIds.length} → [${songIds.join(', ')}]`)

  console.log('\n=== ВСЕГО В БД (кандидаты на удаление, кроме оставляемого) ===')
  const counts: Record<string, number> = {
    'GDProfile':        await prisma.gDProfile.count(),
    'GDLevel':          await prisma.gDLevel.count(),
    'GDLevelComment':   await prisma.gDLevelComment.count(),
    'GDProfileComment': await prisma.gDProfileComment.count(),
    'GDMessage':        await prisma.gDMessage.count(),
    'GDFriendship':     await prisma.gDFriendship.count(),
    'GDLevelScore':     await prisma.gDLevelScore.count(),
    'GDGauntlet':       await prisma.gDGauntlet.count(),
    'GDMapPack':        await prisma.gDMapPack.count(),
    'GDDailyLevel':     await prisma.gDDailyLevel.count(),
    'GDLevelList':      await prisma.gDLevelList.count(),
    'GDDemon':          await prisma.gDDemon.count(),
    'GDCompletedLevel': await prisma.gDCompletedLevel.count(),
    'GDEventResult':    await prisma.gDEventResult.count(),
    'GDSong':           await prisma.gDSong.count(),
  }
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(18)} ${v}`)

  console.log('\nПосле чистки останется: 1 профиль (RobsVault),',
    vaultLevels.length, 'уровней,', songIds.length, 'песен. Остальное — в ноль.')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
