import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    Guild,
} from "discord.js";

import { getHistoryForTarget } from "../../mute/utils/muteHistory";
import { getActiveMutes } from "../../mute/utils/activemutes";
import {
    renderPunishList,
    PunishEntry,
} from "../../../base/utils/punishListCard";

export const PER_PAGE = 5;

export interface MuteListPayload {
    files: AttachmentBuilder[];
    components: ActionRowBuilder<ButtonBuilder>[];
}

/**
 * Собирает сообщение списка мутов для конкретной страницы.
 * «Замучен» = участник с ролью MUTED_ROLE. Срок берётся из activeMutes,
 * причина/модератор/время выдачи — из истории мутов.
 */
export async function buildMuteListPayload(
    guild: Guild,
    mutedRoleId: string,
    page: number
): Promise<MuteListPayload> {
    // подтягиваем участников в кэш, чтобы role.members был полным
    await guild.members.fetch().catch(() => {});

    const role = guild.roles.cache.get(mutedRoleId);
    const members = role
        ? [...role.members.values()]
        : [
              ...guild.members.cache
                  .filter((m) => m.roles.cache.has(mutedRoleId))
                  .values(),
          ];

    // карта активных мутов: userId → expiresAt
    const active = new Map(
        getActiveMutes()
            .filter((r) => r.guildId === guild.id)
            .map((r) => [r.userId, r.expiresAt] as const)
    );

    const entries: PunishEntry[] = members.map((m) => {
        const hist = getHistoryForTarget(m.id)[0]; // самая свежая запись мута
        const expiresAt = active.get(m.id) ?? null;
        return {
            userId: m.id,
            username: m.user.username,
            avatarUrl: m.user.displayAvatarURL({ extension: "png", size: 128 }),
            reason: hist?.reason ?? "",
            moderatorTag: hist?.moderatorTag ?? "—",
            createdAt: hist?.createdAt ?? null,
            expiresAt,
            permanent: false, // муты всегда временные
        };
    });

    // по скорому окончанию (у кого нет срока — в конец)
    entries.sort(
        (a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity)
    );

    const totalPages = Math.max(1, Math.ceil(entries.length / PER_PAGE));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const slice = entries.slice(
        safePage * PER_PAGE,
        safePage * PER_PAGE + PER_PAGE
    );

    const buffer = await renderPunishList({
        title: "Список мутов",
        emptyText: "Замученных участников нет.",
        headerStats: [{ label: "Всего:", value: String(entries.length) }],
        entries: slice,
        page: safePage,
        totalPages,
    });

    const attachment = new AttachmentBuilder(buffer, { name: "mutelist.png" });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`mutelist:${safePage - 1}`)
            .setLabel("◀ Назад")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safePage <= 0),
        new ButtonBuilder()
            .setCustomId("mutelist:noop")
            .setLabel(`${safePage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`mutelist:${safePage + 1}`)
            .setLabel("Вперёд ▶")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safePage >= totalPages - 1)
    );

    return { files: [attachment], components: [row] };
}
