const cooldowns = new Map<string, number>();

export const APPEAL_COOLDOWN = 2 * 60 * 60 * 1000; // 2 часа

/** Сколько осталось до следующей апелляции (мс). */
export function getAppealCooldown(userId: string): number {
    const last = cooldowns.get(userId);
    if (!last) return 0;
    const remaining = last + APPEAL_COOLDOWN - Date.now();
    return remaining > 0 ? remaining : 0;
}

/** Отметить факт подачи апелляции. */
export function setAppealCooldown(userId: string): void {
    cooldowns.set(userId, Date.now());
}
