import { prisma } from './prisma'
import { uuidToGDId } from './crypto'

// Активная иконка (зависит от выбранного типа снаряжения)
export function getActiveIcon(p: {
  iconType: number; cube: number; ship: number; ball: number
  ufo: number; wave: number; robot: number; spider: number; swing: number; jetpack: number
}): number {
  return [p.cube, p.ship, p.ball, p.ufo, p.wave, p.robot, p.spider, p.swing, p.jetpack][p.iconType] ?? p.cube
}

// Поиск профиля по числовому GD-ID
// NOTE: загружает все профили — нормально при малом числе игроков.
// При росте базы стоит перейти на прямой lookup по uuid.
export async function findProfile(accountID: string) {
  const all = await prisma.gDProfile.findMany()
  return all.find(p => uuidToGDId(p.id) === parseInt(accountID)) ?? null
}

// Относительный возраст в формате GD
export function gdAge(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60)       return 'a few seconds'
  if (s < 3600)     return `${Math.floor(s / 60)} minutes`
  if (s < 86400)    return `${Math.floor(s / 3600)} hours`
  if (s < 2592000)  return `${Math.floor(s / 86400)} days`
  if (s < 31536000) return `${Math.floor(s / 2592000)} months`
  return `${Math.floor(s / 31536000)} years`
}
