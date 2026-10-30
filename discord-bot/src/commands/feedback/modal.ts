import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    GuildMember,
    MessageFlags,
    ModalSubmitInteraction,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    ThumbnailBuilder,
    time
} from "discord.js";

import CustomClient from "../../base/classes/CustomClient";
import { getRemainingCooldown, setFeedbackCooldown } from "../../utils/12hCD";
import { isAdmin } from "../../utils/isAdmin";

export async function execute(interaction: ModalSubmitInteraction) {
    if (interaction.customId !== "feedback_modal") return;

    const client = interaction.client as CustomClient;
    const member = interaction.member as GuildMember;

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

    const rating = Number(interaction.fields.getTextInputValue("rating"));
    const feedback = interaction.fields.getTextInputValue("feedback");

    if (isNaN(rating) || rating < 1 || rating > 10) {
        return interaction.reply({
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${client.config.EMOJIS.CLOSE} Оценка должна быть от \`1\` до \`10\`.`
                    )
                ),
            ],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });
    }

    function ratingBar(rating: number): string {
        return "▰".repeat(rating) + "▱".repeat(10 - rating);
    }

    // Цвет акцентной полоски зависит от оценки
    function ratingColor(rating: number): number {
        if (rating <= 3) return 0xff2433; // красный
        if (rating <= 6) return 0xffa807; // жёлтый
        return 0x65ff00; // зелёный
    };

    function ratingEmoji(rating: number): string {
        if (rating <= 3) return `${client.config.EMOJIS.RED}`;
        if (rating <= 6) return `${client.config.EMOJIS.YELLOW}`;
        return `${client.config.EMOJIS.GREEN}`;
    }

    const joinedText = member?.joinedAt
        ? time(member.joinedAt, "D")
        : "неизвестно";

    const container = new ContainerBuilder()
        .setAccentColor(ratingColor(rating))
        // Верхняя секция: аватар + автор + оценка
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## ${ratingEmoji(rating)} Новый отзыв`
                    ),
                    new TextDisplayBuilder().setContent(
                        `**Автор:** ${interaction.user}\n**Оценка:** ${ratingBar(rating)}  \`${rating}/10\`\n**На сервере с:** ${joinedText}`
                    ),
                )
                .setThumbnailAccessory(
                    new ThumbnailBuilder()
                        .setURL(
                            interaction.user.displayAvatarURL({
                                extension: "png",
                                size: 128
                            })
                        )
                        .setDescription("Отправитель")
                )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [`**Отзыв:**`, `>>> ${feedback}`].join("\n")
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# Отправлено ${time(new Date(), "F")}`
            )
        );
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId("feedback_write")
            .setLabel("Написать отзыв")
            .setEmoji(client.getEmoji("PENCIL"))
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId("feedback_rules")
            .setLabel("Правила публикации")
            .setEmoji(client.getEmoji("FOLDER2"))
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("feedback_delete")
            .setLabel("Удалить")
            .setEmoji(client.getEmoji("TRASH"))
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true) // визуальная заглушка, без обработчика
    );

    const channel = await client.channels.fetch(
        client.config.CHANNELS.FEEDBACK
    );

    if (!channel?.isSendable()) {
        return interaction.reply({
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${client.config.EMOJIS.CLOSE} Не удалось найти канал для отзывов.`
                    )
                ),
            ],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });
    }

    await channel.send({
        flags: MessageFlags.IsComponentsV2,
        components: [container, row]
    });

    if (!isAdmin(member, client)) {
        setFeedbackCooldown(interaction.user.id);
    }

    await interaction.reply({
        components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${client.config.EMOJIS.SUCCESS} Ваш отзыв успешно опубликован <3`
                    )
                ),
            ],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
}