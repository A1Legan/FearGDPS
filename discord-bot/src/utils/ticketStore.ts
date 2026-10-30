import fs from "node:fs";
import path from "node:path";

import { writeJsonAtomic, readJsonSafe } from "./jsonStore";

export interface TicketRecord {
    channelId: string;
    /** короткий публичный идентификатор тикета, напр. "KA7X9F" */
    publicId: string;
    ownerId: string;
    /** категория: report / question / bug / appeal */
    category: string;
    createdAt: number;

    /** модератор, взявший тикет в работу */
    claimedBy: string | null;
    claimedAt: number | null;

    /** кто закрыл и когда */
    closedBy: string | null;
    closedAt: number | null;

    /** оценка игрока 1-5 (null — не оценён) */
    rating: number | null;

    /** первый ответ модерации: кто и когда (для времени реакции) */
    firstResponderId: string | null;
    firstResponseAt: number | null;

    /** сколько сообщений написал каждый модератор в этом тикете */
    answers: Record<string, number>;
}

type TicketStore = Record<string, TicketRecord>;

const DATA_DIR = path.join(process.cwd(), "data", "json", "tickets");
const FILE_PATH = path.join(DATA_DIR, "tickets.json");
// Реестр ВСЕХ когда-либо выданных ID — не уменьшается, гарантирует, что ID не повторится никогда.
const USED_IDS_PATH = path.join(DATA_DIR, "usedIds.json");

function ensureFile(): void {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, "{}", "utf-8");
    if (!fs.existsSync(USED_IDS_PATH)) fs.writeFileSync(USED_IDS_PATH, "[]", "utf-8");
}

function readUsedIds(): string[] {
    ensureFile();
    return readJsonSafe<string[]>(USED_IDS_PATH, []);
}

function addUsedId(id: string): void {
    ensureFile();
    const ids = readUsedIds();
    ids.push(id);
    writeJsonAtomic(USED_IDS_PATH, ids);
}

function readStore(): TicketStore {
    ensureFile();
    return readJsonSafe<TicketStore>(FILE_PATH, {});
}

function writeStore(store: TicketStore): void {
    ensureFile();
    writeJsonAtomic(FILE_PATH, store);
}

// Категория, закодированная в первую букву ID (неочевидная таблица).
const CATEGORY_CODE: Record<string, string> = {
    report: "K",
    question: "P",
    bug: "D",
    appeal: "X",
};

// Без похожих символов (0/O, 1/I) — чтобы ID было легко продиктовать.
const RID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randChars(n: number): string {
    let s = "";
    for (let i = 0; i < n; i++) {
        s += RID_ALPHABET[Math.floor(Math.random() * RID_ALPHABET.length)];
    }
    return s;
}

/** Генерирует короткий уникальный ID: [категория][3 симв. времени][2 случайных]. */
function generatePublicId(category: string, taken: Set<string>): string {
    const cat = CATEGORY_CODE[category] ?? "Z";
    for (;;) {
        const t = Date.now()
            .toString(36)
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(-3)
            .padStart(3, "0");
        const id = cat + t + randChars(2);
        if (!taken.has(id)) return id;
    }
}

/** Создаёт запись о новом тикете. Возвращает публичный ID тикета. */
export function createTicket(data: {
    channelId: string;
    ownerId: string;
    category: string;
}): string {
    const store = readStore();
    // проверяем против активных записей И полного реестра выданных ID — совпадений быть не может
    const taken = new Set([
        ...Object.values(store).map((t) => t.publicId),
        ...readUsedIds(),
    ]);
    const publicId = generatePublicId(data.category, taken);
    addUsedId(publicId);
    store[data.channelId] = {
        channelId: data.channelId,
        publicId,
        ownerId: data.ownerId,
        category: data.category,
        createdAt: Date.now(),
        claimedBy: null,
        claimedAt: null,
        closedBy: null,
        closedAt: null,
        rating: null,
        firstResponderId: null,
        firstResponseAt: null,
        answers: {},
    };
    writeStore(store);
    return publicId;
}

export function getTicketByPublicId(publicId: string): TicketRecord | null {
    const id = publicId.trim().toUpperCase();
    return getAllTickets().find((t) => t.publicId === id) ?? null;
}

