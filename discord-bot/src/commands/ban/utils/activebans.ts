import fs from "node:fs";
import path from "node:path";

import CustomClient from "../../../base/classes/CustomClient";

interface ActiveBanRecord {
    userId: string;
    guildId: string;
    roleId: string;
    /** timestamp окончания; null — перманентный бан (без автоснятия) */
    expiresAt: number | null;
}

const DATA_DIR = path.join(process.cwd(), "data", "json", "ban");
const FILE_PATH = path.join(DATA_DIR, "activeBans.json");

// setTimeout ограничен ~24.8 днями (32-bit signed int) — для больших сроков планируем частями
const MAX_TIMEOUT = 2_147_483_647;

function ensureFile(): void {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, "[]", "utf-8");
}

function readAll(): ActiveBanRecord[] {
    ensureFile();
    try {
        return JSON.parse(fs.readFileSync(FILE_PATH, "utf-8"));
    } catch {
        return [];
    }
}

function writeAll(records: ActiveBanRecord[]): void {
    ensureFile();
    fs.writeFileSync(FILE_PATH, JSON.stringify(records, null, 2), "utf-8");
}

/** Все активные (временные) баны из хранилища. Перманентные сюда не попадают. */
export function getActiveBans(): ActiveBanRecord[] {
    return readAll();
}

/** Удаляет запись активного бана (например, при ручном разбане). */
export function removeActiveBan(userId: string, guildId: string): void {
    removeRecord(userId, guildId);
}

function removeRecord(userId: string, guildId: string): void {
    const records = readAll().filter(
        (r) => !(r.userId === userId && r.guildId === guildId)
    );
    writeAll(records);
}

async function removeRoleNow(
    client: CustomClient,
    record: ActiveBanRecord
): Promise<void> {
    removeRecord(record.userId, record.guildId);

    const guild = client.guilds.cache.get(record.guildId);
    if (!guild) return;

    const member = await guild.members.fetch(record.userId).catch(() => null);
    if (!member) return;

    await member.roles.remove(record.roleId).catch(() => {});
}

/**
 * Ставит таймер на автоматическое снятие роли наказания.
 * Если срок уже истёк (например, бот был выключен дольше срока) — снимает роль сразу.
 */
export function scheduleRoleRemoval(
    client: CustomClient,
    record: ActiveBanRecord
): void {
    // Перманентные баны не снимаются автоматически.
    if (record.expiresAt === null) return;

    const delay = record.expiresAt - Date.now();

    if (delay <= 0) {
        void removeRoleNow(client, record);
        return;
    }

    if (delay > MAX_TIMEOUT) {
        setTimeout(() => scheduleRoleRemoval(client, record), MAX_TIMEOUT);
        return;
    }

    setTimeout(() => {
        void removeRoleNow(client, record);
    }, delay);
}

/**
 * Регистрирует активный бан в хранилище (и временный, и перманентный) —
 * чтобы возвращать роль при перезаходе на сервер. Для временных ещё и планирует
 * автоснятие; для перманентных (expiresAt === null) таймер не ставится.
 */
export function addTemporaryBan(
    client: CustomClient,
    record: {
        userId: string;
        guildId: string;
        roleId: string;
        expiresAt: number | null;
    }
): void {
    const fullRecord: ActiveBanRecord = {
        userId: record.userId,
        guildId: record.guildId,
        roleId: record.roleId,
        expiresAt: record.expiresAt,
    };

    const records = readAll().filter(
        (r) => !(r.userId === record.userId && r.guildId === record.guildId)
    );
    records.push(fullRecord);
    writeAll(records);

    scheduleRoleRemoval(client, fullRecord); // для перманентных ничего не планирует
}

/**
 * Вызвать ОДИН РАЗ при старте бота (в обработчике ready), чтобы восстановить
 * таймеры автоснятия ролей после перезапуска бота.
 */
export function restoreActiveBans(client: CustomClient): void {
    const records = readAll();
    for (const record of records) {
        scheduleRoleRemoval(client, record);
    }
}