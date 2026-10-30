import { StringSelectMenuInteraction } from "discord.js";
import * as Roles from "./roles";
import * as Links from "./links";
import * as Staff from "./staff";
import * as Rules from "./rules";

export async function execute(interaction: StringSelectMenuInteraction) {

    switch (interaction.values[0]) {

        case "roles":
            await Roles.execute(interaction);
            break;
        case "links":
            await Links.execute(interaction);
            break;
        case "staff":
            await Staff.execute(interaction);
            break;
        case "rules":
            await Rules.execute(interaction);
            break;
    }
}