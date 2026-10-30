import { createCanvas, loadImage } from "@napi-rs/canvas";

import { FONT_REGULAR, FONT_BOLD } from "../../../base/utils/canvasFont";

const MONTHS = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
];

function roundRect(
    ctx: any,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** Усреднённый цвет изображения. */
function avgColor(img: any): string {
    const s = 16;
    const t = createCanvas(s, s);
    const c = t.getContext("2d");
    c.drawImage(img, 0, 0, s, s);
    const data = c.getImageData(0, 0, s, s).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! < 128) continue;
        r += data[i]!;
        g += data[i + 1]!;
        b += data[i + 2]!;
        n++;
    }
    if (!n) return "#5865f2";
    r /= n;
    g /= n;
    b /= n;
    const hx = (x: number) => Math.round(x).toString(16).padStart(2, "0");
    return `#${hx(r)}${hx(g)}${hx(b)}`;
}

function fmtDate(ms: number): string {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${p(
        d.getHours()
    )}:${p(d.getMinutes())}`;
}

export interface HistoryEntry {
    type: "ban" | "mute" | "warn";
    term: string;
    reason: string;
    moderatorTag: string;
    createdAt: number;
}

export interface HistoryCardData {
    username: string;
    avatarUrl: string;
    banCount: number;
    muteCount: number;
    warnCount: number;
    entries: HistoryEntry[];
    page: number; // 0-based
    totalPages: number;
}

const TYPE_META: Record<HistoryEntry["type"], { label: string; color: string }> = {
    ban: { label: "Бан", color: "#ed4245" },
    mute: { label: "Мут", color: "#faa61a" },
    warn: { label: "Варн", color: "#fee75c" },
};

export async function renderHistoryCard(data: HistoryCardData): Promise<Buffer> {
    const W = 900;
    const headerH = 150;
    const rowH = 82;
    const rowGap = 12;
    const padB = data.totalPages > 1 ? 46 : 26;
    const rows = data.entries.length;

    const bodyH = rows > 0 ? rows * rowH + (rows - 1) * rowGap : 70;
    const H = headerH + bodyH + padB;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "alphabetic";

    // загружаем аватар заранее, чтобы вычислить акцентный цвет
    let avatarImg: any = null;
    try {
        avatarImg = await loadImage(data.avatarUrl);
    } catch {
        avatarImg = null;
    }
    const accent = avatarImg ? avgColor(avatarImg) : "#5865f2";

    ctx.save();
    roundRect(ctx, 0, 0, W, H, 12);
    ctx.clip();

    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#1a1c26");
    g.addColorStop(1, "#22252f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // левый барьер — под цвет аватарки (ширина как в /banlist)
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 8, H);

    // аватар (выровнен по центру блока заголовка)
    const ar = 42;
    const ax = 45;
    const centerY = 78; // визуальный центр заголовка
    const ay = centerY - ar;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax + ar, ay + ar, ar - 2, 0, Math.PI * 2);
    ctx.clip();
    if (avatarImg) {
        ctx.drawImage(avatarImg, ax, ay, ar * 2, ar * 2);
    } else {
        ctx.fillStyle = "#3a3f4b";
        ctx.fillRect(ax, ay, ar * 2, ar * 2);
    }
    ctx.restore();
    // обводка — под цвет аватарки
    ctx.beginPath();
    ctx.arc(ax + ar, ay + ar, ar, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = accent;
    ctx.stroke();

    const hx = ax + ar * 2 + 25;
    ctx.fillStyle = "#ffffff";
    ctx.font = `34px ${FONT_BOLD}`;
    ctx.fillText("История наказаний", hx, 70);
    ctx.fillStyle = "#c7ccd6";
    ctx.font = `22px ${FONT_REGULAR}`;
    ctx.fillText(
        `${data.username}   •   Банов: ${data.banCount}   •   Мутов: ${data.muteCount}   •   Варнов: ${data.warnCount}`,
        hx,
        102
    );

    if (rows === 0) {
        ctx.fillStyle = "#57f287";
        ctx.font = `24px ${FONT_BOLD}`;
        ctx.fillText("У этого игрока нет наказаний.", 40, headerH + 20);
        ctx.restore();
        return canvas.toBuffer("image/png");
    }

    const gx = 30;
    const gw = W - gx * 2;

    data.entries.forEach((e, i) => {
        const y = headerH + i * (rowH + rowGap);
        const meta = TYPE_META[e.type];
        const color = meta.color;

        ctx.fillStyle = "#2a2e3a";
        roundRect(ctx, gx, y, gw, rowH, 14);
        ctx.fill();
        ctx.fillStyle = color;
        roundRect(ctx, gx, y, 6, rowH, 6);
        ctx.fill();

        const px = gx + 24;

        // строка 1: тип — срок  ...  дата
        ctx.font = `22px ${FONT_BOLD}`;
        ctx.fillStyle = color;
        const typeLabel = meta.label;
        ctx.fillText(typeLabel, px, y + 32);
        const typeW = ctx.measureText(typeLabel).width;
        ctx.fillStyle = "#e6e9ef";
        ctx.font = `20px ${FONT_REGULAR}`;
        ctx.fillText(`— ${e.term}`, px + typeW + 10, y + 32);

        ctx.fillStyle = "#8a8f98";
        ctx.font = `17px ${FONT_REGULAR}`;
        const dateStr = fmtDate(e.createdAt);
        const dateW = ctx.measureText(dateStr).width;
        ctx.fillText(dateStr, gx + gw - dateW - 20, y + 30);

        // строка 2: Причина + Модератор с подписями и обрезкой
        const reasonText = e.reason ? e.reason : "не указана";
        ctx.font = `17px ${FONT_REGULAR}`;
        const maxW = gw - 44;

        // "Причина: " лейбл
        const lblReason = "Причина: ";
        ctx.fillStyle = "#6f7480";
        ctx.fillText(lblReason, px, y + 62);
        let rx = px + ctx.measureText(lblReason).width;

        // значение причины (обрезаем, оставляя место под модератора)
        const modLabel = "  ·  Мод: ";
        const modText = e.moderatorTag;
        const modFullW =
            ctx.measureText(modLabel).width + ctx.measureText(modText).width;
        let reasonVal = reasonText;
        ctx.fillStyle = "#c7ccd6";
        while (
            ctx.measureText(reasonVal).width + modFullW > maxW - (rx - px) &&
            reasonVal.length > 1
        ) {
            reasonVal = reasonVal.slice(0, -1);
        }
        if (reasonVal !== reasonText) reasonVal = reasonVal.slice(0, -1) + "…";
        ctx.fillText(reasonVal, rx, y + 62);
        rx += ctx.measureText(reasonVal).width;

        // "· Мод: tag"
        ctx.fillStyle = "#6f7480";
        ctx.fillText(modLabel, rx, y + 62);
        rx += ctx.measureText(modLabel).width;
        ctx.fillStyle = "#a8adb8";
        ctx.fillText(modText, rx, y + 62);
    });

    // футер со страницей
    if (data.totalPages > 1) {
        ctx.fillStyle = "#8a8f98";
        ctx.font = `18px ${FONT_REGULAR}`;
        const pageStr = `Страница ${data.page + 1} из ${data.totalPages}`;
        const w = ctx.measureText(pageStr).width;
        ctx.fillText(pageStr, (W - w) / 2, H - 18);
    }

    ctx.restore();
    return canvas.toBuffer("image/png");
}
