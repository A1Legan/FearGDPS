import {
    ButtonInteraction,
    ContainerBuilder,
    GuildMember,
    MessageFlags,
    PermissionFlagsBits,
    TextChannel,
    TextDisplayBuilder,
} from "discord.js";

import CustomClient from "../../../base/classes/CustomClient";
import {
    claimTicket,
    getOpenTickets,
    getTicket,
} from "../../../utils/ticketStore";
import { titleSection, ownerAvatar } from "./ticket_ui";

export async function execute(interaction: ButtonInteraction) {
    if (interaction.customId !== "ticket_claim") return;

    const client = interaction.client as CustomClient;
    const member = interaction.member as GuildMember;
    const channel = interaction.channel as TextChannel;

    const ephemeral = (content: string) =>
        interaction.reply({
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(content)
                ),
            ],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });

    const ticket = getTicket(channel.id);
    if (!ticket) {
        return ephemeral(
            `${client.config.EMOJIS.CLOSE} Это обращение не найдено в системе.`
        );
    }

    // нельзя работать с уже закрытым тикетом
    if (ticket.closedAt) {
        return ephemeral(
            `${client.config.EMOJIS.CLOSE} Это обращение уже закрыто.`
        );
    }

    // нельзя брать в работу собственное обращение
    if (interaction.user.id === ticket.ownerId) {
        return ephemeral(
            `${client.config.EMOJIS.CLOSE} Нельзя взять в работу собственное обращение.`
        );
    }

    // апелляции рассматривают только админы, остальное — тикет-модерация
    const requiredRoles =
        ticket.category === "appeal"
            ? client.config.ADMIN_ROLES
            : client.config.TICKET_MODERATORS_ROLES;
    const canHandle = requiredRoles.some((r) => member.roles.cache.has(r));

    if (!canHandle) {
        return ephemeral(
            ticket.category === "appeal"
                ? `${client.config.EMOJIS.CLOSE} Апелляции рассматривают только администраторы.`
                : `${client.config.EMOJIS.CLOSE} Брать обращения в работу могут только модераторы.`
        );
    }

    const result = claimTicket(channel.id, interaction.user.id);

    if (!result.ok) {
        if (result.alreadyBy) {
            return ephemeral(
                `${client.config.EMOJIS.CLOSE} Обращение уже взято в работу — <@${result.alreadyBy}>.`
            );
        }
        return ephemeral(`${client.config.EMOJIS.CLOSE} Не удалось взять обращение.`);
    }

    // выдаём взявшему право писать в этом тикете
    await channel.permissionOverwrites
        .edit(interaction.user.id, {
            SendMessages: true,
            ManageMessages: true,
            AttachFiles: true,
            EmbedLinks: true,
        })
        .catch(() => {});

    // прячем остальные открытые тикеты от этого модератора — фокус на одном
    const guild = interaction.guild!;
    for (const other of getOpenTickets()) {
        if (other.channelId === channel.id) continue;
        if (other.ownerId === interaction.user.id) continue; // свои обращения не трогаем
        const ch = (await guild.channels
            .fetch(other.channelId)
            .catch(() => null)) as TextChannel | null;
        if (ch) {
            await ch.permissionOverwrites
                .edit(interaction.user.id, {
                    ViewChannel: false,
                })
                .catch(() => {});
        }
    }

    const avatar = await ownerAvatar(client, ticket.ownerId);
    return interaction.reply({
        components: [
            new ContainerBuilder()
                .setAccentColor(0x57f287)
                .addSectionComponents(
                    titleSection(
                        [
                            `## ${client.config.EMOJIS.HUMAN} Обращение взято в работу`,
                            `Этим обращением занимается ${interaction.user}. Ожидайте ответа.`,
                        ].join("\n"),
                        avatar
                    )
                ),
        ],
        flags: MessageFlags.IsComponentsV2,
    });
}
