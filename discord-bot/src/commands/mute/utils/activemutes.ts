import fs from "node:fs";
import path from "node:path";

import CustomClient from "../../../base/classes/CustomClient";

interface ActiveMuteRecord {
    userId: string;
    guildId: string;
    roleId: string;
    /** timestamp окончания наказания. Перманентные муты в файл не попадают */
    expiresAt: number;
}

const DATA_DIR = path.join(process.cwd(), "data", "json", "mute");
const FILE_PATH = path.join(DATA_DIR, "activeMutes.json");

// setTimeout ограничен ~24.8 днями (32-bit signed int) — для больших сроков планируем частями
const MAX_TIMEOUT = 2_147_483_647;

function ensureFile(): void {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, "[]", "utf-8");
}

function readAll(): ActiveMuteRecord[] {
    ensureFile();
    try {
        return JSON.parse(fs.readFileSync(FILE_PATH, "utf-8"));
    } catch {
        return [];
    }
}

function writeAll(records: ActiveMuteRecord[]): void {
    ensureFile();
    fs.writeFileSync(FILE_PATH, JSON.stringify(records, null, 2), "utf-8");
}

function removeRecord(userId: string, guildId: string): void {
    const records = readAll().filter(
        (r) => !(r.userId === userId && r.guildId === guildId)
    );
    writeAll(records);
}

/** Удаляет запись активного мута (например, при ручном размуте). */
export function removeActiveMute(userId: string, guildId: string): void {
    removeRecord(userId, guildId);
}

/** Все активные муты из хранилища. */
export function getActiveMutes(): ActiveMuteRecord[] {
    return readAll();
}

async function removeRoleNow(
    client: CustomClient,
    record: ActiveMuteRecord
): Promise<void> {
    removeRecord(record.userId, record.guildId);

    const guild = client.guilds.cache.get(record.guildId);
    if (!guild) return;

    const member = await guild.members.fetch(record.userId).catch(() => null);
    if (!member) return;

    await member.roles.remove(record.roleId).catch(() => {});
}

/**
 * Ставит таймер на автоматическое снятие роли мута.
 * Если срок уже истёк (например, бот был выключен дольше срока) — снимает роль сразу.
 */
export function scheduleRoleRemoval(
    client: CustomClient,
    record: ActiveMuteRecord
): void {
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
 * Добавляет временный мут в хранилище и сразу планирует его снятие.
 * Для перманентных мутов (expiresAt === null) ничего не сохраняет и не планирует.
 */
export function addTemporaryMute(
    client: CustomClient,
    record: {
        userId: string;
        guildId: string;
        roleId: string;
        expiresAt: number | null;
    }
): void {
    if (record.expiresAt === null) return;

    const fullRecord: ActiveMuteRecord = {
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

    scheduleRoleRemoval(client, fullRecord);
}

/**
 * Вызвать ОДИН РАЗ при старте бота (в обработчике ready), чтобы восстановить
 * таймеры автоснятия ролей после перезапуска бота.
 */
export function restoreActiveMutes(client: CustomClient): void {
    const records = readAll();
    for (const record of records) {
        scheduleRoleRemoval(client, record);
    }
}
