import { GuildMember, Message, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

import CustomClient from "../base/classes/CustomClient";

export default {
    name: "ticket",
    async execute(message: Message) {
        const client = message.client as CustomClient;

        const member = message.member as GuildMember | null;
        const isAdmin =
            !!member &&
            client.config.ADMIN_ROLES.some((r) => member.roles.cache.has(r));
        if (!isAdmin) return;

        await message.delete().catch(() => {});
        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `## ${client.config.EMOJIS.TICKET} Создать тикет`
                )
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent([
                    `Привет! Если ты столкнулся с проблемой или просто возникли вопросы, то создай тикет - мы будем рады помочь.`,
                    `### ${client.config.EMOJIS.INFO} Перед созданием тикета рекомендуется прочитать Q&A`,
                    `\n`,
                    `**${client.config.EMOJIS.QUESTION} Почему мне не отвечают?**`,
                    `Тех. поддержка отвечает на все тикеты, созданные пользователями, в порядке очереди. Не стоит никого торопить, мы обязательно вам ответим.\n`,
                    `**${client.config.EMOJIS.CLOCK} Сколько времени занимает ответ??**`,
                    `Тут всё зависит от сложности вопроса, но мы стараемся отвечать на каждый тикет в течение суток.`,
                ].join("\n"))
            )
            .addSeparatorComponents(
                new SeparatorBuilder()
                    .setSpacing(SeparatorSpacingSize.Large)
            )

            const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId("ticket_create")
                    .setLabel("Создать обращение")
                    .setEmoji(client.getEmoji("PENCIL"))
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId("ticket_rules")
                    .setLabel("Правила")
                    .setEmoji(client.getEmoji("FOLDER2"))
                    .setStyle(ButtonStyle.Secondary)
            );

        if (!message.channel.isSendable()) return;

        await message.channel.send({
            flags: MessageFlags.IsComponentsV2,
            components: [container, buttons]
        });
    }
};