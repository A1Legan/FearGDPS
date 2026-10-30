import fs from "node:fs";
import path from "node:path";

interface ModeratorCooldownEntry {
    /** текущая "ступень" эскалации, 0-7 */
    count: number;
    /** timestamp последнего успешного /ban */
    lastBanAt: number;
}

type CooldownStore = Record<string, ModeratorCooldownEntry>;

const DATA_DIR = path.join(process.cwd(), "data", "json", "ban");
const FILE_PATH = path.join(DATA_DIR, "banCooldowns.json");

// индекс = ступень (кол-во банов подряд без распада), значение = задержка перед СЛЕДУЮЩИМ /ban
const STEP_DELAYS_MS = [
    0, // 0 — задержки нет
    30 * 1000, // 1 — 30 сек
    5 * 60 * 1000, // 2 — 5 мин
    30 * 60 * 1000, // 3 — 30 мин
    2 * 60 * 60 * 1000, // 4 — 2 часа
    6 * 60 * 60 * 1000, // 5 — 6 часов
    12 * 60 * 60 * 1000, // 6 — 12 часов
    24 * 60 * 60 * 1000, // 7 — 24 часа (максимум)
];

const MAX_STEP = STEP_DELAYS_MS.length - 1; // 7
const DECAY_PER_PERIOD = 2; // на сколько ступеней падает счётчик за каждые прошедшие сутки
const DECAY_PERIOD_MS = 24 * 60 * 60 * 1000;

function ensureFile(): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(FILE_PATH)) {
        fs.writeFileSync(FILE_PATH, "{}", "utf-8");
    }
}

function readStore(): CooldownStore {
    ensureFile();
    try {
        return JSON.parse(fs.readFileSync(FILE_PATH, "utf-8"));
    } catch {
        return {};
    }
}

function writeStore(store: CooldownStore): void {
    ensureFile();
    fs.writeFileSync(FILE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

/**
 * Считает текущую ступень модератора с учётом распада:
 * -2 ступени за каждые полные прошедшие сутки без новых банов, минимум 0.
 */
function getDecayedStep(entry: ModeratorCooldownEntry): number {
    const periodsPassed = Math.floor((Date.now() - entry.lastBanAt) / DECAY_PERIOD_MS);
    if (periodsPassed <= 0) return entry.count;

    const decayed = entry.count - periodsPassed * DECAY_PER_PERIOD;
    return Math.max(0, decayed);
}

export interface CooldownCheckResult {
    allowed: boolean;
    remainingMs: number;
    currentStep: number;
}

/**
 * Проверяет, может ли модератор сейчас использовать /ban.
 * Не изменяет состояние — только чтение.
 */
export function checkBanCooldown(moderatorId: string): CooldownCheckResult {
    const store = readStore();
    const entry = store[moderatorId];

    if (!entry) {
        return { allowed: true, remainingMs: 0, currentStep: 0 };
    }

    const step = getDecayedStep(entry);
    const delay = STEP_DELAYS_MS[step] ?? 0;
    const readyAt = entry.lastBanAt + delay;
    const remainingMs = readyAt - Date.now();

    if (remainingMs <= 0) {
        return { allowed: true, remainingMs: 0, currentStep: step };
    }

    return { allowed: false, remainingMs, currentStep: step };
}

/**
 * Регистрирует успешный /ban — поднимает ступень эскалации модератора на 1 (максимум 7).
 * Вызывать ТОЛЬКО после того, как наказание реально применено.
 */
export function registerBan(moderatorId: string): void {
    const store = readStore();
    const entry = store[moderatorId];

    const decayedStep = entry ? getDecayedStep(entry) : 0;
    const newStep = Math.min(MAX_STEP, decayedStep + 1);

    store[moderatorId] = {
        count: newStep,
        lastBanAt: Date.now(),
    };

    writeStore(store);
}
