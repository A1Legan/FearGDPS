import {
    AttachmentBuilder,
    Client,
    ContainerBuilder,
    Guild,
    MessageFlags,
    TextChannel,
    TextDisplayBuilder,
} from "discord.js";

import CustomClient from "../../../base/classes/CustomClient";
import {
    getAwaitingRatingTickets,
    getBusyModerators,
    getOpenTickets,
    getTicket,
    TicketRecord,
} from "../../../utils/ticketStore";
import { generateTranscript, transcriptExists, transcriptPath } from "./ticketTranscript";

const AUTO_CLOSE_MS = 12 * 60 * 60 * 1000; // 12 часов без оценки

const CATEGORY_LABEL: Record<string, string> = {
    report: "Жалоба",
    question: "Вопрос",
    bug: "Техническая проблема",
    appeal: "Апелляция",
};

/**
 * Возвращает модератору доступ ко всем остальным открытым тикетам
 * (снимает персональные запреты на просмотр), если он больше не занят.
 */
export async function unhideModerator(
    guild: Guild,
    modId: string,
    exceptChannelId?: string
): Promise<void> {
    if (getBusyModerators().includes(modId)) return;
    for (const open of getOpenTickets()) {
        if (open.channelId === exceptChannelId) continue;
        if (open.ownerId === modId) continue;
        const ch = (await guild.channels
            .fetch(open.channelId)
            .catch(() => null)) as TextChannel | null;
        if (ch) await ch.permissionOverwrites.delete(modId).catch(() => {});
    }
}

/** Отправляет лог о закрытии + HTML-транскрипт в LOG_CHANNEL. */
async function sendTicketLog(
    client: CustomClient,
    ticket: TicketRecord,
    filePath: string
): Promise<void> {
    const channelId = client.config.LOG_CHANNEL;
    if (!channelId) return;
    try {
        const ch = await client.channels.fetch(channelId);
        if (!ch || !ch.isSendable()) return;
        await ch.send({
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        [
                            `# ${client.config.EMOJIS.TICKET} Тикет закрыт — \`${ticket.publicId}\``,
                            `**Категория:** ${CATEGORY_LABEL[ticket.category] ?? ticket.category}`,
                            `**Автор:** <@${ticket.ownerId}>`,
                            ticket.closedBy ? `**Закрыл:** <@${ticket.closedBy}>` : "",
                            `**Оценка:** ${ticket.rating !== null ? `${ticket.rating} ${client.config.EMOJIS.STAR2}` : "без оценки"}`,
                        ]
                            .filter(Boolean)
                            .join("\n")
                    )
                ),
            ],
            files: [new AttachmentBuilder(filePath, { name: `${ticket.publicId}.html` })],
            flags: MessageFlags.IsComponentsV2,
        });
    } catch {
        /* лог не критичен */
    }
}

/**
 * Закрывает тикет: сохраняет HTML-транскрипт, шлёт его в лог-канал и УДАЛЯЕТ канал.
 * Архивных каналов на сервере не остаётся — вся история живёт в транскриптах.
 * Если транскрипт сохранить не удалось — канал НЕ удаляется, чтобы не потерять переписку.
 */
export async function archiveTicket(
    client: CustomClient,
    channel: TextChannel,
    _introMsgId?: string | null
): Promise<void> {
    const ticket = getTicket(channel.id);

    // сохраняем транскрипт, пока сообщения ещё доступны
    let saved = false;
    if (ticket) {
        const file = await generateTranscript(channel, ticket).catch(() => null);
        saved = file !== null && transcriptExists(ticket.publicId);

        if (!saved) {
            // не удалось сохранить — оставляем канал, чтобы не потерять историю
            await channel
                .send({
                    components: [
                        new ContainerBuilder().addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `${client.config.EMOJIS.CLOSE} Не удалось сохранить транскрипт — канал оставлен, чтобы не потерять переписку. Сообщите разработчику.`
                            )
                        ),
                    ],
                    flags: MessageFlags.IsComponentsV2,
                })
                .catch(() => null);
            return;
        }
    }

    // возвращаем модератору доступ к остальным тикетам
    if (ticket?.claimedBy) {
        await unhideModerator(channel.guild, ticket.claimedBy, channel.id);
    }

    // лог + транскрипт в LOG_CHANNEL
    if (ticket && saved) {
        await sendTicketLog(client, ticket, transcriptPath(ticket.publicId));
    }

    // удаляем сам канал — архив больше не нужен
    await channel.delete("Тикет закрыт (сохранён транскрипт)").catch(() => null);
}

/**
 * Планирует авто-закрытие тикета без оценки через оставшееся до 12 часов время.
 */
export function scheduleAutoClose(
    client: CustomClient,
    channelId: string,
    _introMsgId: string | null,
    closedAt: number
): void {
    const remaining = Math.max(0, closedAt + AUTO_CLOSE_MS - Date.now());

    setTimeout(async () => {
        const t = getTicket(channelId);
        if (!t || t.rating !== null) return; // оценили — авто-закрытие не нужно
        const ch = (await client.channels.fetch(channelId).catch(() => null)) as
            | TextChannel
            | null;
        if (!ch) return;
        await archiveTicket(client, ch);
    }, remaining);
}

/**
 * При старте бота до-планирует авто-закрытие тикетов, которые ждут оценки.
 * Вызвать один раз в обработчике clientReady.
 */
export function restoreTicketAutoClose(client: Client): void {
    const custom = client as CustomClient;
    for (const t of getAwaitingRatingTickets()) {
        scheduleAutoClose(custom, t.channelId, null, t.closedAt!);
    }
}
