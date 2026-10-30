import { Client, GatewayIntentBits, Collection, REST, Routes, MessageFlags } from "discord.js";

import ICustomClient from "../interfaces/ICustomClient";
import IConfig from "../interfaces/IConfig";

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { execute as menuExecute } from "../../prefix_commands/menu/index";
import { execute as feedbackModalExecute } from "../../commands/feedback/modal";
import { execute as feedbackRulesExecute } from "../../event/interactions/feedback/feedback_rules";
import { execute as feedbackWriteExecute } from "../../event/interactions/feedback/feedback_write";
import { execute as ticketCreateExecute } from "../../event/interactions/ticket/ticket_create";
import { execute as ticketRulesExecute } from "../../event/interactions/ticket/ticket_rules";
import { execute as ticketCloseExecute } from "../../event/interactions/ticket/ticket_close";
import { execute as ticketCategoryExecute } from "../../event/interactions/ticket/ticket_category";
import { execute as ticketClaimExecute } from "../../event/interactions/ticket/ticket_claim";
import { execute as ticketRateExecute } from "../../event/interactions/ticket/ticket_rate";
import { registerTicketTracker } from "../../event/interactions/ticket/ticket_tracker";
import { startRatesServer } from "../../event/rates/index";
import {
    ticketFileExecute,
    ticketsPageExecute,
} from "../../event/interactions/ticket/ticket_listbuttons";
import { restoreTicketAutoClose } from "../../event/interactions/ticket/ticket_archive";
import { execute as historyPageExecute } from "../../event/interactions/history/history_page";
import { execute as banlistPageExecute } from "../../event/interactions/ban/banlist_page";
import { execute as mutelistPageExecute } from "../../event/interactions/mute/mutelist_page";
import { execute as guildMemberAddExecute } from "../../event/guildMemberAdd";
import { restoreActiveBans } from "../../commands/ban/utils/activebans";
import { restoreActiveMutes } from "../../commands/mute/utils/activemutes";
import {
    registerStatTrackers,
    initStatSessions,
    trackCommand,
} from "../../commands/modstatistic/utils/trackers";

export default class CustomClient extends Client implements ICustomClient {

    config: IConfig;

