import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const songs = await prisma.gDSong.findMany()

  console.log(`\nНайдено песен: ${songs.length}`)
  for (const s of songs) {
    console.log(`  gdId=${s.gdId} "${s.name}" → ${s.downloadUrl}`)
  }

  const TARGET = process.env.GD_SERVER_URL ?? 'https://gd.welmo.fun'
  let fixed = 0
  for (const s of songs) {
    const newUrl = s.downloadUrl
      .replace('http://localhost:3000/music/', `${TARGET}/music/`)
      .replace('https://localhost/music/', `${TARGET}/music/`)
      .replace('https://justland.fun/music/', `${TARGET}/music/`)
      .replace('https://feargdps.duckdns.org/music/', `${TARGET}/music/`)
      .replace('https://feargdps.duckdns.org/music/', `${TARGET}/music/`)
      .replace('https://127.0.0.1/music/', `${TARGET}/music/`)

    if (newUrl !== s.downloadUrl) {
      await prisma.gDSong.update({ where: { id: s.id }, data: { downloadUrl: newUrl } })
      console.log(`обновлён gdId=${s.gdId}: ${s.downloadUrl} -> ${newUrl}`)
      fixed++
    }
  }

  if (fixed === 0) console.log('\nВсе URL уже правильные или не совпали с шаблонами.')
  else console.log(`\nИсправлено: ${fixed}`)

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
