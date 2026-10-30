import {
    ChatInputCommandInteraction,
    ContainerBuilder,
    GuildMember,
    MessageFlags,
    SlashCommandBuilder,
    TextDisplayBuilder,
} from "discord.js";

import CustomClient from "../base/classes/CustomClient";
import * as Feedback from "./feedback/index";

export default {
    data: new SlashCommandBuilder()
        .setName("feedback")
        .setDescription("Оставить отзыв о проекте"),

    async execute(interaction: ChatInputCommandInteraction) {
        const client = interaction.client as CustomClient;
        const member = interaction.member as GuildMember;

        if (member.roles.cache.has(client.config.FEEDBACK_BLOCKED_ROLE)) {
            return interaction.reply({
                components: [
                    new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent([
                            `# ${client.config.EMOJIS.CLOSE} Публикация отзывов недоступна`,
                            "",
                            "Вам была выдана перманентная блокировка за нарушение правил публикации.",
                            `Подать апелляцию можно в канале <#${client.config.APPEAL_CHANNEL}>`
                        ].join("\n"))
                    ),
                ],
                flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            });
        }

        await Feedback.execute(interaction);
    }
};