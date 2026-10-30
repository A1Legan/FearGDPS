import { GuildMember } from "discord.js";

import CustomClient from "../base/classes/CustomClient";
import { getActiveBans, removeActiveBan } from "../commands/ban/utils/activebans";
import {
    getActiveMutes,
    removeActiveMute,
} from "../commands/mute/utils/activemutes";

const MAX_TIMEOUT = 28 * 24 * 60 * 60 * 1000; // лимит Discord на нативный тайм-аут

/**
 * Возвращает роль наказания игроку, который вышел и снова зашёл на сервер,
 * чтобы «сбросить» роли. Работает для банов (в т.ч. перманентных) и мутов.
 * Таймеры автоснятия временных наказаний продолжают тикать (восстановлены при старте),
 * поэтому здесь достаточно вернуть роль.
 */
export async function execute(member: GuildMember): Promise<void> {
    if (member.user.bot) return;

    const client = member.client as CustomClient;
    const now = Date.now();

    const ban = getActiveBans().find(
        (r) => r.userId === member.id && r.guildId === member.guild.id
    );
    if (ban) {
        if (ban.expiresAt === null || ban.expiresAt > now) {
            await member.roles.add(client.config.BANNED_ROLE).catch(() => {});
        } else {
            removeActiveBan(member.id, member.guild.id); // срок уже истёк
        }
    }

    const mute = getActiveMutes().find(
        (r) => r.userId === member.id && r.guildId === member.guild.id
    );
    if (mute) {
        if (mute.expiresAt > now) {
            await member.roles.add(client.config.MUTED_ROLE).catch(() => {});
            // возвращаем и нативный тайм-аут Discord на остаток срока
            await member
                .timeout(
                    Math.min(mute.expiresAt - now, MAX_TIMEOUT),
                    "Восстановление мута после перезахода"
                )
                .catch(() => null);
        } else {
            removeActiveMute(member.id, member.guild.id);
        }
    }
}
