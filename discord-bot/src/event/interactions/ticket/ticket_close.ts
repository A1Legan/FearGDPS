import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ContainerBuilder,
    GuildMember,
    MessageFlags,
    TextChannel,
    TextDisplayBuilder,
} from "discord.js";

import CustomClient from "../../../base/classes/CustomClient";
import { getTicket, recordClose } from "../../../utils/ticketStore";
import { scheduleAutoClose } from "./ticket_archive";
import { titleSection, ownerAvatar } from "./ticket_ui";

export async function execute(interaction: ButtonInteraction) {
    const client = interaction.client as CustomClient;
    const customId = interaction.customId;

    const isConfirm = customId.startsWith("ticket_close_confirm:");
    const isCancel = customId === "ticket_close_cancel";

    if (customId !== "ticket_close" && !isConfirm && !isCancel) {
        return;
    }

    const member = interaction.member as GuildMember;
    const channel = interaction.channel as TextChannel;

    const ticket = getTicket(channel.id);
    // апелляции закрывают только админы, остальное — тикет-модерация
    const requiredRoles =
        ticket?.category === "appeal"
            ? client.config.ADMIN_ROLES
            : client.config.TICKET_MODERATORS_ROLES;
    const isModerator = requiredRoles.some((role) =>
        member.roles.cache.has(role)
    );

    const isOwner = channel.topic === interaction.user.id;

    if (!isModerator && !isOwner) {
        return interaction.reply({
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${client.config.EMOJIS.CLOSE} У вас нет прав для закрытия этого обращения.`
                    )
                ),
            ],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });
    }

    if (customId === "ticket_close" && ticket?.closedAt) {
        return interaction.reply({
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${client.config.EMOJIS.CLOSE} Это обращение уже закрывается.`
                    )
                ),
            ],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });
    }

    if (customId === "ticket_close") {
        return interaction.reply({
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent([
                        `### ${client.config.EMOJIS.RISK} Вы уверены, что хотите закрыть тикет?`
                    ].join("\n"))
                ),
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        // передаём id сообщения с кнопками, чтобы потом их убрать
                        .setCustomId(
                            `ticket_close_confirm:${interaction.message.id}`
                        )
                        .setLabel("Закрыть")
                        .setEmoji(client.getEmoji("PADLOCK"))
                        .setStyle(ButtonStyle.Danger),

                    new ButtonBuilder()
                        .setCustomId("ticket_close_cancel")
                        .setLabel("Отмена")
                        .setEmoji(client.getEmoji("CLOSE"))
                        .setStyle(ButtonStyle.Secondary)
                ),
            ],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });
    }

    if (isCancel) {
        return interaction.update({
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${client.config.EMOJIS.SUCCESS} Закрытие тикета отменено.`
                    )
                ),
            ],
        });
    }

    // Фиксируем закрытие и просим игрока оценить работу — архивация после оценки.
    recordClose(channel.id, interaction.user.id);

    const introMsgId = customId.split(":")[1] ?? "";

    await interaction.update({
        components: [
            new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${client.config.EMOJIS.SUCCESS} Тикет будет закрыт после оценки работы модератора.`
                )
            ),
        ],
    });

    const stars = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...[1, 2, 3, 4, 5].map((n) =>
            new ButtonBuilder()
                .setCustomId(`ticket_rate:${introMsgId}:${n}`)
                .setLabel(String(n))
                .setStyle(ButtonStyle.Secondary)
        )
    );

    const skip = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`ticket_rate_skip:${introMsgId}`)
            .setLabel("Закрыть без оценки")
            .setEmoji(client.getEmoji("PADLOCK"))
            .setStyle(ButtonStyle.Danger)
    );

    const avatar = await ownerAvatar(client, channel.topic);
    await channel.send({
        components: [
            new ContainerBuilder()
                .setAccentColor(0xfee75c)
                .addSectionComponents(
                    titleSection(
                        [
                            `## ${client.config.EMOJIS.PUSHPIN} Оцените работу модератора`,
                            `<@${channel.topic}>, пожалуйста, оцените, насколько вам помогли. Если не оценить в течение 12 часов, обращение закроется автоматически.`,
                        ].join("\n"),
                        avatar
                    )
                ),
            stars,
            skip,
        ],
        flags: MessageFlags.IsComponentsV2,
    });

    // авто-закрытие без оценки через 12 часов
    scheduleAutoClose(client, channel.id, introMsgId || null, Date.now());
}