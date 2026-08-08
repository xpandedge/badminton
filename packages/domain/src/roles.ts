// DELTA_SPEC D5 + D8 — two independent role axes; simplified to owner|member permissions.

/**
 * Axis A: controls squad/session management permissions (PRD §11, §15.3).
 * Simplified per D8: "organiser" may exist in stored Firestore data but is treated
 * identically to "member" in all permission predicates.
 */
export type GroupRole = "owner" | "member" | "organiser"; // organiser kept for Firestore compat

/** Axis B: how a person participates in a session (PRD §11, §15.8). NOT a permission. */
export type ParticipantType = "registered_user" | "guest";

export const SUPER_ADMIN_EMAILS = [
  "pankaj4bharat@gmail.com",
  "sanju36@gmail.com",
] as const;

/** One membership record from groups/{groupId}/members. */
export interface GroupMember {
  userId: string;
  role: GroupRole;
}

/** Find a user's role within a group, or null if they are not a member. */
export function resolveGroupRole(
  members: GroupMember[],
  userId: string,
): GroupRole | null {
  const match = members.find((m) => m.userId === userId);
  return match ? match.role : null;
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase() as (typeof SUPER_ADMIN_EMAILS)[number]);
}

function isOwner(role: GroupRole | null): boolean {
  return role === "owner";
}

function isMember(role: GroupRole | null): boolean {
  // organiser is treated as member (D8 simplification)
  return role === "owner" || role === "member" || role === "organiser";
}

// ── Owner-only ────────────────────────────────────────────────────────────────
export const canManageSquad = isOwner;      // primary name per D8
export const canManageGroup = isOwner;      // alias kept for backward compat
export const canManageOrganisers = isOwner; // legacy; no longer relevant in simplified model
export const canDeleteSession = isOwner;
export const canManageTeamOwners = isSuperAdminEmail;

// ── Any squad member (owner OR member, including legacy organiser) ─────────────
// D8: simplification — any member can generate, score, rebalance, manage players.
export const canCreateSession = isMember;
export const canGenerateSchedule = isMember;
export const canRebalanceSession = isMember;
export const canManageSessionPlayers = isMember;
export const canAdvanceRound = isMember;
export const canEnterScore = isMember;

// Legacy alias used by existing Cloud Functions (functions/src/rebalanceSession.ts etc.)
// Keep until those functions are deleted per-sprint.
export const canRebalance = isMember;
