import {
    AttachmentBuilder,
    ChatInputCommandInteraction,
    ContainerBuilder,
    GuildMember,
    MessageFlags,
    SlashCommandBuilder,
    TextDisplayBuilder,
    time,
} from "discord.js";

import CustomClient from "../../base/classes/CustomClient";
import { getTicketByPublicId } from "../../utils/ticketStore";
import {
    transcriptPath,
    transcriptExists,
} from "../../event/interactions/ticket/ticketTranscript";

const CATEGORY_LABEL: Record<string, string> = {
    report: "Жалоба",
    question: "Вопрос",
    bug: "Техническая проблема",
    appeal: "Апелляция",
};

export default {
    data: new SlashCommandBuilder()
        .setName("ticketinfo")
        .setDescription("Информация по тикету и его транскрипт")
        .addStringOption((option) =>
            option
                .setName("id")
                .setDescription("Публичный ID тикета (например, KA7X9F)")
                .setRequired(true)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const client = interaction.client as CustomClient;
        const member = interaction.member as GuildMember;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const reply = (content: string, files: AttachmentBuilder[] = []) =>
            interaction.editReply({
                components: [
                    new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(content)
                    ),
                ],
                files,
                flags: MessageFlags.IsComponentsV2,
            });

        const isAdmin = client.config.ADMIN_ROLES.some((r) =>
            member.roles.cache.has(r)
        );
        if (!isAdmin) {
            return reply(
                `${client.config.EMOJIS.CLOSE} У вас нет прав для использования этой команды.`
            );
        }

        const id = interaction.options.getString("id", true).trim().toUpperCase();
        const ticket = getTicketByPublicId(id);
        const hasFile = transcriptExists(id);

        // тикет уже удалён (30 дней), но транскрипт сохранён — отдаём файл
        if (!ticket) {
            if (hasFile) {
                return reply(
                    `${client.config.EMOJIS.FOLDER2} Тикет \`${id}\` уже закрыт и удалён из архива. Ниже — сохранённый транскрипт.`,
                    [new AttachmentBuilder(transcriptPath(id), { name: `${id}.html` })]
                );
            }
            return reply(`${client.config.EMOJIS.CLOSE} Тикет \`${id}\` не найден.`);
        }

        // тикет существует — показываем инфу
        const lines = [
            `## ${client.config.EMOJIS.TICKET} Тикет \`${ticket.publicId}\``,
            `**Категория:** ${CATEGORY_LABEL[ticket.category] ?? ticket.category}`,
            `**Автор:** <@${ticket.ownerId}>`,
            `**Создан:** ${time(new Date(ticket.createdAt), "F")}`,
            ticket.claimedBy
                ? `**В работе у:** <@${ticket.claimedBy}>`
                : `**В работе у:** —`,
            ticket.closedBy
                ? `**Закрыл:** <@${ticket.closedBy}> · ${
                      ticket.closedAt ? time(new Date(ticket.closedAt), "F") : ""
                  }`
                : `**Статус:** открыт`,
            `**Оценка:** ${ticket.rating !== null ? `${ticket.rating} из 5` : "—"}`,
            `**Ответов модерации:** ${Object.values(ticket.answers).reduce((a, b) => a + b, 0)}`,
        ];

        const files = hasFile
            ? [new AttachmentBuilder(transcriptPath(id), { name: `${id}.html` })]
            : [];

        return reply(lines.join("\n"), files);
    },
};
