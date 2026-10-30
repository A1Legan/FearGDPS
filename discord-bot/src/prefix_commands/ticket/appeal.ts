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
                    "## Инструкция по оформлению аппеляции",
                    publicId ? `-# Тикет \`${publicId}\`` : "",
                    "",
                    `Добро пожаловать, ${member}!`,
                    "",
                    `Пожалуйста, укажите следующую информацию, чтобы администрация могла рассмотреть вашу апелляцию как можно быстрее:`,
                    "",
                    `**1.** Ваш игровой никнейм`,
                    `**2.** Никнейм администратора, выдавшего наказание`,
                    `**3.** Тип наказания (бан/мут/варн) и его срок`,
                    `**4.** Когда вы получили наказание`,
                    `**5.** Причина наказания (по вашему мнению)`,
                    `**6.** Почему вы считаете наказание несправедливым`,
                    `**7.** Доказательства (скриншоты, видео), если имеются`,
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