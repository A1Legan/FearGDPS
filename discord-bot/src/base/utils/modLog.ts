import {
    ContainerBuilder,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    ThumbnailBuilder,
    User,
    time,
} from "discord.js";

import CustomClient from "../classes/CustomClient";

export interface ModLogData {
    /** цвет акцента контейнера */
    color: number;
    /** эмодзи для заголовка */
    emoji: string;
    /** заголовок, напр. "Бан выдан" */
    title: string;
    /** кого наказали */
    target: User;
    /** кто выдал наказание */
    moderator: User;
    /** дополнительные поля лога */
    fields: { name: string; value: string }[];
    /** миниатюра (например, иконка сервера) */
    thumbnail?: string | null;
    /** ID канала для лога; по умолчанию — config.LOG_CHANNEL */
    channelId?: string;
    /** подпись строки со временем; по умолчанию "Когда выдан" */
    timeLabel?: string;
}

/**
 * Отправляет лог модерационного действия в канал (по умолчанию LOG_CHANNEL, может быть на другом сервере).
 * Некритично: при отсутствии канала/прав тихо игнорируется.
 */
export async function sendModLog(
    client: CustomClient,
    data: ModLogData
): Promise<void> {
    const channelId = data.channelId ?? client.config.LOG_CHANNEL;
    if (!channelId) return;

    const container = new ContainerBuilder().setAccentColor(data.color);

    const section = new SectionBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            [
                `## ${data.emoji} ${data.title}`,
                `> **Игрок:** ${data.target} \`${data.target.tag}\``,
                `> **Модератор:** ${data.moderator} \`${data.moderator.tag}\``,
            ].join("\n")
        )
    );
    // В логе миниатюрой всегда используем аватарку модератора
    section.setThumbnailAccessory(
        new ThumbnailBuilder().setURL(
            data.moderator.displayAvatarURL({ extension: "png", size: 256 })
        )
    );
    container.addSectionComponents(section);

    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const lines = data.fields.map((f) => `**${f.name}:** ${f.value}`);
    lines.push(`**${data.timeLabel ?? "Когда выдан"}:** ${time(new Date(), "F")}`);

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(lines.join("\n"))
    );

    try {
        const channel = await client.channels.fetch(channelId);
        if (channel && channel.isSendable()) {
            await channel.send({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });
        }
    } catch {
        /* лог не критичен — игнорируем ошибки доступа */
    }
}
