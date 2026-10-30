// Локальное превью карточек оценки
// Быстрый предпросмотр без запуска бота/Discord. Правишь геометрию
// в card.ts → запускаешь этот скрипт → смотришь PNG в папке preview/.
//
// Запуск (из корня проекта бота):
//   bun run src/event/rates/preview.ts
//
// Один свой кейс через аргументы (по желанию):
//   bun run src/event/rates/preview.ts "Название" <difficultyKey> <qualityKey> <stars> <levelId>
//   пример: bun run src/event/rates/preview.ts "My Level" extreme_demon mythic 10 228
//
// difficultyKey: na easy normal hard harder insane
//                easy_demon medium_demon hard_demon insane_demon extreme_demon auto
// qualityKey:    none featured epic legendary mythic

import fs from "node:fs";
import path from "node:path";
import { renderRateCard, CardData } from "./card";

// человекочитаемая подпись сложности по ключу
const DIFF_TEXT: Record<string, string> = {
    na: "N/A", easy: "Easy", normal: "Normal", hard: "Hard", harder: "Harder", insane: "Insane",
    easy_demon: "Easy Demon", medium_demon: "Medium Demon", hard_demon: "Hard Demon",
    insane_demon: "Insane Demon", extreme_demon: "Extreme Demon", auto: "Auto",
};

function make(over: Partial<CardData>): CardData {
    const difficultyKey = over.difficultyKey ?? "hard_demon";
    return {
        type: "stars",
        levelId: 228,
        levelName: "Sigareta",
        author: "vladgmd",
        moderator: "A1Legan",
        stars: 10,
        difficultyText: DIFF_TEXT[difficultyKey] ?? "Demon",
        difficultyKey,
        qualityKey: "featured",
        track: "Monster",
        ...over,
    };
}

// Набор для наглядной проверки всех сложностей и степеней оценки.
// Правь/добавляй свои кейсы здесь.
const SAMPLES: Record<string, CardData> = {
    "easy":          make({ levelName: "Stereo Madness", difficultyKey: "easy", qualityKey: "none", stars: 2 }),
    "normal":        make({ levelName: "Polargeist", difficultyKey: "normal", qualityKey: "featured", stars: 3 }),
    "hard":          make({ levelName: "Time Machine", difficultyKey: "hard", qualityKey: "epic", stars: 4 }),
    "harder":        make({ levelName: "Clubstep", difficultyKey: "harder", qualityKey: "legendary", stars: 6 }),
    "insane":        make({ levelName: "Fingerdash", difficultyKey: "insane", qualityKey: "mythic", stars: 9 }),
    "auto":          make({ levelName: "Auto Level", difficultyKey: "auto", qualityKey: "none", stars: 1 }),
    "easy_demon":    make({ levelName: "Nine Circles", difficultyKey: "easy_demon", qualityKey: "featured", stars: 10 }),
    "medium_demon":  make({ levelName: "Deadlocked", difficultyKey: "medium_demon", qualityKey: "epic", stars: 10 }),
    "hard_demon":    make({ levelName: "Sigareta", difficultyKey: "hard_demon", qualityKey: "legendary", stars: 10 }),
    "insane_demon":  make({ levelName: "Cataclysm", difficultyKey: "insane_demon", qualityKey: "mythic", stars: 10 }),
    "extreme_demon": make({ levelName: "Bloodbath", difficultyKey: "extreme_demon", qualityKey: "mythic", stars: 10 }),
    "longname":      make({ levelName: "Super Duper Extremely Long Name", difficultyKey: "extreme_demon", qualityKey: "mythic", stars: 10, levelId: 999999 }),
};

const OUT_DIR = path.join(__dirname, "../../../preview");
fs.mkdirSync(OUT_DIR, { recursive: true });

const args = process.argv.slice(2);
if (args.length > 0) {
    // одиночный кейс из аргументов
    const [name, difficultyKey, qualityKey, stars, levelId] = args;
    const card = make({
        levelName: name || "Preview",
        difficultyKey: difficultyKey || "hard_demon",
        qualityKey: qualityKey || "featured",
        stars: stars ? parseInt(stars) : 10,
        levelId: levelId ? parseInt(levelId) : 228,
    });
    const file = path.join(OUT_DIR, "custom.png");
    fs.writeFileSync(file, renderRateCard(card));
    console.log("Готово:", file);
} else {
    // весь набор
    for (const [name, card] of Object.entries(SAMPLES)) {
        const file = path.join(OUT_DIR, `${name}.png`);
        fs.writeFileSync(file, renderRateCard(card));
        console.log("→", file);
    }
    console.log(`\nГотово. Открой папку preview/ и смотри картинки.`);
}