    commands = new Collection<string, any>();
    prefixCommands = new Collection<string, any>();

    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildPresences
            ]
        });

        this.config = require("../../../data/config.json");
    }

    public getEmoji(name: keyof IConfig["EMOJIS"]) {
        const emoji = this.config.EMOJIS[name]!;

        const match = emoji.match(/^<a?:(.+):(\d+)>$/)!;

        return {
            name: match[1]!,
            id: match[2]!
        };
    }

    // Рекурсивно собирает все .js-файлы, включая вложенные папки (например commands/ban/ban.js).
    private collectJsFiles(dir: string): string[] {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files: string[] = [];
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...this.collectJsFiles(full));
            } else if (entry.name.endsWith(".js")) {
                files.push(full);
            }
        }
        return files;
    }

    private async LoadCommands(): Promise<void> {
        const slashPath = path.join(__dirname, "../../commands");
        for (const file of this.collectJsFiles(slashPath)) {
            const command = (await import(pathToFileURL(file).href)).default;
            // Пропускаем вспомогательные модули (utils и т.п.) — у них нет .data
            if (!command?.data?.name) continue;
            this.commands.set(command.data.name, command);
        }

        const prefixPath = path.join(__dirname, "../../prefix_commands");
        for (const file of this.collectJsFiles(prefixPath)) {
            const command = (await import(pathToFileURL(file).href)).default;
            if (!command?.name) continue;
            this.prefixCommands.set(command.name, command);
        }
    }

    private async RegisterCommands(): Promise<void> {
        const rest = new REST({ version: "10" }).setToken(this.config.TOKEN);
        // rest.put полностью заменяет набор команд: новые добавляются,
        // а удалённые из кода — автоматически пропадают у Discord.
        const body = this.commands.map(c => c.data.toJSON());
        const guildId = this.config.GUILD_ID?.trim();

        if (guildId) {
            // Регистрация на конкретном сервере — изменения видны мгновенно.
            await rest.put(
                Routes.applicationGuildCommands(this.config.CLIENT_ID, guildId),
                { body }
            );
            console.log(
                `| Slash-команды зарегистрированы на сервере ${guildId} (${body.length} шт.).`
            );
        } else {
            // Глобальная регистрация — обновление у Discord может занять до часа.
            await rest.put(
                Routes.applicationCommands(this.config.CLIENT_ID),
                { body }
            );
            console.log(
                `| Slash-команды зарегистрированы глобально (${body.length} шт.). ` +
                `Обновление может занять до часа. Укажите GUILD_ID в config.json для мгновенной регистрации.`
            );
        }
    }

    async Init(): Promise<void> {
        await this.LoadCommands();

        // Восстанавливаем таймеры автоснятия ролей наказания после перезапуска бота.
        this.once("clientReady", () => {
            restoreActiveBans(this);
            restoreActiveMutes(this);
            initStatSessions(this);
            restoreTicketAutoClose(this);
        });

        // Слушатели статистики (сообщения, войс, онлайн, удалённые)
        registerStatTrackers(this);
        // Учёт ответов модерации в тикетах
        registerTicketTracker(this);

        // Возврат ролей наказания вернувшимся на сервер игрокам
        this.on("guildMemberAdd", (member) => {
            void guildMemberAddExecute(member);
        });

        this.on("interactionCreate", async interaction => {
          try {

            if (interaction.isButton()) {
                if (interaction.customId.startsWith("hist:")) {
                    await historyPageExecute(interaction);
                    return;
                }
                if (interaction.customId.startsWith("banlist:")) {
                    await banlistPageExecute(interaction);
                    return;
                }
                if (interaction.customId.startsWith("mutelist:")) {
                    await mutelistPageExecute(interaction);
                    return;
                }
                if (interaction.customId.startsWith("ticketfile:")) {
                    await ticketFileExecute(interaction);
                    return;
                }
                if (interaction.customId.startsWith("tickets:")) {
                    await ticketsPageExecute(interaction);
                    return;
                }
                await feedbackRulesExecute(interaction);
                await feedbackWriteExecute(interaction);
                await ticketCreateExecute(interaction);
                await ticketRulesExecute(interaction);
                await ticketClaimExecute(interaction);
                await ticketCloseExecute(interaction);
                await ticketRateExecute(interaction);
                return;
            }

            if (interaction.isStringSelectMenu()) {

                if (interaction.customId === "menu_select") {
                    await menuExecute(interaction);
                }

                if (interaction.customId === "ticket_category") {
                    await ticketCategoryExecute(interaction);
                }

                return;
            }

            if (interaction.isModalSubmit()) {
                if (interaction.customId === "feedback_modal") {
                    await feedbackModalExecute(interaction);
                }
                return;
            }

            if (!interaction.isChatInputCommand()) return;
            const command = this.commands.get(interaction.commandName);
            if (!command) return;
            trackCommand(interaction.user.id, interaction.commandName);
            try {
                await command.execute(interaction);
            } catch (err) {
                console.error(`Ошибка в команде /${interaction.commandName}:`, err);
                // Чтобы взаимодействие не «висело»: сообщаем об ошибке.
                const msg = "Произошла ошибка при выполнении команды.";
                try {
                    if (interaction.deferred || interaction.replied) {
                        await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
                    } else {
                        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
                    }
                } catch {
                    /* interaction мог истечь — игнорируем */
                }
            }
          } catch (err) {
            // Страховка для кнопок/меню/модалок: не даём хендлеру уронить всё молча.
            console.error("Необработанная ошибка в interactionCreate:", err);
            try {
                if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
                    await interaction.reply({
                        content: "Произошла ошибка.",
                        flags: MessageFlags.Ephemeral,
                    });
                }
            } catch {
                /* interaction мог истечь — игнорируем */
            }
          }
        });

        this.on("messageCreate", async message => {
            if (message.author.bot) return;
            if (!message.content.startsWith("!")) return;
            const args = message.content.slice(1).trim().split(/\s+/);
            const name = args.shift()?.toLowerCase();
            if (!name) return;
            const command = this.prefixCommands.get(name);
            if (!command) return;
            await command.execute(message, args);

        });
        await this.RegisterCommands();
        await this.login(this.config.TOKEN);
        console.log("| Бот успешно запущен.");

        startRatesServer(this);
    }
}