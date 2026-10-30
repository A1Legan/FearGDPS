import {
    ChatInputCommandInteraction,
    ContainerBuilder,
    GuildMember,
    MessageFlags,
    SlashCommandBuilder,
    TextDisplayBuilder,
} from "discord.js";

import CustomClient from "../../base/classes/CustomClient";
import { buildHistoryPayload } from "../history/utils/historyPayload";

export default {
    data: new SlashCommandBuilder()
        .setName("history")
        .setDescription("История наказаний участника")
        .addUserOption((option) =>
            option
                .setName("участник")
                .setDescription("Игрок, чью историю показать")
                .setRequired(true)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const client = interaction.client as CustomClient;
        const moderator = interaction.member as GuildMember;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const isModerator = client.config.DISCORD_MODERATOR_ROLES.some((r) =>
            moderator.roles.cache.has(r)
        );
        if (!isModerator) {
            return interaction.editReply({
                components: [
                    new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `${client.config.EMOJIS.CLOSE} У вас нет прав для использования этой команды.`
                        )
                    ),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const target = interaction.options.getUser("участник", true);
        const payload = await buildHistoryPayload(target, 0);

        return interaction.editReply({
            files: payload.files,
            components: payload.components,
        });
    },
};
