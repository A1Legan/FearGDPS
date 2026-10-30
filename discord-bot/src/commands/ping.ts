import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export default {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Проверка работы бота"),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.reply("Влад Гамеда уволен!");
    }
};