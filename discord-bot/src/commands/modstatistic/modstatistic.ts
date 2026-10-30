import {
    AttachmentBuilder,
    ChatInputCommandInteraction,
    ContainerBuilder,
    GuildMember,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SlashCommandBuilder,
    TextDisplayBuilder,
} from "discord.js";

import CustomClient from "../../base/classes/CustomClient";
import { formatDuration } from "../ban/utils/duration";
import { getHistoryByModerator as bansByMod } from "../ban/utils/banHistory";
import { getHistoryByModerator as mutesByMod } from "../mute/utils/muteHistory";
import { getWarnsByModerator, getViolationBreakdown } from "../warn/utils/warnHistory";
import {
    getUserStats,
    getTopChannels,
    getTopCommands,
} from "../modstatistic/utils/statsStore";
import { renderStatCard } from "../modstatistic/utils/statCard";
import { getTicketStats } from "../../utils/ticketStore";

function fmtTime(ms: number): string {
    return ms > 0 ? formatDuration(ms) : "—";
}

// Для плиток активности: 0 показываем как "0 мин.", а не пустой прочерк.
function fmtActivity(ms: number): string {
    return ms > 0 ? formatDuration(ms) : "0 мин.";
}

export default {
    data: new SlashCommandBuilder()
        .setName("modstatistic")
        .setDescription("Полная статистика модератора")
        .addUserOption((option) =>
            option
                .setName("модератор")
                .setDescription("Чью статистику показать (по умолчанию — вашу)")
                .setRequired(false)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const client = interaction.client as CustomClient;
        const member = interaction.member as GuildMember;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // --- проверка прав (только администрация) ---
        const isAdmin = client.config.ADMIN_ROLES.some((r) =>
            member.roles.cache.has(r)
        );
        if (!isAdmin) {
            return interaction.editReply({
                components: [
                    new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `${client.config.EMOJIS.CLOSE} У вас нет прав для использования этой команды.`
                        )
                    ),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const target = interaction.options.getUser("модератор") ?? interaction.user;

        const stats = getUserStats(target.id);
        const bans = bansByMod(target.id).length;
        const mutes = mutesByMod(target.id).length;
        const warns = getWarnsByModerator(target.id).length;

        const buffer = await renderStatCard({
            username: target.username,
            subtitle: "Статистика активности и модерации",
            avatarUrl: target.displayAvatarURL({ extension: "png", size: 256 }),
            tiles: [
                { label: "Сообщения", value: String(stats.messages), color: "#5865f2" },
                { label: "В войсе", value: fmtActivity(stats.voiceMs), color: "#57f287" },
                { label: "В сети", value: fmtActivity(stats.onlineMs), color: "#eb459e" },
                { label: "Баны", value: String(bans), color: "#ed4245" },
                { label: "Муты", value: String(mutes), color: "#faa61a" },
                { label: "Варны", value: String(warns), color: "#fee75c" },
            ],
        });
        const attachment = new AttachmentBuilder(buffer, { name: "stat.png" });

        // --- детали (Components V2) ---
        const container = new ContainerBuilder().setAccentColor(0x5865f2);

        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL("attachment://stat.png")
            )
        );

        const topChannels = getTopChannels(target.id, 3);
        const channelsText = topChannels.length
            ? topChannels.map((c) => `> <#${c.channelId}> — ${c.count}`).join("\n")
            : "> нет данных";

        const topCommands = getTopCommands(target.id, 5);
        const commandsText = topCommands.length
            ? topCommands.map((c) => `> \`/${c.command}\` — ${c.count}`).join("\n")
            : "> нет данных";

        const violations = getViolationBreakdown(target.id);
        const violationsText = violations.length
            ? violations.map((v) => `> ${v.label} — ${v.count}`).join("\n")
            : "> нет данных";

        const ts = getTicketStats(target.id);
        const ticketsText = [
            `> Взято в работу: ${ts.handled}`,
            `> Ответов в тикетах: ${ts.answers}`,
            `> Среднее время ответа: ${
                ts.avgResponseMs !== null ? fmtTime(ts.avgResponseMs) : "—"
            }`,
            `> Средняя оценка: ${
                ts.avgRating !== null
                    ? `${ts.avgRating.toFixed(1)} ${client.config.EMOJIS.STAR2} (${ts.ratings.length})`
                    : "—"
            }`,
        ].join("\n");

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `**${client.config.EMOJIS.FOLDER2} Где чаще общается**`,
                    channelsText,
                    "",
                    `**${client.config.EMOJIS.TRASH} Удалённых сообщений:** ${stats.deleted}`,
                ].join("\n")
            )
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [`**${client.config.EMOJIS.BOLT} Частые команды**`, commandsText].join("\n")
            )
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [`**${client.config.EMOJIS.RISK} Выданные нарушения по типам**`, violationsText].join(
                    "\n"
                )
            )
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [`**${client.config.EMOJIS.TICKET} Тикеты**`, ticketsText].join("\n")
            )
        );

        return interaction.editReply({
            components: [container],
            files: [attachment],
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
