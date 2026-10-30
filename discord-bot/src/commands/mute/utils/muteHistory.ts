import fs from "node:fs";
import path from "node:path";

export interface MuteHistoryRecord {
    /** уникальный id записи */
    id: string;
    guildId: string;

    /** кого замутили */
    targetId: string;
    targetTag: string;

    /** кто замутил */
    moderatorId: string;
    moderatorTag: string;

    reason: string;

    /** срок в мс; null = перманентный мут */
    durationMs: number | null;
    /** момент выдачи наказания (timestamp) */
    createdAt: number;
    /** момент истечения (timestamp); null = никогда */
    expiresAt: number | null;

    /** было ли это обновлением уже активного мута */
    wasUpdate: boolean;
}

const DATA_DIR = path.join(process.cwd(), "data", "json", "mute");
const FILE_PATH = path.join(DATA_DIR, "muteHistory.json");

function ensureFile(): void {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, "[]", "utf-8");
}

function readAll(): MuteHistoryRecord[] {
    ensureFile();
    try {
        return JSON.parse(fs.readFileSync(FILE_PATH, "utf-8"));
    } catch {
        return [];
    }
}

function writeAll(records: MuteHistoryRecord[]): void {
    ensureFile();
    fs.writeFileSync(FILE_PATH, JSON.stringify(records, null, 2), "utf-8");
}

/**
 * Сохраняет запись о выданном муте в историю.
 * Вызывать после успешной выдачи роли. Возвращает созданную запись.
 */
export function recordMute(
    data: Omit<MuteHistoryRecord, "id" | "createdAt">
): MuteHistoryRecord {
    const record: MuteHistoryRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        ...data,
    };

    const records = readAll();
    records.push(record);
    writeAll(records);

    return record;
}

/** Вся история мутов (по убыванию даты). */
export function getMuteHistory(): MuteHistoryRecord[] {
    return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

/** История мутов конкретного игрока. */
export function getHistoryForTarget(targetId: string): MuteHistoryRecord[] {
    return getMuteHistory().filter((r) => r.targetId === targetId);
}

/** История мутов, выданных конкретным модератором. */
export function getHistoryByModerator(moderatorId: string): MuteHistoryRecord[] {
    return getMuteHistory().filter((r) => r.moderatorId === moderatorId);
}
