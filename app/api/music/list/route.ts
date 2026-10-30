import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const songs = await prisma.gDSong.findMany({
      orderBy: { gdId: 'asc' },
    })
    return NextResponse.json({ songs })
  } catch (err) {
    console.error('[music/list] не удалось получить список песен:', err)
    return NextResponse.json({ error: 'Не удалось получить список песен' }, { status: 500 })
  }
}
