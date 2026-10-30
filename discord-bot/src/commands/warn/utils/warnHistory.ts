import fs from "node:fs";
import path from "node:path";

// Типы нарушений (категории). Значение = ключ, метка — человекочитаемое название.
export const VIOLATION_TYPES: Record<string, string> = {
    spam: "Спам / флуд",
    insults: "Оскорбления",
    ads: "Реклама",
    nsfw: "NSFW-контент",
    rules: "Нарушение правил",
    other: "Прочее",
};

export interface WarnRecord {
    id: string;
    guildId: string;
    targetId: string;
    targetTag: string;
    moderatorId: string;
    moderatorTag: string;
    reason: string;
    /** ключ из VIOLATION_TYPES */
    category: string;
    createdAt: number;
}

const DATA_DIR = path.join(process.cwd(), "data", "json", "warn");
const FILE_PATH = path.join(DATA_DIR, "warnHistory.json");
const ACTIVE_PATH = path.join(DATA_DIR, "activeWarns.json");

// За каждые полные 2 недели без новых варнов активный счётчик уменьшается на 1
const DECAY_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

function ensureFile(): void {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, "[]", "utf-8");
    if (!fs.existsSync(ACTIVE_PATH)) fs.writeFileSync(ACTIVE_PATH, "{}", "utf-8");
}

interface ActiveWarnEntry {
    /** активные варны на момент последнего варна */
    count: number;
    /** timestamp последнего варна */
    lastWarnAt: number;
}

type ActiveStore = Record<string, ActiveWarnEntry>;

function readActive(): ActiveStore {
    ensureFile();
    try {
        return JSON.parse(fs.readFileSync(ACTIVE_PATH, "utf-8"));
    } catch {
        return {};
    }
}

function writeActive(store: ActiveStore): void {
    ensureFile();
    fs.writeFileSync(ACTIVE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

function decayed(entry: ActiveWarnEntry): number {
    const periods = Math.floor((Date.now() - entry.lastWarnAt) / DECAY_PERIOD_MS);
    if (periods <= 0) return entry.count;
    return Math.max(0, entry.count - periods);
}

/** Текущее число активных варнов игрока с учётом затухания (без изменения состояния). */
export function getActiveWarns(userId: string): number {
    const entry = readActive()[userId];
    return entry ? decayed(entry) : 0;
}

/**
 * Регистрирует новый активный варн: затухание + 1. Возвращает новое число активных варнов.
 */
export function registerActiveWarn(userId: string): number {
    const store = readActive();
    const entry = store[userId];
    const base = entry ? decayed(entry) : 0;
    const next = base + 1;
    store[userId] = { count: next, lastWarnAt: Date.now() };
    writeActive(store);
    return next;
}

/** Сбрасывает активные варны игрока (например, после снятия с должности). */
export function resetActiveWarns(userId: string): void {
    const store = readActive();
    delete store[userId];
    writeActive(store);
}

function readAll(): WarnRecord[] {
    ensureFile();
    try {
        return JSON.parse(fs.readFileSync(FILE_PATH, "utf-8"));
    } catch {
        return [];
    }
}

function writeAll(records: WarnRecord[]): void {
    ensureFile();
    fs.writeFileSync(FILE_PATH, JSON.stringify(records, null, 2), "utf-8");
}

export function recordWarn(
    data: Omit<WarnRecord, "id" | "createdAt">
): WarnRecord {
    const record: WarnRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        ...data,
    };
    const records = readAll();
    records.push(record);
    writeAll(records);
    return record;
}

export function getWarnsForTarget(targetId: string): WarnRecord[] {
    return readAll()
        .filter((r) => r.targetId === targetId)
        .sort((a, b) => b.createdAt - a.createdAt);
}

export function getWarnsByModerator(moderatorId: string): WarnRecord[] {
    return readAll()
        .filter((r) => r.moderatorId === moderatorId)
        .sort((a, b) => b.createdAt - a.createdAt);
}

/** Разбивка по типам нарушений среди варнов, выданных модератором. */
export function getViolationBreakdown(
    moderatorId: string
): { category: string; label: string; count: number }[] {
    const counts: Record<string, number> = {};
    for (const r of getWarnsByModerator(moderatorId)) {
        counts[r.category] = (counts[r.category] ?? 0) + 1;
    }
    return Object.entries(counts)
        .map(([category, count]) => ({
            category,
            label: VIOLATION_TYPES[category] ?? category,
            count,
        }))
        .sort((a, b) => b.count - a.count);
}