/** Все тикеты игрока (открытые и закрытые), от новых к старым. */
export function getTicketsByOwner(userId: string): TicketRecord[] {
    return getAllTickets()
        .filter((t) => t.ownerId === userId)
        .sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteTicketRecord(channelId: string): void {
    const store = readStore();
    delete store[channelId];
    writeStore(store);
}

/**
 * Учитывает сообщение модератора в тикете: фиксирует первый ответ (время реакции)
 * и увеличивает счётчик ответов этого модератора.
 */
export function recordTicketMessage(
    channelId: string,
    moderatorId: string
): void {
    const store = readStore();
    const t = store[channelId];
    if (!t) return;
    if (t.closedAt) return; // после закрытия не считаем

    if (!t.firstResponseAt) {
        t.firstResponseAt = Date.now();
        t.firstResponderId = moderatorId;
    }
    t.answers[moderatorId] = (t.answers[moderatorId] ?? 0) + 1;
    writeStore(store);
}

export function getTicket(channelId: string): TicketRecord | null {
    return readStore()[channelId] ?? null;
}

export function getAllTickets(): TicketRecord[] {
    return Object.values(readStore());
}

export function getOpenTickets(): TicketRecord[] {
    return Object.values(readStore()).filter((t) => t.closedAt === null);
}

/** Тикеты, у которых начато закрытие, но игрок ещё не оценил. */
export function getAwaitingRatingTickets(): TicketRecord[] {
    return Object.values(readStore()).filter(
        (t) => t.closedAt !== null && t.rating === null
    );
}

/** Есть ли у игрока открытый обычный (не апелляция) тикет. */
export function hasOpenRegularTicket(userId: string): boolean {
    return getOpenRegularTicket(userId) !== null;
}

/** Открытый обычный (не апелляция) тикет игрока, если есть. */
export function getOpenRegularTicket(userId: string): TicketRecord | null {
    return (
        getOpenTickets().find(
            (t) => t.ownerId === userId && t.category !== "appeal"
        ) ?? null
    );
}

/** Занятые модераторы: у кого есть открытый взятый в работу тикет. */
export function getBusyModerators(): string[] {
    const busy = new Set<string>();
    for (const t of getOpenTickets()) {
        if (t.claimedBy) busy.add(t.claimedBy);
    }
    return [...busy];
}

export interface ClaimResult {
    ok: boolean;
    /** если уже взят — id того, кто взял */
    alreadyBy?: string;
}

/** Закрепляет тикет за модератором. Повторный claim другим — отказ. */
export function claimTicket(channelId: string, moderatorId: string): ClaimResult {
    const store = readStore();
    const t = store[channelId];
    if (!t) return { ok: false };
    if (t.claimedBy && t.claimedBy !== moderatorId) {
        return { ok: false, alreadyBy: t.claimedBy };
    }
    t.claimedBy = moderatorId;
    t.claimedAt = Date.now();
    writeStore(store);
    return { ok: true };
}

/** Фиксирует факт закрытия тикета. */
export function recordClose(channelId: string, closedBy: string): void {
    const store = readStore();
    const t = store[channelId];
    if (!t) return;
    t.closedBy = closedBy;
    t.closedAt = Date.now();
    writeStore(store);
}

/** Сохраняет оценку игрока (1-5). */
export function setRating(channelId: string, rating: number): void {
    const store = readStore();
    const t = store[channelId];
    if (!t) return;
    t.rating = rating;
    writeStore(store);
}

/** Статистика по тикетам модератора (для /modstatistic). */
export function getTicketStats(moderatorId: string): {
    /** взято в работу (claim) */
    handled: number;
    /** всего ответов модератора в тикетах */
    answers: number;
    /** среднее время реакции (мс) по тикетам, где он ответил первым; null — нет данных */
    avgResponseMs: number | null;
    /** средняя оценка по взятым тикетам; null — нет оценок */
    avgRating: number | null;
    /** все оценки по взятым тикетам */
    ratings: number[];
} {
    const all = Object.values(readStore());

    const handled = all.filter((t) => t.claimedBy === moderatorId);

    let answers = 0;
    for (const t of all) answers += t.answers[moderatorId] ?? 0;

    const responseTimes = all
        .filter((t) => t.firstResponderId === moderatorId && t.firstResponseAt)
        .map((t) => t.firstResponseAt! - t.createdAt);
    const avgResponseMs =
        responseTimes.length > 0
            ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
            : null;

    const ratings = handled
        .map((t) => t.rating)
        .filter((r): r is number => typeof r === "number");
    const avgRating =
        ratings.length > 0
            ? ratings.reduce((a, b) => a + b, 0) / ratings.length
            : null;

    return {
        handled: handled.length,
        answers,
        avgResponseMs,
        avgRating,
        ratings,
    };
}
