import {
    ChatInputCommandInteraction,
    ContainerBuilder,
    GuildMember,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SlashCommandBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder,
    time,
} from "discord.js";

import CustomClient from "../../base/classes/CustomClient";
import {
    recordWarn,
    registerActiveWarn,
    resetActiveWarns,
    VIOLATION_TYPES,
} from "../warn/utils/warnHistory";

export default {
    data: new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Выдать предупреждение (дисциплинарное)")
        .addUserOption((option) =>
            option
                .setName("участник")
                .setDescription("Кому выдать предупреждение")
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("тип")
                .setDescription("Тип нарушения")
                .setRequired(true)
                .addChoices(
                    ...Object.entries(VIOLATION_TYPES).map(([value, name]) => ({
                        name,
                        value,
                    }))
                )
        )
        .addStringOption((option) =>
            option
                .setName("причина")
                .setDescription("Причина предупреждения (необязательно)")
                .setRequired(false)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const client = interaction.client as CustomClient;
        const issuer = interaction.member as GuildMember;

        await interaction.deferReply();

        const editReply = (content: string) =>
            interaction.editReply({
                components: [
                    new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(content)
                    ),
                ],
                flags: MessageFlags.IsComponentsV2,
            });

        const isAdmin = client.config.ADMIN_ROLES.some((r) =>
            issuer.roles.cache.has(r)
        );
        if (!isAdmin) {
            return editReply(
                `${client.config.EMOJIS.CLOSE} Эта команда доступна только администрации.`
            );
        }

        const targetUser = interaction.options.getUser("участник", true);

        if (targetUser.bot || targetUser.id === interaction.user.id) {
            return editReply(
                `${client.config.EMOJIS.CLOSE} Нельзя предупредить бота или самого себя.`
            );
        }

        const targetMember = await interaction.guild!.members
            .fetch(targetUser.id)
            .catch(() => null);

        if (!targetMember) {
            return editReply(
                `${client.config.EMOJIS.CLOSE} Не удалось найти этого игрока на сервере.`
            );
        }

        const category = interaction.options.getString("тип", true);
        const reason = interaction.options.getString("причина")?.trim() || "";
        const categoryLabel = VIOLATION_TYPES[category] ?? category;

        // --- сохранение в историю и подсчёт номера предупреждения ---
        recordWarn({
            guildId: interaction.guild!.id,
            targetId: targetMember.id,
            targetTag: targetUser.tag,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            reason,
            category,
        });

        // активные варны с учётом затухания (1 варн сгорает за каждые 2 недели без новых)
        const activeWarns = registerActiveWarn(targetMember.id);
        const stage = Math.min(activeWarns, 3); // 1, 2 или 3

        // --- на 3-м предупреждении снимаем с должности (роли MODERATOR_ROLES) ---
        let dismissed = false;
        if (stage >= 3) {
            for (const rid of client.config.MODERATOR_ROLES) {
                if (targetMember.roles.cache.has(rid)) {
                    await targetMember.roles.remove(rid).catch(() => {});
                    dismissed = true;
                }
            }
            // после снятия счётчик активных варнов обнуляется
            resetActiveWarns(targetMember.id);
        }

        const ordinal = stage === 1 ? "первое" : stage === 2 ? "второе" : "третье";

        // --- сообщение в ЛС (по ступени) ---
        const dmLines: string[] = [];
        if (stage === 1) {
            dmLines.push(
                `## ${client.config.EMOJIS.RISK} Вы получили первое предупреждение (1/3)`,
                "Пожалуйста, соблюдайте установленные правила."
            );
        } else if (stage === 2) {
            dmLines.push(
                `## ${client.config.EMOJIS.RISK} Вы получили второе предупреждение (2/3)`,
                "Это уже второе нарушение — будьте внимательнее, следующее станет последним."
            );
        } else {
            dmLines.push(
                `## ${client.config.EMOJIS.RISK} Вы получили третье и последнее предупреждение (3/3)`,
                "К сожалению, вы не соблюдали установленные правила, поэтому мы вынуждены снять вас с должности."
            );
        }
        dmLines.push("", `**Тип нарушения:** ${categoryLabel}`);
        if (reason) dmLines.push(`**Причина:** \`${reason}\``);
        dmLines.push(`**Когда:** ${time(new Date(), "F")}`);

        const guildIcon = interaction.guild!.iconURL({ size: 256 });
        const dm = new ContainerBuilder().setAccentColor(0xfee75c);
        const dmSection = new SectionBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(dmLines.join("\n"))
        );
        if (guildIcon) {
            dmSection.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
        }
        dm.addSectionComponents(dmSection);

        await targetMember
            .send({ components: [dm], flags: MessageFlags.IsComponentsV2 })
            .catch(() => null);

        const container = new ContainerBuilder().setAccentColor(0xfee75c);
        const section = new SectionBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `## ${client.config.EMOJIS.RISK} Выдано ${ordinal} предупреждение (${stage}/3)`,
                    `> **Игрок:** ${targetMember}`,
                    `> **Администратор:** ${interaction.user}`,
                ].join("\n")
            )
        );
        if (guildIcon) {
            section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
        }
        container.addSectionComponents(section);

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const detailLines = [`**Тип нарушения:** ${categoryLabel}`];
        if (reason) detailLines.push(`**Причина:** \`${reason}\``);
        if (dismissed) {
            detailLines.push(
                "",
                `${client.config.EMOJIS.CLOSE} Игрок снят с должности — модераторские роли сняты.`
            );
        }
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(detailLines.join("\n"))
        );

        await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });

        setTimeout(() => {
            interaction.deleteReply().catch(() => null);
        }, 2 * 60 * 1000);
    },
};
