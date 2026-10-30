import {
    Client,
    SectionBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder,
    User,
} from "discord.js";

/**
 * Секция-заголовок с миниатюрой-аватаркой пользователя.
 * Если аватарки нет — вернёт секцию без миниатюры недопустимо (нужен accessory),
 * поэтому при отсутствии URL используем дефолтную аватарку пользователя.
 */
export function titleSection(content: string, avatarUrl: string): SectionBuilder {
    return new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
}

/** Аватарка владельца тикета по его id (с дефолтом Discord). */
export async function ownerAvatar(
    client: Client,
    ownerId: string | null | undefined
): Promise<string> {
    if (ownerId) {
        const user: User | null = await client.users
            .fetch(ownerId)
            .catch(() => null);
        if (user) return user.displayAvatarURL({ extension: "png", size: 256 });
    }
    // запасная дефолтная аватарка Discord
    return "https://cdn.discordapp.com/embed/avatars/0.png";
}
