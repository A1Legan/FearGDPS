import {
    ActionRowBuilder,
    ButtonInteraction,
    GuildMember,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    time
} from "discord.js";

import CustomClient from "../../../base/classes/CustomClient";
import { getRemainingCooldown } from "../../../utils/12hCD";
import { isAdmin } from "../../../utils/isAdmin";

export async function execute(interaction: ButtonInteraction) {
    if (interaction.customId !== "feedback_write") return;

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

    if (!isAdmin(member, client)) {
        const remaining = getRemainingCooldown(interaction.user.id);

        if (remaining > 0) {
            const readyAt = new Date(Date.now() + remaining);

            return interaction.reply({
                components: [
                    new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `${client.config.EMOJIS.CLOCK} Вы уже оставляли отзыв недавно.\nСледующий отзыв можно оставить ${time(readyAt, "R")}.`
                        )
                    ),
                ],
                flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            });
        }
    }

    const modal = new ModalBuilder()
        .setCustomId("feedback_modal")
        .setTitle("Оставить отзыв")
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("rating")
                    .setLabel("Оценка (1-10)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder("Например: 10")
                    .setMinLength(1)
                    .setMaxLength(2)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("feedback")
                    .setLabel("Ваш отзыв")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMinLength(40)
                    .setMaxLength(1000)
                    .setPlaceholder("Например: Сервер мне очень нравится, играю уже 2 года!")
            )
        );

    await interaction.showModal(modal);
}