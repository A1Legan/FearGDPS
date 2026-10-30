import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    GuildMember,
    MessageFlags,
    TextChannel,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
} from "discord.js";

import CustomClient from "../../base/classes/CustomClient";
import { titleSection } from "../../event/interactions/ticket/ticket_ui";

export async function execute(
    channel: TextChannel,
    client: CustomClient,
    member: GuildMember,
    publicId = ""
) {
    const container = new ContainerBuilder()
        .addSectionComponents(
            titleSection(
                [
                    "## Инструкция по оформлению тикета",
                    publicId ? `-# Тикет \`${publicId}\`` : "",
                    "",
                    `Добро пожаловать, ${member}!`,
                    "",
                    "Пожалуйста, подробно опишите, что у вас случилось, чтобы администрация могла помочь вам как можно быстрее.",
                ].join("\n"),
                member.displayAvatarURL({ extension: "png", size: 256 })
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        );

    const buttons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("ticket_claim")
                .setLabel("Взять в работу")
                .setEmoji(client.getEmoji("HUMAN"))
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId("ticket_rules")
                .setLabel("Правила")
                .setEmoji(client.getEmoji("FOLDER2"))
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId("ticket_close")
                .setLabel("Закрыть тикет")
                .setEmoji(client.getEmoji("PADLOCK"))
                .setStyle(ButtonStyle.Danger)
        );

    await channel.send({
        components: [
            container,
            buttons,
        ],
        flags: MessageFlags.IsComponentsV2,
    });
}