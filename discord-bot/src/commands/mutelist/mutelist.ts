import {
    ChatInputCommandInteraction,
    ContainerBuilder,
    GuildMember,
    MessageFlags,
    SlashCommandBuilder,
    TextDisplayBuilder,
} from "discord.js";

import CustomClient from "../../base/classes/CustomClient";
import { buildMuteListPayload } from "./utils/mutelistPayload";

export default {
    data: new SlashCommandBuilder()
        .setName("mutelist")
        .setDescription("Список всех замученных участников"),

    async execute(interaction: ChatInputCommandInteraction) {
        const client = interaction.client as CustomClient;
        const moderator = interaction.member as GuildMember;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const isModerator = client.config.MODERATOR_ROLES.some((r) =>
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

        if (!interaction.guild) {
            return interaction.editReply({
                components: [
                    new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `${client.config.EMOJIS.CLOSE} Команда доступна только на сервере.`
                        )
                    ),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const payload = await buildMuteListPayload(
            interaction.guild,
            client.config.MUTED_ROLE,
            0
        );

        return interaction.editReply({
            files: payload.files,
            components: payload.components,
        });
    },
};
