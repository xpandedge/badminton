import type { GroupRole, SkillLevel } from "@picklebaddies/domain";

export interface Group { name: string; description: string | null; createdBy: string; memberIds: string[]; }
export interface GroupMemberDoc { userId: string; role: GroupRole; }
export interface Venue { name: string; address: string | null; }
export interface Court { name: string; courtNumber: number; isActive: boolean; }
export type { GroupRole, SkillLevel };
