import {
    ChatInputCommandInteraction,
    ContainerBuilder,
    GuildMember,
    MessageFlags,
    SlashCommandBuilder,
    TextDisplayBuilder,
} from "discord.js";

import CustomClient from "../../base/classes/CustomClient";
import { buildTicketsList } from "../../event/interactions/ticket/ticketsList";

export default {
    data: new SlashCommandBuilder()
        .setName("tickets")
        .setDescription("Список тикетов игрока")
        .addUserOption((option) =>
            option
                .setName("участник")
                .setDescription("Чьи тикеты показать")
                .setRequired(true)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const client = interaction.client as CustomClient;
        const member = interaction.member as GuildMember;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const isAdmin = client.config.ADMIN_ROLES.some((r) =>
            member.roles.cache.has(r)
        );
        if (!isAdmin) {
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
        const { container, nav } = buildTicketsList(target, 0);

        return interaction.editReply({
            components: [container, nav],
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
