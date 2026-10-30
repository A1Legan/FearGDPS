import fs from "node:fs";
import path from "node:path";

import { writeJsonAtomic, readJsonSafe } from "../../../utils/jsonStore";

export interface UserStats {
    /** всего отправлено сообщений */
    messages: number;
    /** сообщения по каналам: channelId → count */
    channels: Record<string, number>;
    /** удалённые сообщения */
    deleted: number;
    /** суммарное время в голосовых каналах (мс) */
    voiceMs: number;
    /** суммарное время в сети (мс) */
    onlineMs: number;
    /** использование команд: commandName → count */
    commands: Record<string, number>;
}

type StatsStore = Record<string, UserStats>;

const DATA_DIR = path.join(process.cwd(), "data", "json", "stats");
const FILE_PATH = path.join(DATA_DIR, "userStats.json");
const FLUSH_INTERVAL_MS = 15_000; // сброс на диск не чаще раза в 15 секунд

function ensureDir(): void {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Статистика держится в памяти и пишется на диск не на каждое сообщение,
// а пачками (см. flushStats). Это снимает синхронный I/O с горячего пути.
let cache: StatsStore | null = null;
let dirty = false;

function store(): StatsStore {
    if (cache === null) {
        ensureDir();
        cache = readJsonSafe<StatsStore>(FILE_PATH, {});
    }
    return cache;
}

/** Сбрасывает накопленную статистику на диск (атомарно), если были изменения. */
export function flushStats(): void {
    if (!dirty || cache === null) return;
    ensureDir();
    writeJsonAtomic(FILE_PATH, cache);
    dirty = false;
}

// Периодический сброс. unref — чтобы таймер не держал процесс живым.
const flushTimer = setInterval(flushStats, FLUSH_INTERVAL_MS);
if (typeof flushTimer.unref === "function") flushTimer.unref();

// Гарантированный сброс при завершении процесса — чтобы не потерять последние данные.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.once(sig, () => {
        flushStats();
        process.exit(0);
    });
}
process.once("beforeExit", flushStats);

function emptyStats(): UserStats {
    return {
        messages: 0,
        channels: {},
        deleted: 0,
        voiceMs: 0,
        onlineMs: 0,
        commands: {},
    };
}

function mutate(userId: string, fn: (s: UserStats) => void): void {
    const s = store();
    const stats = s[userId] ?? emptyStats();
    fn(stats);
    s[userId] = stats;
    dirty = true; // сброс на диск сделает flushStats по таймеру / при выходе
}

export function addMessage(userId: string, channelId: string): void {
    mutate(userId, (s) => {
        s.messages += 1;
        s.channels[channelId] = (s.channels[channelId] ?? 0) + 1;
    });
}

export function addDeleted(userId: string): void {
    mutate(userId, (s) => {
        s.deleted += 1;
    });
}

export function addVoiceMs(userId: string, ms: number): void {
    if (ms <= 0) return;
    mutate(userId, (s) => {
        s.voiceMs += ms;
    });
}

export function addOnlineMs(userId: string, ms: number): void {
    if (ms <= 0) return;
    mutate(userId, (s) => {
        s.onlineMs += ms;
    });
}

export function addCommand(userId: string, command: string): void {
    mutate(userId, (s) => {
        s.commands[command] = (s.commands[command] ?? 0) + 1;
    });
}

/** Полная статистика игрока (с нулями по умолчанию). */
export function getUserStats(userId: string): UserStats {
    return store()[userId] ?? emptyStats();
}

/** Топ каналов игрока по числу сообщений. */
export function getTopChannels(
    userId: string,
    limit = 3
): { channelId: string; count: number }[] {
    const stats = getUserStats(userId);
    return Object.entries(stats.channels)
        .map(([channelId, count]) => ({ channelId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

/** Топ использованных команд игрока. */
export function getTopCommands(
    userId: string,
    limit = 5
): { command: string; count: number }[] {
    const stats = getUserStats(userId);
    return Object.entries(stats.commands)
        .map(([command, count]) => ({ command, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}
