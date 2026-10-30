import {
    ButtonInteraction,
    ContainerBuilder,
    GuildMember,
    MessageFlags,
    TextChannel,
    TextDisplayBuilder,
} from "discord.js";

import CustomClient from "../../../base/classes/CustomClient";
import { getTicket, setRating } from "../../../utils/ticketStore";
import { archiveTicket } from "./ticket_archive";

export async function execute(interaction: ButtonInteraction) {
    const id = interaction.customId;
    const isRate = id.startsWith("ticket_rate:");
    const isSkip = id.startsWith("ticket_rate_skip:");
    if (!isRate && !isSkip) return;

    const client = interaction.client as CustomClient;
    const member = interaction.member as GuildMember;
    const channel = interaction.channel as TextChannel;

    const parts = id.split(":");
    const introMsgId = parts[1] ?? "";
    const rating = isRate ? Number(parts[2]) : null;

    const ephemeral = (content: string) =>
        interaction.reply({
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(content)
                ),
            ],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });

    const ticketForRoles = getTicket(channel.id);
    const requiredRoles =
        ticketForRoles?.category === "appeal"
            ? client.config.ADMIN_ROLES
            : client.config.TICKET_MODERATORS_ROLES;
    const isModerator = requiredRoles.some((r) => member.roles.cache.has(r));
    const isOwner = channel.topic === interaction.user.id;

    // оценивать может только автор обращения; пропустить — модератор или автор
    if (isRate && !isOwner) {
        return ephemeral(
            `${client.config.EMOJIS.CLOSE} Оценить работу может только автор обращения.`
        );
    }
    if (isSkip && !isModerator && !isOwner) {
        return ephemeral(
            `${client.config.EMOJIS.CLOSE} У вас нет прав закрыть это обращение.`
        );
    }

    if (isRate && rating) {
        setRating(channel.id, rating);
    }

    const ticket = getTicket(channel.id);

    // подтверждение вместо кнопок оценки
    await interaction.update({
        components: [
            new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    isRate
                        ? `${client.config.EMOJIS.SUCCESS} Спасибо за оценку — ${rating} из 5`
                        : `${client.config.EMOJIS.SUCCESS} Обращение закрыто без оценки.`
                )
            ),
        ],
    });

    // архивация и закрытие (общая логика)
    await archiveTicket(client, channel, introMsgId || null);
}
