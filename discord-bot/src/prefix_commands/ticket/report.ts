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
                    "## Инструкция по оформлению жалобы на игрока/модератора",
                    publicId ? `-# Тикет \`${publicId}\`` : "",
                    "",
                    `Добро пожаловать, ${member}!`,
                    "",
                    `Пожалуйста, укажите следующую информацию, чтобы администрация могла рассмотреть вашу жалобу как можно быстрее:`,
                    "",
                    `**1.** Ваш игровой никнейм`,
                    `**2.** Никнейм игрока/модератора, на которого подаётся жалоба`,
                    `**3.** Дата и примерное время инцидента`,
                    `**4.** Суть нарушения (что именно произошло)`,
                    `**5.** Доказательства (скриншоты, видео) — обязательны для рассмотрения`,
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