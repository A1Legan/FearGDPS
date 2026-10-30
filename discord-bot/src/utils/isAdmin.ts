import { GuildMember } from "discord.js";
import CustomClient from "../base/classes/CustomClient";

export function isAdmin(member: GuildMember, client: CustomClient): boolean {
    const adminRoles: string[] = client.config.ADMIN_ROLES ?? [];
    return member.roles.cache.some((role) => adminRoles.includes(role.id));
}