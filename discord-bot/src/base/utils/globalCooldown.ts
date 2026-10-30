import fs from "node:fs";
import path from "node:path";

/**
 * ГЛОБАЛЬНЫЙ кулдаун на команду — один общий таймер на всех пользователей.
 * Сохраняется на диск, поэтому переживает перезапуск бота.
 *
 * Пример:
 *   const cd = checkGlobalCooldown("unban", 30 * 60 * 1000);
 *   if (!cd.allowed) { ...осталось cd.remainingMs... }
 *   ...действие...
 *   registerGlobalCooldown("unban");
 */

const DATA_DIR = path.join(process.cwd(), "data", "json", "cooldowns");
const FILE_PATH = path.join(DATA_DIR, "globalCooldowns.json");

type Store = Record<string, number>; // ключ команды → timestamp последнего использования

function ensureFile(): void {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, "{}", "utf-8");
}

function readStore(): Store {
    ensureFile();
    try {
        return JSON.parse(fs.readFileSync(FILE_PATH, "utf-8"));
    } catch {
        return {};
    }
}

function writeStore(store: Store): void {
    ensureFile();
    fs.writeFileSync(FILE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export interface GlobalCooldownResult {
    allowed: boolean;
    remainingMs: number;
}

/** Проверяет общий кулдаун по ключу. Состояние не меняет. */
export function checkGlobalCooldown(
    key: string,
    durationMs: number
): GlobalCooldownResult {
    const last = readStore()[key];
    if (last === undefined) return { allowed: true, remainingMs: 0 };

    const remainingMs = last + durationMs - Date.now();
    if (remainingMs <= 0) return { allowed: true, remainingMs: 0 };

    return { allowed: false, remainingMs };
}

/** Фиксирует использование команды — запускает отсчёт кулдауна заново. */
export function registerGlobalCooldown(key: string): void {
    const store = readStore();
    store[key] = Date.now();
    writeStore(store);
}
