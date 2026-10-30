import { ButtonInteraction, ContainerBuilder, MessageFlags, TextDisplayBuilder, } from "discord.js";
import CustomClient from "../../../base/classes/CustomClient";

export async function execute(interaction: ButtonInteraction) {
    if (interaction.customId !== "feedback_rules") return;

    const client = interaction.client as CustomClient;
    const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent([
            `## ${client.config.EMOJIS.PUSHPIN} Основные правила!`
        ].join("\n")),
        new TextDisplayBuilder().setContent([
            `\`1.\` **Запрещен спам и флуд:** отзывы в духе «круто», «норм», «10/10» без объяснения причин будут удалены. \`\`\`При частом нарушении будет выдан запрет на публикацию отзывов\`\`\``,
            `\`2.\` **Актуальность:** пишите отзыв только на основе __личного и недавнего опыта__ пребывания на проекте.\`\`\`В противном случае отзыв будет удален\`\`\``,
            `## Что удаляется сразу!`,
            `• Любой переход на личности, токсичность, агрессия в адрес администрации, разработчиков или других игроков`,
            `• Упоминание сторонних проектов, серверов или публикация ссылок`,
            `## Технические правила!`,
            `Отзывы - это не место для баг-трекера. Нашли баг? Напишите в <#${client.config.APPEAL_CHANNEL}>`,
        ].join("\n"))
    );

    await interaction.reply({
        components: [container],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
}