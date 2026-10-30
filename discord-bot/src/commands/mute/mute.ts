import {
    ChatInputCommandInteraction,
    ContainerBuilder,
    GuildMember,
    MessageFlags,
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
import { checkMuteCooldown, registerMute } from "../mute/utils/muteCooldown";
import { addTemporaryMute } from "../mute/utils/activemutes";
import { recordMute } from "../mute/utils/muteHistory";
import { sendModLog } from "../../base/utils/modLog";

export default {
    data: new SlashCommandBuilder()
        .setName("mute")
        .setDescription("Выдать игроку мут")
        .addUserOption((option) =>
            option
                .setName("участник")
                .setDescription("Игрок, которого нужно замутить")
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("причина")
                .setDescription("Причина мута (до 200 символов)")
                .setRequired(true)
                .setMaxLength(200)
        )
        .addStringOption((option) =>
            option
                .setName("срок")
                .setDescription("Срок: 30m / 2h / 3d (макс. 27 дней). Без указания - максимум (27 дней)")
                .setRequired(false)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const client = interaction.client as CustomClient;
        const moderator = interaction.member as GuildMember;

        // Откладываем ответ эфемерно: ошибки/статусы видит только модератор,
        // а публичное объявление о наказании отправим отдельным followUp.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // helper для ответа об ошибке/статусе
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

        // Мут всегда временный. Лимит 27 дней (тайм-аут Discord ограничен 28 днями).
        // Срок не указан → максимум (27 дней).
        const MAX_MUTE_MS = 27 * 24 * 60 * 60 * 1000;
        const durationInput = interaction.options.getString("срок");

        let durationMs: number; // всегда число (мут не бывает перманентным)

        if (!durationInput) {
            durationMs = MAX_MUTE_MS;
        } else {
            const parsed = parseDuration(durationInput);

            if (parsed === undefined || parsed === null) {
                return editReply(
                    [
                        `${client.config.EMOJIS.CLOSE} Неверный формат срока.`,
                        "Используйте, например: `30m`, `2h`, `3d`. Без указания срока - максимум (27 дней).",
                    ].join("\n")
                );
            }

            if (parsed > MAX_MUTE_MS) {
                return editReply(
                    `${client.config.EMOJIS.CLOSE} Максимальный срок мута - 27 дней.`
                );
            }

            durationMs = parsed;
        }

        // --- проверка эскалирующего кулдауна модератора (админы имеют иммунитет) ---
        const isAdmin = client.config.ADMIN_ROLES.some((role) =>
            moderator.roles.cache.has(role)
        );

        if (!isAdmin) {
            const cooldown = checkMuteCooldown(moderator.id);

            if (!cooldown.allowed) {
                return editReply(
                    `${client.config.EMOJIS.CLOCK} Вы сможете использовать **/mute** через ${formatDuration(cooldown.remainingMs)}.`
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
        const alreadyMuted = targetMember.roles.cache.has(client.config.MUTED_ROLE);

        // --- проверка роли мута ---
        const mutedRole: Role | undefined = interaction.guild!.roles.cache.get(
            client.config.MUTED_ROLE
        );

        if (!mutedRole) {
            return editReply(
                `${client.config.EMOJIS.CLOSE} Роль мута не найдена на сервере.`
            );
        }

        // --- выдача роли мута ---
        try {
            await targetMember.roles.add(mutedRole);
        } catch {
            return editReply(
                `${client.config.EMOJIS.CLOSE} Не удалось выдать роль мута.`
            );
        }

        // --- регистрация мута (эскалация кулдауна модератора; админов не трогаем) ---
        if (!isAdmin) registerMute(moderator.id);

        const reason = interaction.options.getString("причина", true);
        const expiresAt = Date.now() + durationMs;
        const expiresLabel = formatDuration(durationMs);
        const title = alreadyMuted ? "Мут обновлён" : "Игрок замучен";

        // --- планирование автоснятия роли ---
        addTemporaryMute(client, {
            userId: targetMember.id,
            guildId: interaction.guild!.id,
            roleId: client.config.MUTED_ROLE,
            expiresAt,
        });

        // --- нативный тайм-аут Discord (системная табличка "сможете говорить через...") ---
        // Требует у бота право "Тайм-аут участников" (Moderate Members). Лимит Discord — 28 дней.
        await targetMember.timeout(durationMs, reason).catch(() => null);

        // --- сохранение в историю мутов ---
        recordMute({
            guildId: interaction.guild!.id,
            targetId: targetMember.id,
            targetTag: targetUser.tag,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason,
            durationMs,
            expiresAt,
            wasUpdate: alreadyMuted,
        });

        const guildIcon = interaction.guild!.iconURL({ size: 256 });

        // --- лог в канал ---
        void sendModLog(client, {
            color: 0xed4245,
            emoji: client.config.EMOJIS.MEGAPHONE!,
            title: alreadyMuted ? "Мут обновлён" : "Мут выдан",
            target: targetUser,
            moderator: interaction.user,
            thumbnail: guildIcon,
            fields: [
                { name: "Причина", value: `\`${reason}\`` },
                { name: "Срок", value: expiresLabel },
                { name: "Истекает", value: time(new Date(expiresAt), "F") },
            ],
        });

        // --- публичное сообщение в чат ---
        const publicContainer = new ContainerBuilder().setAccentColor(0xed4245);

        const publicSection = new SectionBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `## ${client.config.EMOJIS.MEGAPHONE} ${title}`,
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
                    `**Срок:** ${expiresLabel}`,
                    `**Истекает:** ${time(new Date(expiresAt), "F")}`,
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
                    `## ${client.config.EMOJIS.MEGAPHONE} Вам выдали мут`,
                    `**Наказание выдал:** ${interaction.user.tag}`,
                    `**Причина:** \`${reason}\``,
                    `**Срок:** ${expiresLabel}`,
                    `**Когда выдано:** ${time(new Date(), "F")}`,
                    `**Истекает:** ${time(new Date(expiresAt), "F")}`,
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
