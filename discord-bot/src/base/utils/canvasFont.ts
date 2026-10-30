import fs from "node:fs";
import { GlobalFonts } from "@napi-rs/canvas";

function register(candidates: string[], alias: string): string | null {
    for (const p of candidates) {
        try {
            if (fs.existsSync(p) && GlobalFonts.registerFromPath(p, alias)) return alias;
        } catch {
            /* next */
        }
    }
    return null;
}

/** Семейство шрифта с кириллицей: Segoe UI → Arial → DejaVu → sans-serif. */
export const FONT_REGULAR =
    register(
        [
            "C:\\Windows\\Fonts\\segoeui.ttf",
            "C:\\Windows\\Fonts\\arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ],
        "CardRegular"
    ) ?? "sans-serif";

export const FONT_BOLD =
    register(
        [
            "C:\\Windows\\Fonts\\seguisb.ttf",
            "C:\\Windows\\Fonts\\segoeuib.ttf",
            "C:\\Windows\\Fonts\\arialbd.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ],
        "CardBold"
    ) ?? FONT_REGULAR;
