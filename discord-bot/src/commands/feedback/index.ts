import { ActionRowBuilder, ChatInputCommandInteraction, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

export async function execute(interaction: ChatInputCommandInteraction) {
    const modal = new ModalBuilder()
        .setCustomId("feedback_modal")
        .setTitle("Оставить отзыв о проекте");

    const rating = new TextInputBuilder()
        .setCustomId("rating")
        .setLabel("Оценка (1-10)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("Например: 10")
        .setMinLength(1)
        .setMaxLength(2);

    const feedback = new TextInputBuilder()
        .setCustomId("feedback")
        .setLabel("Ваш отзыв")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(40)
        .setMaxLength(1000)
        .setPlaceholder("Например: Сервер мне очень нравится, играю уже 2 года!");

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(rating),
        new ActionRowBuilder<TextInputBuilder>().addComponents(feedback)
    );

    await interaction.showModal(modal);
}