import bcrypt from 'bcryptjs'
import { createHash } from 'crypto'

// Хэшируем пароль для платформенного аккаунта (сайт/лаунчер)
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// GD 2.2 хранит пароли как SHA1(password + "mI29fmAnxgTs")
// Это gjp2 — именно его игра отправляет при логине
export function computeGJP2(password: string): string {
  return createHash('sha1').update(password + 'mI29fmAnxgTs').digest('hex')
}

// GD ожидает числовые ID — конвертируем UUID в число
// Берём первые 6 hex-символов, максимум 16777215 — всегда влезает в 32-бит
export function uuidToGDId(uuid: string): number {
  return parseInt(uuid.replace(/-/g, '').slice(0, 6), 16) + 1
}
