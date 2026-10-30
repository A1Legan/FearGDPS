import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    Guild,
} from "discord.js";

import { getHistoryForTarget } from "../../ban/utils/banHistory";
import { getActiveBans } from "../../ban/utils/activebans";
import {
    renderPunishList,
    PunishEntry,
} from "../../../base/utils/punishListCard";

export const PER_PAGE = 5;

export interface BanListPayload {
    files: AttachmentBuilder[];
    components: ActionRowBuilder<ButtonBuilder>[];
}

/**
 * Собирает сообщение списка банов для конкретной страницы.
 * «Забанен» = участник с ролью BANNED_ROLE. Временные баны берут срок
 * из activeBans, перманентные — те, кого там нет.
 */
export async function buildBanListPayload(
    guild: Guild,
    bannedRoleId: string,
    page: number
): Promise<BanListPayload> {
    // подтягиваем участников в кэш, чтобы role.members был полным
    await guild.members.fetch().catch(() => {});

    const role = guild.roles.cache.get(bannedRoleId);
    const members = role
        ? [...role.members.values()]
        : [
              ...guild.members.cache
                  .filter((m) => m.roles.cache.has(bannedRoleId))
                  .values(),
          ];

    // карта активных (временных) банов: userId → expiresAt
    const active = new Map(
        getActiveBans()
            .filter((r) => r.guildId === guild.id)
            .map((r) => [r.userId, r.expiresAt] as const)
    );

    const entries: PunishEntry[] = members.map((m) => {
        const hist = getHistoryForTarget(m.id)[0]; // самая свежая запись бана
        const expiresAt = active.get(m.id) ?? null;
        const permanent = expiresAt === null;
        return {
            userId: m.id,
            username: m.user.username,
            avatarUrl: m.user.displayAvatarURL({ extension: "png", size: 128 }),
            reason: hist?.reason ?? "",
            moderatorTag: hist?.moderatorTag ?? "—",
            createdAt: hist?.createdAt ?? null,
            expiresAt,
            permanent,
        };
    });

    // временные — вперёд (по скорому окончанию), затем перманентные (по свежести)
    entries.sort((a, b) => {
        if (a.permanent !== b.permanent) return a.permanent ? 1 : -1;
        if (!a.permanent && !b.permanent) {
            return (a.expiresAt ?? 0) - (b.expiresAt ?? 0);
        }
        return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });

    const permanentCount = entries.filter((e) => e.permanent).length;
    const temporaryCount = entries.length - permanentCount;

    const totalPages = Math.max(1, Math.ceil(entries.length / PER_PAGE));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const slice = entries.slice(
        safePage * PER_PAGE,
        safePage * PER_PAGE + PER_PAGE
    );

    const buffer = await renderPunishList({
        title: "Список банов",
        emptyText: "Забаненных участников нет.",
        headerStats: [
            { label: "Всего:", value: String(entries.length) },
            { label: "навсегда", value: String(permanentCount) },
            { label: "временных", value: String(temporaryCount) },
        ],
        entries: slice,
        page: safePage,
        totalPages,
    });

    const attachment = new AttachmentBuilder(buffer, { name: "banlist.png" });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`banlist:${safePage - 1}`)
            .setLabel("◀ Назад")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safePage <= 0),
        new ButtonBuilder()
            .setCustomId("banlist:noop")
            .setLabel(`${safePage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`banlist:${safePage + 1}`)
            .setLabel("Вперёд ▶")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safePage >= totalPages - 1)
    );

    return { files: [attachment], components: [row] };
}
