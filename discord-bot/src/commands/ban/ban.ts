import {
    ChatInputCommandInteraction,
    ContainerBuilder,
    GuildMember,
    MessageFlags,
    PermissionFlagsBits,
    Role,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SlashCommandBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder,
    time,
} from "discord.js";

import CustomClient from "../../base/classes/CustomClient";
import { parseDuration, formatDuration } from "../ban/utils/duration";
import { checkBanCooldown, registerBan } from "../ban/utils/banCooldown";
import { addTemporaryBan } from "../ban/utils/activebans";
import { recordBan } from "../ban/utils/banHistory";
import { sendModLog } from "../../base/utils/modLog";

export default {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Выдать игроку наказание")
        .addUserOption((option) =>
            option
                .setName("участник")
                .setDescription("Игрок, которого нужно наказать")
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("причина")
                .setDescription("Причина наказания (до 200 символов)")
                .setRequired(true)
                .setMaxLength(200)
        )
        .addStringOption((option) =>
            option
                .setName("срок")
                .setDescription("Срок: 30m / 2h / 3d (макс. 14 дней). Без указания - бан навсегда")
                .setRequired(false)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const client = interaction.client as CustomClient;
        const moderator = interaction.member as GuildMember;

        // Откладываем ответ эфемерно: ошибки/статусы видит только модератор,
        // а публичное объявление о наказании отправим отдельным followUp.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // helper для эфемерного ответа об ошибке/статусе
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

        // Срок не указан → бан навсегда. Указан → временный, максимум 14 дней.
        const MAX_BAN_MS = 14 * 24 * 60 * 60 * 1000;
        const durationInput = interaction.options.getString("срок");

        let durationMs: number | null; // null = навсегда

        if (!durationInput) {
            durationMs = null;
        } else {
            const parsed = parseDuration(durationInput);

            if (parsed === undefined || parsed === null) {
                return editReply(
                    [
                        `${client.config.EMOJIS.CLOSE} Неверный формат срока.`,
                        "Используйте, например: `30m`, `2h`, `3d`. Без указания срока - бан навсегда.",
                    ].join("\n")
                );
            }

            if (parsed > MAX_BAN_MS) {
                return editReply(
                    `${client.config.EMOJIS.CLOSE} Максимальный срок наказания - 14 дней.`
                );
            }

            durationMs = parsed;
        }

        // --- проверка эскалирующего кулдауна модератора (админы имеют иммунитет) ---
        const isAdmin = client.config.ADMIN_ROLES.some((role) =>
            moderator.roles.cache.has(role)
        );

        if (!isAdmin) {
            const cooldown = checkBanCooldown(moderator.id);

            if (!cooldown.allowed) {
                return editReply(
                    `${client.config.EMOJIS.CLOCK} Вы сможете использовать **/ban** через ${formatDuration(cooldown.remainingMs)}.`
                );
            }
        }

        // --- получение и проверка цели ---
        const targetUser = interaction.options.getUser("участник", true);

        if (targetUser.bot || targetUser.id === interaction.user.id) {
            return editReply(
                `${client.config.EMOJIS.CLOSE} Нельзя наказать бота или самого себя.`
            );
        }

        const targetMember = await interaction.guild!.members
            .fetch(targetUser.id)
            .catch(() => null);

        if (!targetMember) {
            return editReply(
                `${client.config.EMOJIS.CLOSE} Не удалось найти этого игрока на сервере.`
            );
        }

        // --- защита модераторов и админов ---
        // Владелец наказывает любого; админ — модераторов, но не других админов;
        // обычный модератор — только рядовых участников.
        const moderatorIsOwner = interaction.guild!.ownerId === moderator.id;
        const targetIsAdmin = client.config.ADMIN_ROLES.some((role) =>
            targetMember.roles.cache.has(role)
        );
        const targetIsModerator = client.config.DISCORD_MODERATOR_ROLES.some(
            (role) => targetMember.roles.cache.has(role)
        );

        if (targetIsAdmin && !moderatorIsOwner) {
            return editReply(
                `${client.config.EMOJIS.CLOSE} Нельзя наказать администратора.`
            );
        }

        if (targetIsModerator && !isAdmin && !moderatorIsOwner) {
            return editReply(
                `${client.config.EMOJIS.CLOSE} Нельзя наказать другого модератора.`
            );
        }

        // --- проверка иерархии: не-админам нужна роль выше цели ---
        if (
            !moderatorIsOwner &&
            !isAdmin &&
            moderator.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0
        ) {
            return editReply(
                `${client.config.EMOJIS.CLOSE} Вы не можете наказать игрока с ролью выше или равной вашей.`
            );
        }

        // --- проверка, может ли бот управлять целью (позиция роли бота) ---
        if (!targetMember.manageable) {
            return editReply(
                `${client.config.EMOJIS.CLOSE} Роль игрока выше роли бота - не могу выдать наказание.`
            );
        }

        // --- предупреждение о повторном наказании (обновление срока) ---
        const alreadyBanned = targetMember.roles.cache.has(client.config.BANNED_ROLE);

        // --- преполётные проверки роли наказания и прав бота ---
        const botMember = interaction.guild!.members.me!;

        const bannedRole: Role | undefined = interaction.guild!.roles.cache.get(
            client.config.BANNED_ROLE
        );

        if (!bannedRole) {
            return editReply(
                `${client.config.EMOJIS.CLOSE} Роль наказания не найдена на сервере.`
            );
        }

        // --- выдача роли наказания ---
        try {
            await targetMember.roles.add(bannedRole);
        } catch {
            return editReply(
                `${client.config.EMOJIS.CLOSE} Не удалось выдать роль наказания.`
            );
        }

        // --- регистрация бана (эскалация кулдауна модератора; админов не трогаем) ---
        if (!isAdmin) registerBan(moderator.id);

        // --- планирование автоснятия роли ---
        addTemporaryBan(client, {
            userId: targetMember.id,
            guildId: interaction.guild!.id,
            roleId: client.config.BANNED_ROLE,
            expiresAt: durationMs === null ? null : Date.now() + durationMs,
        });

        const reason = interaction.options.getString("причина", true);
        const expiresAt = durationMs === null ? null : Date.now() + durationMs;
        const expiresLabel = durationMs === null ? "навсегда" : formatDuration(durationMs);
        const title = alreadyBanned ? "Наказание обновлено" : "Игрок наказан";

        // --- сохранение в историю банов ---
        recordBan({
            guildId: interaction.guild!.id,
            targetId: targetMember.id,
            targetTag: targetUser.tag,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason,
            durationMs,
            expiresAt,
            wasUpdate: alreadyBanned,
        });

        const guildIcon = interaction.guild!.iconURL({ size: 256 });

        // --- лог в канал ---
        void sendModLog(client, {
            color: 0xed4245,
            emoji: client.config.EMOJIS.PADLOCK!,
            title: alreadyBanned ? "Бан обновлён" : "Бан выдан",
            target: targetUser,
            moderator: interaction.user,
            thumbnail: guildIcon,
            fields: [
                { name: "Причина", value: `\`${reason}\`` },
                { name: "Срок", value: expiresLabel },
                {
                    name: "Истекает",
                    value:
                        expiresAt === null
                            ? "никогда (перманентный)"
                            : time(new Date(expiresAt), "F"),
                },
            ],
        });

        // --- публичное сообщение в чат ---
        const publicContainer = new ContainerBuilder().setAccentColor(0xed4245);

        const publicSection = new SectionBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `## ${client.config.EMOJIS.PADLOCK} ${title}`,
                    `> **Игрок:** ${targetMember}`,
                    `> **Модератор:** ${interaction.user}`,
                ].join("\n")
            )
        );
        if (guildIcon) {
            publicSection.setThumbnailAccessory(
                new ThumbnailBuilder().setURL(guildIcon)
            );
        }
        publicContainer.addSectionComponents(publicSection);

        publicContainer.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        publicContainer.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `**Причина:** \`${reason}\``,
                    `**Истекает:** ${
                        durationMs === null
                            ? "никогда (перманентное наказание)"
                            : time(new Date(expiresAt!), "F")
                    }`,
                ].join("\n")
            )
        );

        // Публичное объявление в чат (followUp, т.к. основной ответ эфемерный)
        const announcement = await interaction.followUp({
            components: [publicContainer],
            flags: MessageFlags.IsComponentsV2,
        });
        // Убираем эфемерную "загрузку" — остаётся только публичное объявление
        await interaction.deleteReply().catch(() => null);

        // Удаляем публичное объявление через 2 минуты
        setTimeout(() => {
            announcement.delete().catch(() => null);
        }, 2 * 60 * 1000);

        // --- сообщение в ЛС (с миниатюрой-аватаркой сервера) ---
        const dmContainer = new ContainerBuilder().setAccentColor(0xed4245);

        const dmSection = new SectionBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `## ${client.config.EMOJIS.MEGAPHONE} Вы были наказаны`,
                    `**Наказание выдал:** ${interaction.user.tag}`,
                    `**Причина:** \`${reason}\``,
                    `**Когда выдано:** ${time(new Date(), "F")}`,
                    `**Истекает:** ${
                        durationMs === null
                            ? "никогда (перманентное наказание)"
                            : time(new Date(expiresAt!), "F")
                    }`,
                ].join("\n")
            )
        );
        if (guildIcon) {
            dmSection.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
        }
        dmContainer.addSectionComponents(dmSection);

        dmContainer.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        dmContainer.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `Если вы не согласны с наказанием, обжаловать его можно здесь: <#${client.config.APPEAL_CHANNEL}>`,
                ].join("\n")
            )
        );

        await targetMember
            .send({
                components: [dmContainer],
                flags: MessageFlags.IsComponentsV2,
            })
            .catch(() => null); // ЛС могут быть закрыты - тихо игнорируем
    },
};
