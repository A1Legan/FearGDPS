import { ButtonInteraction } from "discord.js";

import CustomClient from "../../../base/classes/CustomClient";
import { buildMuteListPayload } from "../../../commands/mutelist/utils/mutelistPayload";

/**
 * Обработчик кнопок пагинации списка мутов.
 * customId: `mutelist:<page>` (кнопка `mutelist:noop` игнорируется).
 */
export async function execute(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.customId.startsWith("mutelist:")) return;
    if (interaction.customId === "mutelist:noop") return;

    const [, pageStr] = interaction.customId.split(":");
    if (pageStr === undefined) return;

    const page = Number(pageStr);
    if (Number.isNaN(page)) return;
    if (!interaction.guild) return;

    const client = interaction.client as CustomClient;
    const payload = await buildMuteListPayload(
        interaction.guild,
        client.config.MUTED_ROLE,
        page
    );

    await interaction.update({
        files: payload.files,
        components: payload.components,
    });
}
