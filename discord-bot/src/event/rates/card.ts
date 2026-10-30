import fs from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";

// Рендер карточки оценки (SVG → PNG) в стиле Geometry Dash
// Слои снизу вверх: фон → глоу качества → морда сложности → тексты.
// Морды масштабируются по НАТУРАЛЬНОМУ размеру текстуры (демоны с рогами
// крупнее — как в самой GD), глоу сажается по центру своего кольца в ту же
// точку, что и морда. Ассеты — в assets/ (см. assets/README.txt), шрифт Pusab.

export interface CardData {
    type: "stars" | "demon" | "quality";
    levelId: number; levelName: string; author: string; moderator: string;
    stars: number; difficultyText: string; difficultyKey: string; qualityKey: string;
    track?: string | undefined; artist?: string | undefined;
}

const ASSETS_DIR = path.join(__dirname, "../../../assets");
const BG_PATH    = path.join(ASSETS_DIR, "rate_card_bg.png");
const FONTS_DIR  = path.join(ASSETS_DIR, "fonts");
const DIFF_DIR   = path.join(ASSETS_DIR, "icons", "diff");
const QUALITY_DIR = path.join(ASSETS_DIR, "icons", "quality");
const STARS_ICON = path.join(ASSETS_DIR, "GJ_starsIcon_001.png");

// Ключ → файл спрайта сложности. Демоны по канону RobTop:
// 06=Hard, 07=Easy, 08=Medium, 09=Insane, 10=Extreme.
const DIFF_FILE: Record<string, string> = {
    na:            "diffIcon_00_btn_001.png",
    easy:          "diffIcon_01_btn_001.png",
    normal:        "diffIcon_02_btn_001.png",
    hard:          "diffIcon_03_btn_001.png",
    harder:        "diffIcon_04_btn_001.png",
    insane:        "diffIcon_05_btn_001.png",
    hard_demon:    "diffIcon_06_btn_001.png",
    easy_demon:    "diffIcon_07_btn_001.png",
    medium_demon:  "diffIcon_08_btn_001.png",
    insane_demon:  "diffIcon_09_btn_001.png",
    extreme_demon: "diffIcon_10_btn_001.png",
    auto:          "diffIcon_auto_btn_001.png",
};
// Ключ → файл глоу + вертикальная доля центра кольца (fy, измерено по альфе:
// у epic/legendary/mythic центр прозрачный и смещён вниз из-за пламени сверху)
// + w: ширина ИМЕННО этого глоу (крутится отдельно; если убрать — берётся GLOW_W).
const QUALITY_COIN: Record<string, { file: string; fy: number; w?: number }> = {
    featured:  { file: "GJ_featuredCoin_001.png", fy: 0.392, w: 150 },
    epic:      { file: "GJ_epicCoin_001.png",     fy: 0.417, w: 170 },
    legendary: { file: "GJ_epicCoin2_001.png",    fy: 0.414, w: 150 },
    mythic:    { file: "GJ_epicCoin3_001.png",    fy: 0.416, w: 190 },
};

const CANVAS = { width: 1150, height: 300 };
const FONT = "Pusab";
const SHADOW = { dx: 3, dy: 4, color: "rgba(0,0,0,0.45)" };
const GLYPH_W = 0.62;        // средняя ширина глифа Pusab в долях кегля (авто-ужатие)
const RIGHT_MARGIN = 30;

// Геометрия левого столбца
const COL_X = 112;           // центр столбца
const ICY = 100;             // общий центр морды и глоу
const DIFF_K = 0.9;         // масштаб морды от натурального размера текстуры
const GLOW_W = 150;          // ширина глоу-ореола (высота — по аспекту текстуры)

type Field = { x: number; y: number; size: number; fill: string; stroke: string; strokeW: number; anchor?: "start" | "middle" | "end"; };

const LAYOUT: Record<string, Field> = {
    difficulty: { x: COL_X, y: 210, size: 34, fill: "#ffffff", stroke: "#3a2412", strokeW: 5, anchor: "middle" },
    starsNum:   { x: COL_X - 12, y: 268, size: 42, fill: "#ffffff", stroke: "#3a2412", strokeW: 5, anchor: "end" },
    levelName:  { x: 205, y: 92,  size: 74, fill: "#ffffff", stroke: "#4a2e16", strokeW: 7, anchor: "start" },
    author:     { x: 205, y: 152, size: 44, fill: "#ffc233", stroke: "#7a4a12", strokeW: 5, anchor: "start" },
    track:      { x: 205, y: 218, size: 42, fill: "#ffe3f6", stroke: "#c23bb0", strokeW: 5, anchor: "start" },
    rated:      { x: 205, y: 284, size: 44, fill: "#ff4fd0", stroke: "#8a1f6a", strokeW: 5, anchor: "start" },
    levelId:    { x: 1112,y: 180, size: 60, fill: "#7fd4ff", stroke: "#1f5f9e", strokeW: 6, anchor: "end" },
};

