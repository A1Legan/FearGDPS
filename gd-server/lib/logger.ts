// Единая точка логирования для gd-server.
//
// Формат строки:
//   2026-10-29T15:42:03.184Z WARN  saveData отклонено: неверный gjp2 login=Rob
//
// Поля печатаются как key=value (значения с пробелами — в кавычках),
// чтобы строку можно было грепать и разбирать скриптом.
//
// Порог задаётся переменной окружения LOG_LEVEL: debug | info | warn | error.
// По умолчанию info, то есть debug-строки в прод не попадают.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type Fields = Record<string, unknown>

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const configured = (process.env.LOG_LEVEL ?? 'info').toLowerCase()
const MIN_RANK = RANK[configured as LogLevel] ?? RANK.info

function renderValue(value: unknown): string {
  if (value === null) return 'null'
  if (value instanceof Error) return JSON.stringify(value.message)
  if (typeof value === 'string') return /[\s="]/.test(value) ? JSON.stringify(value) : value
  if (typeof value === 'object') {
    try { return JSON.stringify(value) } catch { return '[unserializable]' }
  }
  return String(value)
}

function renderFields(fields?: Fields): string {
  if (!fields) return ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    parts.push(`${key}=${renderValue(value)}`)
  }
  return parts.length ? ' ' + parts.join(' ') : ''
}

function emit(level: LogLevel, scope: string, msg: string, fields?: Fields): void {
  if (RANK[level] < MIN_RANK) return
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${scope} ${msg}${renderFields(fields)}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export interface Logger {
  /** Вызов без уровня = info. Оставлено для краткости в горячих местах. */
  (scope: string, msg: string, fields?: Fields): void
  debug(scope: string, msg: string, fields?: Fields): void
  info(scope: string, msg: string, fields?: Fields): void
  warn(scope: string, msg: string, fields?: Fields): void
  error(scope: string, msg: string, fields?: Fields): void
}

export const log: Logger = Object.assign(
  (scope: string, msg: string, fields?: Fields) => emit('info', scope, msg, fields),
  {
    debug: (scope: string, msg: string, fields?: Fields) => emit('debug', scope, msg, fields),
    info:  (scope: string, msg: string, fields?: Fields) => emit('info',  scope, msg, fields),
    warn:  (scope: string, msg: string, fields?: Fields) => emit('warn',  scope, msg, fields),
    error: (scope: string, msg: string, fields?: Fields) => emit('error', scope, msg, fields),
  },
)
