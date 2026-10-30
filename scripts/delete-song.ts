// Запуск: bun scripts/delete-song.ts
// Показывает все песни и удаляет по gdId

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const songs = await prisma.gDSong.findMany({ orderBy: { gdId: 'asc' } })

  if (songs.length === 0) {
    console.log('В базе нет песен.')
    process.exit(0)
  }

  console.log('\nПесни в базе:')
  for (const s of songs) {
    console.log(`  gdId=${s.gdId}  "${s.name}" by ${s.artistName}  [${s.source}]`)
  }

  const TARGET_ID = 0  // ← поменяй если нужен другой ID

  const deleted = await prisma.gDSong.deleteMany({ where: { gdId: TARGET_ID } })
  if (deleted.count > 0) {
    console.log(`Удалена песня gdId=${TARGET_ID}`)
  } else {
    console.warn(`Песня gdId=${TARGET_ID} не найдена`)
  }

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
