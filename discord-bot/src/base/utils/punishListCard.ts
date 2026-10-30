import { createCanvas, loadImage, Image } from "@napi-rs/canvas";

import { FONT_REGULAR, FONT_BOLD } from "./canvasFont";

function roundRect(
    ctx: any,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
): void {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

/** Дата в формате dd/mm/yy hh:mm:ss. */
function fmtFull(ms: number): string {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, "0");
    return (
        `${p(d.getDate())}/${p(d.getMonth() + 1)}/${p(d.getFullYear() % 100)} ` +
        `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    );
}

export interface PunishEntry {
    userId: string;
    username: string;
    avatarUrl: string;
    reason: string;
    moderatorTag: string;
    /** момент выдачи наказания; null — неизвестно (нет записи в истории) */
    createdAt: number | null;
    /** момент окончания; null — навсегда/не указано */
    expiresAt: number | null;
    /** перманентное наказание (для мутов всегда false) */
    permanent: boolean;
}

export interface PunishListCardData {
    /** заголовок карточки, напр. "Список банов" */
    title: string;
    /** текст при пустом списке */
    emptyText: string;
    /** счётчики в шапке: {label, value} */
    headerStats: { label: string; value: string }[];
    entries: PunishEntry[];
    page: number; // 0-based
    totalPages: number;
}

// Единый концептуальный цвет — усреднённый фиолетовый с аватара сервера.
const ACCENT = "#7d68e6";
const BANNER_RADIUS = 12;

export async function renderPunishList(data: PunishListCardData): Promise<Buffer> {
    const W = 900;
    const headerH = 118;
    const rowH = 76;
    const rowGap = 12;
    const padB = data.totalPages > 1 ? 44 : 24;
    const rows = data.entries.length;

    const bodyH = rows > 0 ? rows * rowH + (rows - 1) * rowGap : 70;
    const H = headerH + bodyH + padB;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "alphabetic";

    // предзагрузка аватарок (параллельно)
    const avatars = await Promise.all(
        data.entries.map((e) =>
            loadImage(e.avatarUrl).catch(() => null as Image | null)
        )
    );

    ctx.save();
    roundRect(ctx, 0, 0, W, H, BANNER_RADIUS);
    ctx.clip();

    // фон
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#1a1c26");
    g.addColorStop(1, "#22252f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // тонкий левый акцент — концептуальный цвет
    ctx.fillStyle = ACCENT;
    ctx.fillRect(0, 0, 8, H);

    // --- шапка ---
    ctx.fillStyle = "#ffffff";
    ctx.font = `32px ${FONT_BOLD}`;
    ctx.fillText(data.title, 40, 58);

    // счётчики (единый акцентный цвет для чисел)
    let sx = 40;
    const sy = 90;
    data.headerStats.forEach((stat, i) => {
        const label = (i === 0 ? "" : "   ·   ") + stat.label + " ";
        ctx.fillStyle = "#8a8f98";
        ctx.font = `19px ${FONT_REGULAR}`;
        ctx.fillText(label, sx, sy);
        sx += ctx.measureText(label).width;
        ctx.fillStyle = ACCENT;
        ctx.font = `19px ${FONT_BOLD}`;
        ctx.fillText(stat.value, sx, sy);
        sx += ctx.measureText(stat.value).width;
    });

    // разделитель
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, headerH - 14);
    ctx.lineTo(W - 30, headerH - 14);
    ctx.stroke();

    if (rows === 0) {
        ctx.fillStyle = ACCENT;
        ctx.font = `22px ${FONT_BOLD}`;
        ctx.fillText(data.emptyText, 40, headerH + 24);
        ctx.restore();
        return canvas.toBuffer("image/png");
    }

    const gx = 30;
    const gw = W - gx * 2;
    const rightX = gx + gw - 20;

    data.entries.forEach((e, i) => {
        const y = headerH + i * (rowH + rowGap);

        // подложка строки
        ctx.fillStyle = "#252833";
        roundRect(ctx, gx, y, gw, rowH, 12);
        ctx.fill();
        // акцентная метка слева — обрезаем по скруглению карточки, чтобы не выпирала
        ctx.save();
        roundRect(ctx, gx, y, gw, rowH, 12);
        ctx.clip();
        ctx.fillStyle = ACCENT;
        ctx.fillRect(gx, y, 4, rowH);
        ctx.restore();

        // аватар с тонким акцентным кольцом
        const ar = 22;
        const acx = gx + 22 + ar;
        const acy = y + rowH / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(acx, acy, ar, 0, Math.PI * 2);
        ctx.clip();
        const img = avatars[i];
        if (img) {
            ctx.drawImage(img, acx - ar, acy - ar, ar * 2, ar * 2);
        } else {
            ctx.fillStyle = "#3a3f4b";
            ctx.fillRect(acx - ar, acy - ar, ar * 2, ar * 2);
        }
        ctx.restore();
        ctx.beginPath();
        ctx.arc(acx, acy, ar, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = ACCENT;
        ctx.stroke();

        const tx = acx + ar + 18;
        const line1Y = y + 32;
        const line2Y = y + 55;

        // --- правая колонка: две даты (выдан / истекает) ---
        const labelFont = `12px ${FONT_REGULAR}`;
        const valueFont = `13px ${FONT_BOLD}`;

        const issuedLabel = "выдан ";
        const issuedVal = e.createdAt !== null ? fmtFull(e.createdAt) : "—";

        let expLabel: string;
        let expVal: string;
        let expColor: string;
        if (e.permanent) {
            expLabel = "";
            expVal = "навсегда";
            expColor = ACCENT;
        } else if (e.expiresAt !== null) {
            expLabel = "истекает ";
            expVal = fmtFull(e.expiresAt);
            expColor = "#c7ccd6";
        } else {
            expLabel = "";
            expVal = "—";
            expColor = "#c7ccd6";
        }

        const pairWidth = (label: string, value: string) => {
            ctx.font = labelFont;
            const lw = ctx.measureText(label).width;
            ctx.font = valueFont;
            const vw = ctx.measureText(value).width;
            return lw + vw;
        };
        const drawRightPair = (
            label: string,
            value: string,
            baseY: number,
            valueColor: string
        ) => {
            ctx.font = labelFont;
            const lw = ctx.measureText(label).width;
            ctx.font = valueFont;
            const vw = ctx.measureText(value).width;
            const startX = rightX - lw - vw;
            ctx.fillStyle = "#6f7480";
            ctx.font = labelFont;
            ctx.fillText(label, startX, baseY);
            ctx.fillStyle = valueColor;
            ctx.font = valueFont;
            ctx.fillText(value, startX + lw, baseY);
        };

        const maxRightW = Math.max(
            pairWidth(issuedLabel, issuedVal),
            pairWidth(expLabel, expVal)
        );
        const rightColStart = rightX - maxRightW;

        drawRightPair(issuedLabel, issuedVal, line1Y, "#c7ccd6");
        drawRightPair(expLabel, expVal, line2Y, expColor);

        // граница, за которую не должны залезать имя и причина
        const leftContentMax = rightColStart - 18;

        // --- имя ---
        ctx.fillStyle = "#ffffff";
        ctx.font = `21px ${FONT_BOLD}`;
        let name = e.username;
        const nameMax = leftContentMax - tx;
        while (ctx.measureText(name).width > nameMax && name.length > 1) {
            name = name.slice(0, -1);
        }
        if (name !== e.username) name = name.slice(0, -1) + "…";
        ctx.fillText(name, tx, line1Y);

        // --- причина + модератор (с подписью «Мод:») ---
        const reasonText = e.reason ? e.reason : "не указана";
        ctx.font = `16px ${FONT_REGULAR}`;
        const avail = leftContentMax - tx;

        const lblReason = "Причина: ";
        ctx.fillStyle = "#6f7480";
        ctx.fillText(lblReason, tx, line2Y);
        let rx = tx + ctx.measureText(lblReason).width;

        const modLabel = "  ·  Мод: ";
        const modText = e.moderatorTag;
        const modFullW =
            ctx.measureText(modLabel).width + ctx.measureText(modText).width;

        let reasonVal = reasonText;
        ctx.fillStyle = "#c7ccd6";
        while (
            ctx.measureText(reasonVal).width + modFullW > avail - (rx - tx) &&
            reasonVal.length > 1
        ) {
            reasonVal = reasonVal.slice(0, -1);
        }
        if (reasonVal !== reasonText) reasonVal = reasonVal.slice(0, -1) + "…";
        ctx.fillText(reasonVal, rx, line2Y);
        rx += ctx.measureText(reasonVal).width;
        ctx.fillStyle = "#6f7480";
        ctx.fillText(modLabel, rx, line2Y);
        rx += ctx.measureText(modLabel).width;
        ctx.fillStyle = "#a8adb8";
        ctx.fillText(modText, rx, line2Y);
    });

    // футер со страницей
    if (data.totalPages > 1) {
        ctx.fillStyle = "#8a8f98";
        ctx.font = `17px ${FONT_REGULAR}`;
        const pageStr = `Страница ${data.page + 1} из ${data.totalPages}`;
        const w = ctx.measureText(pageStr).width;
        ctx.fillText(pageStr, (W - w) / 2, H - 16);
    }

    ctx.restore();
    return canvas.toBuffer("image/png");
}
