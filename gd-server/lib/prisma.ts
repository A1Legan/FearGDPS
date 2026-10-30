import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// Подключаемся к БД через pg-адаптер — так Prisma работает с Bun
// Прямое подключение (порт 5432, без PgBouncer) — transaction-пулер (6543) несовместим
// с Prisma adapter-pg (prepared statements), из-за чего записи (например, stars) тихо не сохранялись.
const pool = new Pool({
  connectionString: process.env.DIRECT_URL,
})

const adapter = new PrismaPg(pool)

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
