import fs from "node:fs";
import path from "node:path";

export interface BanHistoryRecord {
    /** уникальный id записи */
    id: string;
    guildId: string;

    /** кого наказали */
    targetId: string;
    targetTag: string;

    /** кто наказал */
    moderatorId: string;
    moderatorTag: string;

    reason: string;

    /** срок в мс; null = перманентный бан */
    durationMs: number | null;
    /** момент выдачи наказания (timestamp) */
    createdAt: number;
    /** момент истечения (timestamp); null = никогда */
    expiresAt: number | null;

    /** было ли это обновлением уже активного наказания */
    wasUpdate: boolean;
}

const DATA_DIR = path.join(process.cwd(), "data", "json", "ban");
const FILE_PATH = path.join(DATA_DIR, "banHistory.json");

function ensureFile(): void {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, "[]", "utf-8");
}

function readAll(): BanHistoryRecord[] {
    ensureFile();
    try {
        return JSON.parse(fs.readFileSync(FILE_PATH, "utf-8"));
    } catch {
        return [];
    }
}

function writeAll(records: BanHistoryRecord[]): void {
    ensureFile();
    fs.writeFileSync(FILE_PATH, JSON.stringify(records, null, 2), "utf-8");
}

/**
 * Сохраняет запись о выданном наказании в историю.
 * Вызывать после успешной выдачи роли. Возвращает созданную запись.
 */
export function recordBan(
    data: Omit<BanHistoryRecord, "id" | "createdAt">
): BanHistoryRecord {
    const record: BanHistoryRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        ...data,
    };

    const records = readAll();
    records.push(record);
    writeAll(records);

    return record;
}

/** Вся история (по убыванию даты). */
export function getBanHistory(): BanHistoryRecord[] {
    return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

/** История банов конкретного игрока. */
export function getHistoryForTarget(targetId: string): BanHistoryRecord[] {
    return getBanHistory().filter((r) => r.targetId === targetId);
}

/** История банов, выданных конкретным модератором. */
export function getHistoryByModerator(moderatorId: string): BanHistoryRecord[] {
    return getBanHistory().filter((r) => r.moderatorId === moderatorId);
}
