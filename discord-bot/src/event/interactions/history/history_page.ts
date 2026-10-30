import { ButtonInteraction } from "discord.js";

import { buildHistoryPayload } from "../../../commands/history/utils/historyPayload";

/**
 * Обработчик кнопок пагинации истории наказаний.
 * customId: `hist:<targetId>:<page>` (кнопка `hist:noop` игнорируется).
 */
export async function execute(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.customId.startsWith("hist:")) return;
    if (interaction.customId === "hist:noop") return;

    const [, targetId, pageStr] = interaction.customId.split(":");
    if (!targetId || pageStr === undefined) return;

    const page = Number(pageStr);
    if (Number.isNaN(page)) return;

    const target = await interaction.client.users.fetch(targetId).catch(() => null);
    if (!target) return;

    const payload = await buildHistoryPayload(target, page);

    await interaction.update({
        files: payload.files,
        components: payload.components,
    });
}
