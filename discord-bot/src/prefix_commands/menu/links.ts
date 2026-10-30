import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, StringSelectMenuInteraction, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } from "discord.js";

import CustomClient from "../../base/classes/CustomClient";

export async function execute(interaction: StringSelectMenuInteraction) {
    const client = interaction.client as CustomClient;

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## ${client.config.EMOJIS.CHAIN} Полезные ссылки`
            )
        )
        .addSeparatorComponents(
                new SeparatorBuilder()
                    .setSpacing(SeparatorSpacingSize.Large)
            ) // разделитель
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent([
                `• ${client.config.EMOJIS.INTERNET} \`Сайт GDPS\` — официальный сайт проекта`,
                `• ${client.config.EMOJIS.TELEGRAM} \`Telegram\` — телеграм канал проекта`,
                `• ${client.config.EMOJIS.YOUTUBE} \`YouTube\` — ютубчик проекта`,
            ].join("\n"))
        )
        .addSeparatorComponents(
                new SeparatorBuilder()
                    .setSpacing(SeparatorSpacingSize.Large)
            ) // разделитель
        .addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setLabel("Сайт GDPS")
                    .setEmoji(client.getEmoji("INTERNET"))
                    .setStyle(ButtonStyle.Link)
                    .setURL("https://feargdps.ru"),

                new ButtonBuilder()
                    .setLabel("Telegram")
                    .setEmoji(client.getEmoji("TELEGRAM"))
                    .setStyle(ButtonStyle.Link)
                    .setURL("https://t.me/feargdps"),

                new ButtonBuilder()
                    .setLabel("YouTube")
                    .setEmoji(client.getEmoji("YOUTUBE"))
                    .setStyle(ButtonStyle.Link)
                    .setURL("https://youtube.com/@feargdps_news?si=B4P2m350P7rwyqzZ")
            )
        );

    await interaction.reply({
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        components: [container]
    });
}