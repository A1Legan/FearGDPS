import {
    ActionRowBuilder,
    ButtonInteraction,
    ContainerBuilder,
    GuildMember,
    MessageFlags,
    SeparatorBuilder,
    SeparatorSpacingSize,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextDisplayBuilder,
} from "discord.js";

import CustomClient from "../../../base/classes/CustomClient";

export async function execute(interaction: ButtonInteraction) {
    if (interaction.customId !== "ticket_create") return;

    const client = interaction.client as CustomClient;
    const member = interaction.member as GuildMember;

    if (member.roles.cache.has(client.config.TICKET_BLOCKED_ROLE)) {
        return interaction.reply({
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent([
                        `# ${client.config.EMOJIS.CLOSE} Создание обращений недоступно`,
                        "",
                        "Вам была выдана перманентная блокировка на создание обращений.",
                        "Чтож вы добились своего, получив такую блокировку вы заполучили статус везунчик (эту блокировку получило 0.02% всех участников сервера)"
                    ].join("\n"))
                ),
            ],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });
    }

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## ${client.config.EMOJIS.TICKET} Создание обращения`
            )
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent([
                "Перед созданием обращения выберите категорию.",
                "",
                "Это поможет администрации быстрее обработать ваш запрос."
            ].join("\n"))
        )
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setSpacing(SeparatorSpacingSize.Large)
        );

    const menu = new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId("ticket_category")
                .setPlaceholder("Выберите категорию обращения...")
                .addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel("Жалоба")
                        .setDescription("Подать жалобу на игрока")
                        .setValue("report")
                        .setEmoji(client.getEmoji("MEGAPHONE")),

                    new StringSelectMenuOptionBuilder()
                        .setLabel("Вопрос")
                        .setDescription("Задать вопрос администрации")
                        .setValue("question")
                        .setEmoji(client.getEmoji("QUESTION")),

                    new StringSelectMenuOptionBuilder()
                        .setLabel("Техническая проблема")
                        .setDescription("Сообщить о проблеме")
                        .setValue("bug")
                        .setEmoji(client.getEmoji("RISK")),

                    new StringSelectMenuOptionBuilder()
                        .setLabel("Аппеляция")
                        .setDescription("Обжаловать блокировку")
                        .setValue("appeal")
                        .setEmoji(client.getEmoji("PADLOCK"))
                )
        );

    await interaction.reply({
        components: [
            container,
            menu,
        ],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
}