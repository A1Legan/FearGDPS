import {
    ChatInputCommandInteraction,
    ContainerBuilder,
    GuildMember,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SlashCommandBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder,
} from "discord.js";

import CustomClient from "../../base/classes/CustomClient";
import { formatDuration } from "./utils/duration";
import { removeActiveBan } from "./utils/activebans";
import {
    checkGlobalCooldown,
    registerGlobalCooldown,
} from "../../base/utils/globalCooldown";
import { sendModLog } from "../../base/utils/modLog";

const UNBAN_COOLDOWN_MS = 30 * 60 * 1000; // глобальные 30 минут
const COOLDOWN_KEY = "unban";

export default {
    data: new SlashCommandBuilder()
        .setName("unban")
        .setDescription("Снять бан с игрока")
        .addUserOption((option) =>
            option
                .setName("участник")
                .setDescription("Игрок, с которого нужно снять бан")
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("причина")
                .setDescription("Причина снятия бана (до 200 символов)")
                .setRequired(true)
                .setMaxLength(200)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const client = interaction.client as CustomClient;
        const moderator = interaction.member as GuildMember;

        // Эфемерный ответ: ошибки/кулдаун видит только модератор,
        // публичное объявление о снятии отправим отдельным followUp.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const editReply = (content: string) =>
            interaction.editReply({
                components: [
                    new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(content)
                    ),
                ],
                flags: MessageFlags.IsComponentsV2,
            });

        const isModerator = client.config.DISCORD_MODERATOR_ROLES.some((role) =>
            moderator.roles.cache.has(role)
        );
        if (!isModerator) {
            return editReply(
                `${client.config.EMOJIS.CLOSE} У вас нет прав для использования этой команды.`
            );
        }

        // --- глобальный кулдаун (общий на всех, 30 минут); админы имеют иммунитет ---
        const isAdmin = client.config.ADMIN_ROLES.some((role) =>
            moderator.roles.cache.has(role)
        );
        if (!isAdmin) {
            const cd = checkGlobalCooldown(COOLDOWN_KEY, UNBAN_COOLDOWN_MS);
            if (!cd.allowed) {
                return editReply(
                    `${client.config.EMOJIS.CLOCK} Команда **/unban** снова будет доступна через ${formatDuration(cd.remainingMs)}.`
                );
            }
        }

        const targetUser = interaction.options.getUser("участник", true);
        const reason = interaction.options.getString("причина", true);

        const targetMember = await interaction.guild!.members
            .fetch(targetUser.id)
            .catch(() => null);
        if (!targetMember) {
            return editReply(
                `${client.config.EMOJIS.CLOSE} Не удалось найти этого игрока на сервере.`
            );
        }

        if (!targetMember.roles.cache.has(client.config.BANNED_ROLE)) {
            return editReply(
                `${client.config.EMOJIS.CLOSE} Этот игрок не забанен.`
            );
        }

        // --- снятие роли бана ---
        try {
            await targetMember.roles.remove(client.config.BANNED_ROLE);
        } catch {
            return editReply(
                `${client.config.EMOJIS.CLOSE} Не удалось снять роль бана (проверьте позицию роли бота).`
            );
        }

        removeActiveBan(targetMember.id, interaction.guild!.id);
        if (!isAdmin) registerGlobalCooldown(COOLDOWN_KEY);

        const guildIcon = interaction.guild!.iconURL({ size: 256 });

        // --- лог в отдельный канал ---
        void sendModLog(client, {
            channelId: client.config.UNBAN_UNMUTE_LOG_CHANNEL,
            color: 0x57f287,
            emoji: client.config.EMOJIS.SUCCESS!,
            title: "Бан снят",
            target: targetUser,
            moderator: interaction.user,
            thumbnail: guildIcon,
            timeLabel: "Когда снято",
            fields: [{ name: "Причина", value: `\`${reason}\`` }],
        });

        const container = new ContainerBuilder().setAccentColor(0x57f287);

        const section = new SectionBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `## ${client.config.EMOJIS.SUCCESS} Бан снят`,
                    `> **Игрок:** ${targetMember}`,
                    `> **Модератор:** ${interaction.user}`,
                ].join("\n")
            )
        );
        if (guildIcon) {
            section.setThumbnailAccessory(
                new ThumbnailBuilder().setURL(guildIcon)
            );
        }
        container.addSectionComponents(section);

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**Причина:** \`${reason}\``)
        );

        const announcement = await interaction.followUp({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
        await interaction.deleteReply().catch(() => null);

        setTimeout(() => {
            announcement.delete().catch(() => null);
        }, 2 * 60 * 1000);
    },
};
