import type { GroupRole, SkillLevel } from "@picklebaddies/domain";

export interface Group {
  name: string;
  description: string | null;
  createdBy: string;
  memberIds: string[];
  groupInviteCode?: string;
  inviteCode?: string;
  archivedAt?: unknown;
  purgeAfter?: unknown;
  archivedBy?: string;
}
export type GroupDocument = Omit<Group, "createdBy" | "memberIds"> & {
  createdBy?: string;
  memberIds?: string[];
  rsvpDefaults?: {
    totalPlayers?: number;
    casualConfirmedSlots?: number;
    waitlistEnabled?: boolean;
    cutoffHoursBeforeStart?: number | null;
  };
};
export interface GroupMemberDoc { userId: string; role: GroupRole; }
export interface Venue { name: string; address: string | null; }
export interface Court { name: string; courtNumber: number; isActive: boolean; }
export type { GroupRole, SkillLevel };
