import {
    ButtonInteraction,
    ContainerBuilder,
    MessageFlags,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextChannel,
    TextDisplayBuilder,
} from "discord.js";

import CustomClient from "../../../base/classes/CustomClient";
import { titleSection, ownerAvatar } from "./ticket_ui";

export async function execute(interaction: ButtonInteraction) {
    if (interaction.customId !== "ticket_rules") return;

    const client = interaction.client as CustomClient;
    const topic = (interaction.channel as TextChannel).topic;
    const avatar = await ownerAvatar(client, topic);

    const container = new ContainerBuilder()
        .addSectionComponents(
            titleSection(
                `## ${client.config.EMOJIS.FOLDER2} Правила создания обращений`,
                avatar
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setSpacing(SeparatorSpacingSize.Large)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent([
                "1. **Не пингуйте нас после каждого своего сообщения**, мы про вас не забыли, а бросать другого пользователя ради вас мы не станем.",
                "2. **Будьте вежливы.** Иногда объяснить причину гнева очень трудно без мата, но постарайтесь проявлять вежливость к техподдержке: это люди, которые добровольно помогают вам каждый день, даже когда у них самих все плохо.",
                "3. **Опишите проблему подробно.** Чем больше информации вы предоставите, тем быстрее мы сможем помочь.",
                "4. **Ожидайте ответа в порядке очереди.** Техподдержка отвечает на все тикеты по мере возможности."
            ].join("\n"))
        )
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setSpacing(SeparatorSpacingSize.Large)
        );

    await interaction.reply({
        components: [container],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
}