import { ContainerBuilder, MessageFlags, StringSelectMenuInteraction, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } from "discord.js";

import CustomClient from "../../base/classes/CustomClient";

export async function execute(interaction: StringSelectMenuInteraction) {
    const client = interaction.client as CustomClient;
    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## ${client.config.EMOJIS.HUMAN} Стафф`
            )
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                "Ниже представлен полный список участников команды администрации нашего сервера. Если вам нужно связаться с кем-то из нас в личных сообщениях для решения конкретного вопроса, воспользуйтесь этим списком и приведенными выше описаниями ролей, чтобы определить, к кому лучше всего обратиться."
            )
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                "### Команда проекта:"
            )
        )
        .addSeparatorComponents(
                new SeparatorBuilder()
                    .setSpacing(SeparatorSpacingSize.Large)
            ) // разделитель
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent([
                `• ${client.config.EMOJIS.ADMIN} Администратор: <@898910223576727552> | <@656174179149807617>`,
                `• ${client.config.EMOJIS.ELDER} Elder модератор: <@900764935087337512> | <@1152332814101000232> | <@732959298560196717>`,
                `• ${client.config.EMOJIS.MOD} Модератор: Нет`,
                `• ${client.config.EMOJIS.DS_MOD} Дискорд модератор: <@1237097554265767956> | <@840537308256272434> | <@1387780288847020092>`,
            ].join("\n"))
        )

    await interaction.reply({
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        components: [container]
    });
}