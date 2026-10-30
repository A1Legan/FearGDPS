import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    User,
    time,
} from "discord.js";

import { getTicketsByOwner } from "../../../utils/ticketStore";
import { transcriptExists } from "./ticketTranscript";

const PER_PAGE = 5;

const CATEGORY_LABEL: Record<string, string> = {
    report: "Жалоба",
    question: "Вопрос",
    bug: "Техпроблема",
    appeal: "Апелляция",
};

export interface TicketsPayload {
    components: ContainerBuilder[];
    extraRows: ActionRowBuilder<ButtonBuilder>[];
}

/** Собирает список тикетов игрока (страница) с кнопками транскриптов и пагинацией. */
export function buildTicketsList(target: User, page: number) {
    const all = getTicketsByOwner(target.id);
    const totalPages = Math.max(1, Math.ceil(all.length / PER_PAGE));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const slice = all.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

    const container = new ContainerBuilder().setAccentColor(0x5865f2);
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## Тикеты игрока ${target}\n-# Всего: ${all.length}`
        )
    );
    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    if (slice.length === 0) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent("У этого игрока нет тикетов.")
        );
    } else {
        for (const t of slice) {
            const status = t.closedAt ? "закрыт" : "открыт";
            const rating = t.rating !== null ? ` · оценка ${t.rating}/5` : "";
            const idLabel = t.publicId || "—";
            // customId должен быть уникален; у старых записей нет publicId — fallback на channelId
            const key = t.publicId || t.channelId;
            const hasFile = !!t.publicId && transcriptExists(t.publicId);
            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        [
                            `**\`${idLabel}\`** · ${CATEGORY_LABEL[t.category] ?? t.category}`,
                            `-# ${time(new Date(t.createdAt), "f")} · ${status}${rating}`,
                        ].join("\n")
                    )
                )
                .setButtonAccessory(
                    new ButtonBuilder()
                        .setCustomId(`ticketfile:${key}`)
                        .setLabel("Транскрипт")
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(!hasFile)
                );
            container.addSectionComponents(section);
        }
    }

    const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`tickets:${target.id}:${safePage - 1}`)
            .setLabel("◀ Назад")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safePage <= 0),
        new ButtonBuilder()
            .setCustomId("tickets:noop")
            .setLabel(`${safePage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`tickets:${target.id}:${safePage + 1}`)
            .setLabel("Вперёд ▶")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safePage >= totalPages - 1)
    );

    return { container, nav };
}
