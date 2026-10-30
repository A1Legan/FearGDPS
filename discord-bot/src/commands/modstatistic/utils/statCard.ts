import { createCanvas, loadImage } from "@napi-rs/canvas";

import { FONT_REGULAR, FONT_BOLD } from "../../../base/utils/canvasFont";

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

export interface StatTile {
    label: string;
    value: string;
    color: string;
}

export interface StatCardData {
    username: string;
    subtitle: string;
    avatarUrl: string;
    tiles: StatTile[]; // ожидается 6 плиток (3×2)
}

export async function renderStatCard(data: StatCardData): Promise<Buffer> {
    const W = 900;
    const H = 340;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    ctx.save();
    roundRect(ctx, 0, 0, W, H, 28);
    ctx.clip();

    // фон
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#1a1c26");
    g.addColorStop(1, "#22252f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // акцентная полоса
    ctx.fillStyle = "#5865f2";
    ctx.fillRect(0, 0, 14, H);

    // аватар
    const ax = 45;
    const ay = 40;
    const ar = 55;
    try {
        const img = await loadImage(data.avatarUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(ax + ar, ay + ar, ar - 3, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, ax, ay, ar * 2, ar * 2);
        ctx.restore();
    } catch {
        ctx.save();
        ctx.beginPath();
        ctx.arc(ax + ar, ay + ar, ar - 3, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = "#3a3f4b";
        ctx.fillRect(ax, ay, ar * 2, ar * 2);
        ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(ax + ar, ay + ar, ar, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#5865f2";
    ctx.stroke();

    // имя и подзаголовок
    const hx = ax + ar * 2 + 30;
    ctx.fillStyle = "#ffffff";
    ctx.font = `40px ${FONT_BOLD}`;
    let name = data.username;
    while (ctx.measureText(name).width > W - hx - 40 && name.length > 1) {
        name = name.slice(0, -1);
    }
    if (name !== data.username) name = name.slice(0, -1) + "…";
    ctx.fillText(name, hx, 78);

    ctx.fillStyle = "#8a8f98";
    ctx.font = `24px ${FONT_REGULAR}`;
    ctx.fillText(data.subtitle, hx, 112);

    // плитки статистики 3×2
    const cols = 3;
    const gap = 20;
    const gridX = 40;
    const gridY = 170;
    const tileW = (W - gridX * 2 - gap * (cols - 1)) / cols;
    const tileH = 65;

    data.tiles.slice(0, 6).forEach((tile, i) => {
        const cx = gridX + (i % cols) * (tileW + gap);
        const cy = gridY + Math.floor(i / cols) * (tileH + gap);

        ctx.fillStyle = "#2a2e3a";
        roundRect(ctx, cx, cy, tileW, tileH, 14);
        ctx.fill();

        ctx.fillStyle = tile.color;
        ctx.font = `28px ${FONT_BOLD}`;
        ctx.fillText(tile.value, cx + 18, cy + 34);

        ctx.fillStyle = "#8a8f98";
        ctx.font = `18px ${FONT_REGULAR}`;
        ctx.fillText(tile.label, cx + 18, cy + 55);
    });

    ctx.restore();
    return canvas.toBuffer("image/png");
}
