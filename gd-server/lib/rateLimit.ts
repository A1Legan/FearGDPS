import type { Context } from 'hono'

// In-memory rate limiter (анти-спам/анти-бот)
// hitLimit(type, key) → { ok } — не превышен ли лимит для (тип действия, ключ).
// Ключ обычно accountID или IP. Хранится в памяти, сбрасывается при рестарте.

export interface RLResult { ok: boolean; retryAfter: number }

// Пороги по типам действий: [макс. событий, окно в мс]
const LIMITS: Record<string, [number, number]> = {
  like:      [30, 60_000],
  like_ip:   [80, 60_000],
  message:   [10, 60_000],
  friendreq: [15, 60_000],
  comment:   [10, 60_000],
  post:      [10, 60_000],
}
const DEFAULT_LIMIT: [number, number] = [30, 60_000]

const buckets = new Map<string, { ts: number; count: number }>()

export function hitLimit(type: string, key: string): RLResult {
  const [max, win] = LIMITS[type] ?? DEFAULT_LIMIT
  const k   = `${type}:${key}`
  const now = Date.now()
  const e   = buckets.get(k)

  if (!e || now - e.ts > win) {
    buckets.set(k, { ts: now, count: 1 })
    if (buckets.size > 50_000) {           // защита памяти
      const cutoff = now - win
      for (const [bk, bv] of buckets) if (bv.ts < cutoff) buckets.delete(bk)
    }
    return { ok: true, retryAfter: 0 }
  }

  e.count++
  if (e.count > max) return { ok: false, retryAfter: Math.ceil((win - (now - e.ts)) / 1000) }
  return { ok: true, retryAfter: 0 }
}

// Ответ при срабатывании лимита. Для GD отказ = "-1" (клиент покажет ошибку,
// но не сломается). Параметр kind оставлен для совместимости с вызовами.
export function blockedResponse(c: Context, _rl: RLResult, _kind: string) {
  return c.text('-1')
}

// Достаёт IP клиента из заголовков (nginx кладёт x-real-ip).
export function ipOf(c: Context): string {
  return c.req.header('x-real-ip')
    || c.req.header('cf-connecting-ip')
    || c.req.header('x-forwarded-for')?.split(',')[0].trim()
    || '127.0.0.1'
}
