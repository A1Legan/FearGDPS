import {
    ContainerBuilder,
    MessageFlags,
    SectionBuilder,
    StringSelectMenuInteraction,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ThumbnailBuilder,
} from "discord.js";

import CustomClient from "../../base/classes/CustomClient";

export async function execute(interaction: StringSelectMenuInteraction) {
    const client = interaction.client as CustomClient;

    const big = () => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large);
    const small = () => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small);

    // блок одной категории правил
    const block = (badge: string, emoji: string, title: string, rules: string[]) =>
        new TextDisplayBuilder().setContent(
            [`### ${badge}  ${emoji}  ${title}`, ...rules.map((r) => `> ${r}`)].join(
                "\n"
            )
        );

    const container = new ContainerBuilder().setAccentColor(0x5865f2);

    // --- шапка с иконкой сервера ---
    const header = new SectionBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            [
                `## ${client.config.EMOJIS.PUSHPIN} Правила сервера`,
            ].join("\n")
        )
    );
    const icon = interaction.guild?.iconURL({ size: 256 });
    if (icon) header.setThumbnailAccessory(new ThumbnailBuilder().setURL(icon));
    container.addSectionComponents(header);

    container.addSeparatorComponents(big());

    // --- 1. Правила GDPS ---
    container.addTextDisplayComponents(
        block("`1`", client.config.EMOJIS.GDPS!, "Правила GDPS", [
            "Запрещены читы, взлом и любая накрутка звёзд/рейтов.",
            "Не эксплуатируйте баги сервера — сообщайте о них администрации.",
            "Не воруйте и не перезаливайте чужие уровни без разрешения автора.",
            "Не выпрашивайте рейты и звёзды у модерации.",
        ])
    );
    container.addSeparatorComponents(small());

    // --- 2. Правила чата ---
    container.addTextDisplayComponents(
        block("`2`", client.config.EMOJIS.HUMAN!, "Правила чата", [
            "Без оскорблений, токсичности и провокаций.",
            "Без спама, флуда, капса и злоупотребления эмодзи.",
            "Без рекламы и стороннего пиара без разрешения администрации.",
            "Без NSFW, шок-контента и запрещённых материалов.",
            "Общайтесь по темам в профильных каналах.",
        ])
    );
    container.addSeparatorComponents(small());

    // --- 3. Правила войса ---
    container.addTextDisplayComponents(
        block("`3`", client.config.EMOJIS.MEGAPHONE!, "Правила войса", [
            "Без криков, писка, соундпадов и раздражающих звуков.",
            "Не записывайте разговоры без согласия участников.",
            "Уважайте собеседников и не перебивайте намеренно.",
            "Запрещён мут-спам и вход/выход ради шума.",
        ])
    );

    container.addSeparatorComponents(big());
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            "-# Незнание правил не освобождает от ответственности."
        )
    );

    await interaction.reply({
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        components: [container],
    });
}
