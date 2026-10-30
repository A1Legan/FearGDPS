import { Context } from 'hono'
import { prisma } from '../lib/prisma'
import { hashPassword, computeGJP2, uuidToGDId } from '../lib/crypto'
import { hitLimit, ipOf } from '../lib/rateLimit'
import { log } from '../lib/logger'

type Body = Record<string, string | File>

export async function handleRegister(body: Body, c: Context) {
  const userName = body.userName as string
  const password = body.password as string
  const email    = body.email    as string

  if (!userName || !password || !email) {
    log.warn('register', 'нет userName/password/email')
    return c.text('-1')
  }

  // ВНИМАНИЕ: ключа 'register' в LIMITS (lib/rateLimit.ts) нет, поэтому
  // действует дефолт 30 запросов в минуту с IP, а не «1 аккаунт в сутки».
  const rl = hitLimit('register', ipOf(c))
  if (!rl.ok) {
    log.warn('register', 'сработал лимит регистраций', { ip: ipOf(c) })
    return c.text('-1')
  }

  const existingByName = await prisma.gDProfile.findUnique({ where: { gdLogin: userName } })
  if (existingByName) { log.warn('register', 'логин занят', { login: userName }); return c.text('-2') }

  const existingByUser = await prisma.user.findUnique({ where: { username: userName } })
  if (existingByUser) { log.warn('register', 'username занят', { login: userName }); return c.text('-2') }

  const existingByEmail = await prisma.user.findUnique({ where: { email } })
  if (existingByEmail) { log.warn('register', 'email занят', { email }); return c.text('-3') }

  try {
    const hashedPassword = await hashPassword(password)
    const gjp2 = computeGJP2(password)

    await prisma.user.create({
      data: {
        username: userName,
        email,
        password: hashedPassword,
        newsFilter: { create: {} },
        gdProfile: { create: { gdLogin: userName, gdPassword: gjp2 } }
      }
    })

    log('register', 'аккаунт создан', { login: userName })
    return c.text('1')
  } catch (e) {
    log.error('register', 'не удалось создать аккаунт', { login: userName, err: e })
    return c.text('-1')
  }
}

export async function handleLogin(body: Body, c: Context) {
  const userName = body.userName as string
  const gjp2     = body.gjp2     as string
  const password = body.password as string

  if (!userName || (!gjp2 && !password)) {
    log.warn('login', 'нет userName или пароля')
    return c.text('-1')
  }

  const gdProfile = await prisma.gDProfile.findUnique({ where: { gdLogin: userName } })
  if (!gdProfile) { log.warn('login', 'профиль не найден', { login: userName }); return c.text('-1') }

  let isValid = false
  if (gjp2) {
    isValid = gjp2 === gdProfile.gdPassword
  } else {
    isValid = computeGJP2(password) === gdProfile.gdPassword
  }

  if (!isValid) { log.warn('login', 'неверный пароль', { login: userName }); return c.text('-1') }

  const numericId = uuidToGDId(gdProfile.id)
  log('login', 'вход выполнен', { login: userName, accountID: numericId })
  return c.text(`${numericId},${numericId}`)
}
