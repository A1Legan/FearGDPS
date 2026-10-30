import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    User,
} from "discord.js";

import { formatDuration } from "../../ban/utils/duration";
import { getHistoryForTarget as getBans } from "../../ban/utils/banHistory";
import { getHistoryForTarget as getMutes } from "../../mute/utils/muteHistory";
import {
    getWarnsForTarget,
    VIOLATION_TYPES,
} from "../../warn/utils/warnHistory";
import { renderHistoryCard, HistoryEntry } from "./historyCard";

export const PER_PAGE = 6;

export interface HistoryPayload {
    files: AttachmentBuilder[];
    components: ActionRowBuilder<ButtonBuilder>[];
}

/**
 * Собирает сообщение истории наказаний для конкретной страницы:
 * баннер-картинку + кнопки пагинации.
 */
export async function buildHistoryPayload(
    target: User,
    page: number
): Promise<HistoryPayload> {
    const bans = getBans(target.id);
    const mutes = getMutes(target.id);
    const warns = getWarnsForTarget(target.id);

    const all: HistoryEntry[] = [
        ...bans.map((r) => ({
            type: "ban" as const,
            term: r.durationMs === null ? "навсегда" : formatDuration(r.durationMs),
            reason: r.reason,
            moderatorTag: r.moderatorTag,
            createdAt: r.createdAt,
        })),
        ...mutes.map((r) => ({
            type: "mute" as const,
            term: r.durationMs === null ? "навсегда" : formatDuration(r.durationMs),
            reason: r.reason,
            moderatorTag: r.moderatorTag,
            createdAt: r.createdAt,
        })),
        ...warns.map((r) => ({
            type: "warn" as const,
            term: VIOLATION_TYPES[r.category] ?? r.category,
            reason: r.reason,
            moderatorTag: r.moderatorTag,
            createdAt: r.createdAt,
        })),
    ].sort((a, b) => b.createdAt - a.createdAt);

    const totalPages = Math.max(1, Math.ceil(all.length / PER_PAGE));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const slice = all.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

    const buffer = await renderHistoryCard({
        username: target.username,
        avatarUrl: target.displayAvatarURL({ extension: "png", size: 256 }),
        banCount: bans.length,
        muteCount: mutes.length,
        warnCount: warns.length,
        entries: slice,
        page: safePage,
        totalPages,
    });

    const attachment = new AttachmentBuilder(buffer, { name: "history.png" });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`hist:${target.id}:${safePage - 1}`)
            .setLabel("◀ Назад")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safePage <= 0),
        new ButtonBuilder()
            .setCustomId("hist:noop")
            .setLabel(`${safePage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`hist:${target.id}:${safePage + 1}`)
            .setLabel("Вперёд ▶")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safePage >= totalPages - 1)
    );

    return { files: [attachment], components: [row] };
}
