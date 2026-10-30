import { ButtonInteraction } from "discord.js";

import CustomClient from "../../../base/classes/CustomClient";
import { buildBanListPayload } from "../../../commands/banlist/utils/banlistPayload";

/**
 * Обработчик кнопок пагинации списка банов.
 * customId: `banlist:<page>` (кнопка `banlist:noop` игнорируется).
 */
export async function execute(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.customId.startsWith("banlist:")) return;
    if (interaction.customId === "banlist:noop") return;

    const [, pageStr] = interaction.customId.split(":");
    if (pageStr === undefined) return;

    const page = Number(pageStr);
    if (Number.isNaN(page)) return;
    if (!interaction.guild) return;

    const client = interaction.client as CustomClient;
    const payload = await buildBanListPayload(
        interaction.guild,
        client.config.BANNED_ROLE,
        page
    );

    await interaction.update({
        files: payload.files,
        components: payload.components,
    });
}
