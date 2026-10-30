const cooldowns = new Map<string, number>();

export const COOLDOWN = 12 * 60 * 60 * 1000; // 12 часов

export function getRemainingCooldown(userId: string): number {
    const last = cooldowns.get(userId);
    if (!last) return 0;

    const remaining = last + COOLDOWN - Date.now();
    return remaining > 0 ? remaining : 0;
}

export function setFeedbackCooldown(userId: string): void {
    cooldowns.set(userId, Date.now());
}