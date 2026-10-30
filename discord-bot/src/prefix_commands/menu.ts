import { GuildMember, Message, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } from "discord.js";
import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";

import CustomClient from "../base/classes/CustomClient";

export default {
    name: "menu",
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
                    `## ${client.config.EMOJIS.GDPS} FearGDPS У величия есть имя`
                )
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    "Добро пожаловать в информационный центр сервера!\n"
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder()
                    .setSpacing(SeparatorSpacingSize.Large)
            ) // разделитель
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent([
                    `• ${client.config.EMOJIS.ROLES} \`Роли\` -- узнай, какие роли есть на сервере, как их получить и что они дают`,
                    `• ${client.config.EMOJIS.HUMAN} \`Стафф\` -- список администрации и модераторов`,
                    `• ${client.config.EMOJIS.CHAIN} \`Ссылки\` -- полезные ресурсы`,
                    `• ${client.config.EMOJIS.PUSHPIN} \`Правила\` -- правила GDPS, чата и войса`
                ].join("\n"))
            )
            .addSeparatorComponents(
                new SeparatorBuilder()
                    .setSpacing(SeparatorSpacingSize.Large)
            ) // разделитель

            const menu = new ActionRowBuilder<StringSelectMenuBuilder>()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("menu_select")
                        .setPlaceholder("Выберите раздел")
                        .addOptions(
                            new StringSelectMenuOptionBuilder()
                                .setLabel("Роли")
                                .setDescription("Информация о ролях")
                                .setValue("roles")
                                .setEmoji(client.getEmoji("ROLES")),

                            new StringSelectMenuOptionBuilder()
                                .setLabel("Стафф")
                                .setDescription("Список администрации")
                                .setValue("staff")
                                .setEmoji(client.getEmoji("HUMAN")),

                            new StringSelectMenuOptionBuilder()
                                .setLabel("Ссылки")
                                .setDescription("Полезные ссылки")
                                .setValue("links")
                                .setEmoji(client.getEmoji("INFO")),

                            new StringSelectMenuOptionBuilder()
                                .setLabel("Правила")
                                .setDescription("Правила GDPS, чата и войса")
                                .setValue("rules")
                                .setEmoji(client.getEmoji("PUSHPIN"))
                        )
                );
        if (!message.channel.isSendable()) return;

        await message.channel.send({
            flags: MessageFlags.IsComponentsV2,
            components: [container, menu]
        });
    }
};