function esc(s: string): string {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// приблизительная ширина строки в px (для авто-ужатия)
function estWidth(value: string, size: number): number { return value.length * GLYPH_W * size; }
function fit(value: string, f: Field, maxRight: number, min: number): Field {
    const maxW = maxRight - f.x; const w = estWidth(value, f.size);
    if (maxW > 0 && w > maxW) return { ...f, size: Math.max(min, Math.floor(f.size * (maxW / w))) };
    return f;
}

// натуральные размеры PNG из заголовка IHDR (чтобы масштабировать в верных пропорциях)
function pngSize(file: string): { w: number; h: number } {
    try { const b = fs.readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; }
    catch { return { w: 1, h: 1 }; }
}

// Текст с обводкой (paint-order:stroke) и отдельной тенью
function txt(value: string, f: Field): string {
    if (!value) return "";
    const common = (extra: string) => `font-family="${FONT}, sans-serif" font-size="${f.size}" text-anchor="${f.anchor ?? "start"}" ${extra}`;
    const shadow = `<text x="${f.x + SHADOW.dx}" y="${f.y + SHADOW.dy}" ` + common(`fill="${SHADOW.color}"`) + `>${esc(value)}</text>`;
    const main = `<text x="${f.x}" y="${f.y}" ` + common(`fill="${f.fill}" stroke="${f.stroke}" stroke-width="${f.strokeW}" stroke-linejoin="round" paint-order="stroke"`) + `>${esc(value)}</text>`;
    return shadow + main;
}

// Картинка с якорем по долям (fx,fy) относительно точки (px,py)
function imageAnchored(file: string, px: number, py: number, w: number, h: number, fx: number, fy: number): string {
    if (!fs.existsSync(file)) return "";
    const b64 = fs.readFileSync(file).toString("base64");
    const ext = path.extname(file).slice(1).toLowerCase() === "jpg" ? "jpeg" : path.extname(file).slice(1).toLowerCase();
    const x = px - fx * w, y = py - fy * h;
    return `<image href="data:image/${ext};base64,${b64}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`;
}

// Фон: PNG если есть, иначе коричневый градиент
function background(): string {
    if (fs.existsSync(BG_PATH)) {
        const b64 = fs.readFileSync(BG_PATH).toString("base64");
        return `<image href="data:image/png;base64,${b64}" x="0" y="0" width="${CANVAS.width}" height="${CANVAS.height}"/>`;
    }
    return `<defs><radialGradient id="bg" cx="35%" cy="35%" r="85%">`
        + `<stop offset="0%" stop-color="#c98a5b"/><stop offset="100%" stop-color="#a5673c"/>`
        + `</radialGradient></defs>`
        + `<rect x="0" y="0" width="${CANVAS.width}" height="${CANVAS.height}" fill="url(#bg)"/>`;
}

// Короткая подпись сложности (для демонов — просто DEMON, тир виден по морде)
function diffLabel(d: CardData): string { return d.difficultyKey.endsWith("_demon") ? "DEMON" : d.difficultyText.toUpperCase(); }

function buildSvg(d: CardData): string {
    const trackLine = d.track ? (d.artist ? `${d.track} — ${d.artist}` : d.track) : "";
    const st = LAYOUT.starsNum!;
    const diffFile = path.join(DIFF_DIR, DIFF_FILE[d.difficultyKey] ?? DIFF_FILE["na"]!);
    const coin = QUALITY_COIN[d.qualityKey];

    // морда — натуральный размер × DIFF_K, центр (0.5,0.5) в точке (COL_X, ICY)
    const ds = pngSize(diffFile);
    const dW = ds.w * DIFF_K, dH = ds.h * DIFF_K;

    // глоу — ширина GLOW_W, высота по аспекту, центр кольца (0.5, fy) в той же точке
    let glowNode = "";
    if (coin) {
        const cf = path.join(QUALITY_DIR, coin.file);
        const cs = pngSize(cf);
        const gW = coin.w ?? GLOW_W;                 // ширина глоу этого качества
        glowNode = imageAnchored(cf, COL_X, ICY, gW, gW * (cs.h / cs.w), 0.5, coin.fy);
    }

    const authorLine = `By ${d.author}`;
    const ratedLine = `Rated by: ${d.moderator}`;
    const idText = `ID: ${d.levelId}`;
    const idLeft = LAYOUT.levelId!.x - estWidth(idText, LAYOUT.levelId!.size);
    const nameMaxRight = idLeft - 25;
    const textMaxRight = CANVAS.width - RIGHT_MARGIN;

    const parts = [
        background(),
        glowNode,                                              // нижний слой (глоу)
        imageAnchored(diffFile, COL_X, ICY, dW, dH, 0.5, 0.5), // морда поверх
        txt(diffLabel(d), LAYOUT.difficulty!),
        d.stars ? txt(String(d.stars), st) : "",
        d.stars ? imageAnchored(STARS_ICON, st.x + 34, st.y - 13, 40, 40 * (97 / 94), 0.5, 0.5) : "",
        txt(d.levelName, fit(d.levelName, LAYOUT.levelName!, nameMaxRight, 34)),
        txt(authorLine, fit(authorLine, LAYOUT.author!, textMaxRight, 26)),
        txt(trackLine, fit(trackLine, LAYOUT.track!, textMaxRight, 24)),
        txt(ratedLine, fit(ratedLine, LAYOUT.rated!, textMaxRight, 26)),
        txt(idText, LAYOUT.levelId!),
    ];

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" `
        + `viewBox="0 0 ${CANVAS.width} ${CANVAS.height}">${parts.join("")}</svg>`;
}

function fontFiles(): string[] {
    try { return fs.readdirSync(FONTS_DIR).filter(f => /\.(ttf|otf)$/i.test(f)).map(f => path.join(FONTS_DIR, f)); }
    catch { return []; }
}

export function renderRateCard(d: CardData): Buffer {
    const svg = buildSvg(d);
    const files = fontFiles();
    const resvg = new Resvg(svg, {
        background: "rgba(0,0,0,0)",
        fitTo: { mode: "width", value: CANVAS.width },
        font: { fontFiles: files, loadSystemFonts: files.length === 0, defaultFontFamily: FONT },
    });
    return resvg.render().asPng();
}
