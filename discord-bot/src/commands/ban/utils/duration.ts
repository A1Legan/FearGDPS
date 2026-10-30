const UNIT_MS: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
};

const PERMANENT_ALIASES = ["permanent", "perm", "навсегда", "форевер", "forever"];

/**
 * Парсит строку вида "30m", "2h", "3d" или "permanent" в миллисекунды.
 *
 * Возвращает:
 *  - number  — длительность в мс
 *  - null    — перманентное наказание (без автоснятия)
 *  - undefined — строка невалидна
 */
export function parseDuration(input: string): number | null | undefined {
    const normalized = input.trim().toLowerCase();

    if (PERMANENT_ALIASES.includes(normalized)) {
        return null;
    }

    const match = normalized.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return undefined;

    const value = Number(match[1]);
    const unit = match[2]!;

    if (!value || value <= 0) return undefined;

    return value * UNIT_MS[unit]!;
}

/**
 * Форматирует миллисекунды в короткую человекочитаемую строку на русском.
 * Например: 1000 * 60 * 90 -> "1 ч. 30 мин."
 */
export function formatDuration(ms: number): string {
    if (ms <= 0) return "0 сек.";

    const units: [number, (n: number) => string][] = [
        [24 * 60 * 60 * 1000, (n) => `${n} дн.`],
        [60 * 60 * 1000, (n) => `${n} ч.`],
        [60 * 1000, (n) => `${n} мин.`],
        [1000, (n) => `${n} сек.`],
    ];

    const parts: string[] = [];
    let remaining = ms;

    for (const [unitMs, label] of units) {
        const amount = Math.floor(remaining / unitMs);
        if (amount > 0) {
            parts.push(label(amount));
            remaining -= amount * unitMs;
        }
        if (parts.length === 2) break; // не более 2 единиц для читаемости
    }

    return parts.length ? parts.join(" ") : "0 сек.";
}