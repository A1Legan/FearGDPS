import { Client, Events, Message } from "discord.js";

import CustomClient from "../../../base/classes/CustomClient";
import {
    deleteTicketRecord,
    getTicket,
    recordTicketMessage,
} from "../../../utils/ticketStore";
import { unhideModerator } from "./ticket_archive";

/**
 * Считает ответы модерации в тикет-каналах: фиксирует время первого ответа
 * и число ответов каждого модератора. Вызвать один раз при инициализации.
 */
export function registerTicketTracker(client: Client): void {
    client.on(Events.MessageCreate, (message: Message) => {
        if (message.author.bot || !message.guild || !message.member) return;

        // сообщение должно быть в существующем (открытом) тикете
        const ticket = getTicket(message.channelId);
        if (!ticket || ticket.closedAt) return;

        // считаем только сообщения тикет-модерации, не автора обращения
        if (message.author.id === ticket.ownerId) return;

        const cfg = (message.client as CustomClient).config;
        // апелляции ведут админы, остальное — тикет-модерация
        const requiredRoles =
            ticket.category === "appeal"
                ? cfg.ADMIN_ROLES
                : cfg.TICKET_MODERATORS_ROLES;
        const canHandle = requiredRoles.some((r) =>
            message.member!.roles.cache.has(r)
        );
        if (!canHandle) return;

        recordTicketMessage(message.channelId, message.author.id);
    });

    // Удаление канала. Штатное закрытие (тикет уже помечен закрытым) — запись
    // сохраняем для /ticketinfo. Если же канал удалили вручную у ОТКРЫТОГО тикета —
    // чистим запись, чтобы игрок не остался заблокирован, и снимаем скрытие с мода.
    client.on(Events.ChannelDelete, async (channel) => {
        const ticket = getTicket(channel.id);
        if (!ticket) return;
        if (ticket.closedAt) return; // штатно закрыт — запись храним

        const claimer = ticket.claimedBy;
        deleteTicketRecord(channel.id);

        if (claimer && "guild" in channel && channel.guild) {
            await unhideModerator(channel.guild, claimer);
        }
    });
}
