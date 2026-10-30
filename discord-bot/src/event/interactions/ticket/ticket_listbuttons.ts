import {
    AttachmentBuilder,
    ButtonInteraction,
    ContainerBuilder,
    MessageFlags,
    TextDisplayBuilder,
} from "discord.js";

import CustomClient from "../../../base/classes/CustomClient";
import { buildTicketsList } from "./ticketsList";
import { transcriptExists, transcriptPath } from "./ticketTranscript";

/** Кнопка «Транскрипт» у тикета в списке — отдаёт HTML-файл эфемерно. */
export async function ticketFileExecute(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("ticketfile:")) return;

    const client = interaction.client as CustomClient;
    const id = interaction.customId.split(":")[1] ?? "";

    if (!transcriptExists(id)) {
        return interaction.reply({
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${client.config.EMOJIS.CLOSE} Транскрипт этого тикета недоступен.`
                    )
                ),
            ],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });
    }

    return interaction.reply({
        content: `Транскрипт тикета \`${id}\`:`,
        files: [new AttachmentBuilder(transcriptPath(id), { name: `${id}.html` })],
        flags: MessageFlags.Ephemeral,
    });
}

/** Пагинация списка тикетов. */
export async function ticketsPageExecute(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("tickets:")) return;
    if (interaction.customId === "tickets:noop") return;

    const [, ownerId, pageStr] = interaction.customId.split(":");
    if (!ownerId || pageStr === undefined) return;

    const page = Number(pageStr);
    if (Number.isNaN(page)) return;

    const target = await interaction.client.users.fetch(ownerId).catch(() => null);
    if (!target) return;

    const { container, nav } = buildTicketsList(target, page);
    await interaction.update({
        components: [container, nav],
    });
}
