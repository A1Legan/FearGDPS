import http from "node:http";
import { AttachmentBuilder, EmbedBuilder, TextChannel } from "discord.js";
import CustomClient from "../../base/classes/CustomClient";
import { renderRateCard, CardData } from "./card";

// Собираем данные карточки из payload (переиспользуем маппинги ниже)
function toCardData(p: RatePayload): CardData {
    return {
        type: p.type,
        levelId: p.levelId,
        levelName: p.levelName,
        author: p.author,
        moderator: p.moderator,
        stars: p.stars,
        difficultyText: difficultyName(p),
        difficultyKey: difficultyKey(p),
        qualityKey: qualityKey(p.isEpic),
        track: p.track,
        artist: p.artist,
    };
}

// Ключ спрайта сложности (имя файла в assets/icons/diff/)
function difficultyKey(p: RatePayload): string {
    if (p.stars === 1) return "auto";
    if (p.isDemon) {
        // demonDiff (канон RobTop): 0=Hard, 3=Easy, 4=Medium, 5=Insane, 6=Extreme
        const map: Record<number, string> = {
            0: "hard_demon",
            3: "easy_demon",
            4: "medium_demon",
            5: "insane_demon",
            6: "extreme_demon",
        };
        return map[p.demonDiff] ?? "hard_demon";
    }
    const map: Record<number, string> = {
        0: "na", 10: "easy", 20: "normal", 30: "hard", 40: "harder", 50: "insane",
    };
    return map[p.difficulty] ?? "na";
}

// Ключ спрайта качества (имя файла в assets/icons/quality/)
function qualityKey(isEpic: number): string {
    switch (isEpic) {
        case 1: return "featured";
        case 2: return "epic";
        case 3: return "legendary";
        case 4: return "mythic";
        default: return "none";
    }
}

// Логи оценки уровней
// Бот поднимает лёгкий HTTP-listener. GDPS-сервер (на том же хосте)
// шлёт POST на http://127.0.0.1:<RATES_PORT>/rate при каждой оценке.
// Мы собираем embed-карточку уровня и постим её в канал CHANNELS.RATES.
//
// Тело запроса (JSON):
//   type       "stars" | "demon" | "quality"   — что за событие
//   levelId    number
//   levelName  string
//   author     string   (ник создателя)
//   moderator  string   (ник модератора, кто оценил)
//   stars      number   (кол-во звёзд)
//   difficulty number   (0/10/20/30/40/50)  — код сложности из БД
//   demonDiff  number   (0/3/4/5/6)         — подтип демона, если isDemon
//   isDemon    boolean
//   isEpic     number   (0..4) — степень оценки (featured/epic/…)
//   track      string   (название трека, опц.)
//   artist     string   (автор трека, опц.)

interface RatePayload {
    type: "stars" | "demon" | "quality";
    levelId: number;
    levelName: string;
    author: string;
    moderator: string;
    stars: number;
    difficulty: number;
    demonDiff: number;
    isDemon: boolean;
    isEpic: number;
    track?: string;
    artist?: string;
}

function difficultyName(p: RatePayload): string {
    if (p.stars === 1) return "Auto";
    if (p.isDemon) {
        // Значения demonDiff по канону RobTop:
        // 0=Hard (дефолт), 3=Easy, 4=Medium, 5=Insane, 6=Extreme
        const map: Record<number, string> = {
            0: "Hard Demon",
            3: "Easy Demon",
            4: "Medium Demon",
            5: "Insane Demon",
            6: "Extreme Demon",
        };
        return map[p.demonDiff] ?? "Hard Demon";
    }
    const map: Record<number, string> = {
        0: "N/A",
        10: "Easy",
        20: "Normal",
        30: "Hard",
        40: "Harder",
        50: "Insane",
    };
    return map[p.difficulty] ?? "N/A";
}

// Степень оценки (качество) → название + цвет
function qualityInfo(isEpic: number): { name: string; color: number } {
    switch (isEpic) {
        case 1: return { name: "Featured", color: 0x00b0f4 };
        case 2: return { name: "Epic", color: 0xf24e4e };
        case 3: return { name: "Legendary", color: 0xff8a00 };
        case 4: return { name: "Mythic", color: 0x8a2be2 };
        default: return { name: "Rated", color: 0xffd93b };
    }
}

function buildEmbed(client: CustomClient, p: RatePayload): EmbedBuilder {
    const quality = qualityInfo(p.isEpic);

    const title = p.type === "quality"
        ? `Изменена оценка качества: ${quality.name}`
        : `Уровень оценён — ${quality.name}`;

    const embed = new EmbedBuilder()
        .setColor(quality.color)
        .setTitle(title)
        .addFields(
            { name: "Уровень", value: `**${p.levelName}** \`#${p.levelId}\``, inline: false },
            { name: "Автор", value: p.author || "—", inline: true },
            { name: "Сложность", value: difficultyName(p), inline: true },
            { name: "Звёзды", value: p.stars ? String(p.stars) : "—", inline: true },
            { name: "Степень", value: quality.name, inline: true },
        )
        .setTimestamp();

    if (p.track) {
        embed.addFields({
            name: "Трек",
            value: p.artist ? `${p.track} — ${p.artist}` : p.track,
            inline: true,
        });
    }

    embed.addFields({ name: "Оценил", value: p.moderator || "—", inline: true });

    return embed;
}

function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", chunk => {
            data += chunk;
            if (data.length > 1_000_000) req.destroy(); // защита от флуда
        });
        req.on("end", () => resolve(data));
        req.on("error", reject);
    });
}

export function startRatesServer(client: CustomClient): void {
    const port = client.config.RATES_PORT;
    const secret = client.config.RATES_SECRET;
    const channelId = client.config.CHANNEL_RATE_PUBLIC;

    if (!port || !channelId) {
        console.log("| [rates] RATES_PORT/CHANNEL_RATE_PUBLIC не заданы — логи оценки отключены.");
        return;
    }

    const server = http.createServer(async (req, res) => {
        if (req.method !== "POST" || req.url !== "/rate") {
            res.writeHead(404).end("not found");
            return;
        }

        // Авторизация по секрету
        if (secret && req.headers["x-rate-secret"] !== secret) {
            res.writeHead(401).end("unauthorized");
            return;
        }

        try {
            const raw = await readBody(req);
            const payload = JSON.parse(raw) as RatePayload;

            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) {
                res.writeHead(500).end("channel unavailable");
                console.error("| [rates] Канал логов недоступен:", channelId);
                return;
            }

            try {
                // Пытаемся отрисовать картинку-карточку
                const png = renderRateCard(toCardData(payload));
                const file = new AttachmentBuilder(png, { name: "rate.png" });
                await (channel as TextChannel).send({ files: [file] });
            } catch (renderErr) {
                // Если рендер картинки упал (нет фона/шрифта/либы) — не теряем лог,
                // откатываемся на обычный embed.
                console.error("| [rates] рендер картинки не удался, шлю embed:", renderErr);
                await (channel as TextChannel).send({ embeds: [buildEmbed(client, payload)] });
            }
            res.writeHead(200).end("ok");
        } catch (err) {
            console.error("| [rates] Ошибка обработки события:", err);
            res.writeHead(400).end("bad request");
        }
    });

    server.on("error", err => console.error("| [rates] HTTP-сервер:", err));

    // Слушаем только localhost — сервер и бот на одном хосте
    server.listen(port, "127.0.0.1", () => {
        console.log(`| [rates] Слушаю оценки на http://127.0.0.1:${port}/rate`);
    });
}
