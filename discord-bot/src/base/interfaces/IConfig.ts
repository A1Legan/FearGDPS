export default interface IConfig {
    TOKEN: string;
    CLIENT_ID: string;
    /** ID сервера для мгновенной регистрации slash-команд. Если не указан — команды регистрируются глобально (обновление до часа). */
    GUILD_ID?: string;
    EMOJIS: Record<string, string>;

    CHANNELS: {
        FEEDBACK: string;
    };
    /** канал апелляций/обжалования (указывается игроку в ЛС и в фидбеке) */
    APPEAL_CHANNEL: string;
    /** канал логов снятия наказаний (/unban, /unmute) */
    UNBAN_UNMUTE_LOG_CHANNEL: string;
    ADMIN_ROLES: string[];
    DISCORD_MODERATOR_ROLES: string[];
    MODERATOR_ROLES: string[];
    BANNED_ROLE: string;
    MUTED_ROLE: string;
    LOG_CHANNEL: string;
    TICKET_MODERATORS_ROLES: string[];
    FEEDBACK_BLOCKED_ROLE: string;
    TICKET_BLOCKED_ROLE: string;
    TICKET_ARCHIVE_CATEGORY: string;

    // Логи оценки уровней (rates)
    CHANNEL_RATE_PUBLIC: string; // канал, куда постятся карточки оценок
    RATES_PORT: number;          // порт локального HTTP-приёмника (127.0.0.1)
    RATES_SECRET: string;        // секрет для заголовка x-rate-secret

}