import { ContainerBuilder, MessageFlags, StringSelectMenuInteraction, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } from "discord.js";

import CustomClient from "../../base/classes/CustomClient";

export async function execute(interaction: StringSelectMenuInteraction) {
    const client = interaction.client as CustomClient;
    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## ${client.config.EMOJIS.ROLES} Роли за уровень`
            )
        )
        .addSeparatorComponents(
                new SeparatorBuilder()
                    .setSpacing(SeparatorSpacingSize.Large)
            ) // разделитель
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent([
                    `> <@&1520840780259004457>`,
                    `> <@&1520840721941139698>`,
                    `> <@&1520840681906766006>`,
                    `> <@&1520840649031549168>`,
                    `> <@&1520840531628785804>`,
                    `> <@&1520840479137337575>`,
                    `> <@&1520840412141584535>`,
                    `> <@&1520840347595313395>`,
                    `> <@&1520840060033830942>`,
                    `> <@&1520839899346108736>`,
                    `> <@&1520839860116787381>`,
                    `> <@&1520839817053868123>`,
                    `> <@&1520839666805510289>`,
                    `> <@&1520839601390882997>`,
                    `> <@&1520839521053311226>`
                ].join("\n"))
        );

    await interaction.reply({
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        components: [container]
    });
}