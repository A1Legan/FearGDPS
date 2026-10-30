import {
    Client,
    Events,
    Message,
    PartialMessage,
    Presence,
    VoiceState,
} from "discord.js";

import {
    addCommand,
    addDeleted,
    addMessage,
    addOnlineMs,
    addVoiceMs,
} from "./statsStore";

// Сессии, идущие прямо сейчас (в памяти). Сбрасываются при перезапуске бота.
const voiceSessions = new Map<string, number>(); // userId → время входа в войс
const onlineSessions = new Map<string, number>(); // userId → время появления в сети

function flushVoice(userId: string, now: number): void {
    const start = voiceSessions.get(userId);
    if (start !== undefined) {
        addVoiceMs(userId, now - start);
        voiceSessions.delete(userId);
    }
}

function flushOnline(userId: string, now: number): void {
    const start = onlineSessions.get(userId);
    if (start !== undefined) {
        addOnlineMs(userId, now - start);
        onlineSessions.delete(userId);
    }
}

/** Учёт использования команды (вызывать из обработчика interactionCreate). */
export function trackCommand(userId: string, command: string): void {
    addCommand(userId, command);
}

/**
 * Подключает все слушатели статистики к клиенту.
 * Вызвать один раз при инициализации.
 */
export function registerStatTrackers(client: Client): void {
    client.on(Events.MessageCreate, (message: Message) => {
        if (message.author.bot) return;
        if (!message.guild) return;
        addMessage(message.author.id, message.channelId);
    });

    client.on(Events.MessageDelete, (message: Message | PartialMessage) => {
        const authorId = message.author?.id;
        if (!authorId || message.author?.bot) return;
        addDeleted(authorId);
    });

    client.on(
        Events.VoiceStateUpdate,
        (oldState: VoiceState, newState: VoiceState) => {
            const userId = newState.id;
            const now = Date.now();
            const wasIn = oldState.channelId !== null;
            const isIn = newState.channelId !== null;

            if (!wasIn && isIn) {
                voiceSessions.set(userId, now);
            } else if (wasIn && !isIn) {
                flushVoice(userId, now);
            }
            // переключение между каналами — сессия продолжается, ничего не делаем
        }
    );

    // --- присутствие в сети ---
    client.on(
        Events.PresenceUpdate,
        (_old: Presence | null, presence: Presence) => {
            const userId = presence.userId;
            const now = Date.now();
            const online = presence.status !== "offline";

            if (online && !onlineSessions.has(userId)) {
                onlineSessions.set(userId, now);
            } else if (!online) {
                flushOnline(userId, now);
            }
        }
    );
}

/**
 * Инициализирует сессии для уже онлайн-участников и тех, кто уже в войсе.
 * Вызвать один раз в обработчике clientReady.
 */
export function initStatSessions(client: Client): void {
    const now = Date.now();
    for (const guild of client.guilds.cache.values()) {
        for (const presence of guild.presences.cache.values()) {
            if (presence.status !== "offline" && !onlineSessions.has(presence.userId)) {
                onlineSessions.set(presence.userId, now);
            }
        }
        for (const [, voiceState] of guild.voiceStates.cache) {
            if (voiceState.channelId && voiceState.id) {
                voiceSessions.set(voiceState.id, now);
            }
        }
    }
}
