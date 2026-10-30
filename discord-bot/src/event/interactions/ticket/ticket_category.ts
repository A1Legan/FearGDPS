import {
    ChannelType,
    ContainerBuilder,
    GuildMember,
    MessageFlags,
    PermissionFlagsBits,
    StringSelectMenuInteraction,
    TextDisplayBuilder,
    TextChannel,
    OverwriteResolvable,
    time,
} from "discord.js";

import CustomClient from "../../../base/classes/CustomClient";
import {
    createTicket,
    deleteTicketRecord,
    getBusyModerators,
    getOpenRegularTicket,
} from "../../../utils/ticketStore";
import { getAppealCooldown, setAppealCooldown } from "../../../utils/appealCooldown";
import { getActiveWarns } from "../../../commands/warn/utils/warnHistory";

import * as Appeal from "../../../prefix_commands/ticket/appeal";
import * as Problem from "../../../prefix_commands/ticket/problem";
import * as Question from "../../../prefix_commands/ticket/question";
import * as Report from "../../../prefix_commands/ticket/report";

export async function execute(interaction: StringSelectMenuInteraction) {
    if (interaction.customId !== "ticket_category") return;

    const client = interaction.client as CustomClient;
    const member = interaction.member as GuildMember;

    const value = interaction.values[0];

    const parent = (interaction.channel as TextChannel).parentId;

    if (!parent) {
        return interaction.reply({
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${client.config.EMOJIS.CLOSE} Не удалось определить категорию.`
                    )
                ),
            ],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });
    }

    const err = (content: string) =>
        interaction.reply({
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(content)
                ),
            ],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });

    // --- ограничения на создание (админы в обход) ---
    const isAdminUser = client.config.ADMIN_ROLES.some((r) =>
        member.roles.cache.has(r)
    );
    if (!isAdminUser) {
        if (value === "appeal") {
            // Апелляцию можно открыть только при наличии активного наказания.
            const hasBan = member.roles.cache.has(client.config.BANNED_ROLE);
            const hasMute = member.roles.cache.has(client.config.MUTED_ROLE);
            const hasWarns = getActiveWarns(interaction.user.id) > 0;
            if (!hasBan && !hasMute && !hasWarns) {
                return err(
                    `${client.config.EMOJIS.CLOSE} У вас нет активных наказаний — апелляцию открывать не по чему.`
                );
            }

            const remaining = getAppealCooldown(interaction.user.id);
            if (remaining > 0) {
                const readyAt = new Date(Date.now() + remaining);
                return err(
                    `${client.config.EMOJIS.CLOCK} Апелляцию можно подавать раз в 2 часа. Попробуйте снова ${time(readyAt, "R")}.`
                );
            }
        } else {
            const existing = getOpenRegularTicket(interaction.user.id);
            if (existing) {
                // проверяем, что канал ещё существует (мог быть удалён)
                const ch = await interaction.guild!.channels
                    .fetch(existing.channelId)
                    .catch(() => null);
                if (ch) {
                    return err(
                        `${client.config.EMOJIS.CLOSE} У вас уже есть рабочее обращение — <#${existing.channelId}>. Дождитесь его закрытия, прежде чем создавать новое.`
                    );
                }
                // канал удалён — чистим запись и разрешаем создать новый
                deleteTicketRecord(existing.channelId);
            }
        }
    }

    const overwrites: OverwriteResolvable[] = [
        {
            id: interaction.guild!.roles.everyone.id,
            deny: [
                PermissionFlagsBits.ViewChannel,
            ],
        },
        {
            id: interaction.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks,
            ],
        },
    ];

    // администрация — полный доступ к любому тикету (эскалация: могут писать где угодно)
    for (const role of client.config.ADMIN_ROLES) {
        overwrites.push({
            id: role,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks,
            ],
        });
    }

    // тикет-модерация (кроме апелляций) — только ПРОСМОТР, писать нельзя до взятия в работу
    if (value !== "appeal") {
        for (const role of client.config.TICKET_MODERATORS_ROLES) {
            overwrites.push({
                id: role,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.ReadMessageHistory,
                ],
            });
        }
    }

    // занятым модераторам новый тикет не показываем (они заняты своим)
    for (const modId of getBusyModerators()) {
        if (modId === interaction.user.id) continue;
        overwrites.push({
            id: modId,
            deny: [PermissionFlagsBits.ViewChannel],
        });
    }

    const channel = await interaction.guild!.channels.create({
        name: `${value}-${interaction.user.username}`.toLowerCase(),
        type: ChannelType.GuildText,
        parent,
        topic: interaction.user.id,
        permissionOverwrites: overwrites,
    });

    const ticket = channel as TextChannel;

    const publicId = createTicket({
        channelId: ticket.id,
        ownerId: interaction.user.id,
        category: value ?? "unknown",
    });

    // апелляция расходует 2-часовой кулдаун
    if (value === "appeal") {
        setAppealCooldown(interaction.user.id);
    }

    switch (value) {
        case "bug":
            await Problem.execute(ticket, client, member, publicId);
            break;
        case "question":
            await Question.execute(ticket, client, member, publicId);
            break;
        case "appeal":
            await Appeal.execute(ticket, client, member, publicId);
            break;
        case "report":
            await Report.execute(ticket, client, member, publicId);
            break;
    }

    await interaction.update({
        components: [
            new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent([
                    `### ${client.config.EMOJIS.SUCCESS} Вы успешно создали обращение.`,
                    `Перейти в обсуждение — ${ticket}`
                ].join("\n"))
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
    });
}