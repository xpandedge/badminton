// DELTA_SPEC D5 + D8 - group permissions and session participation stay separate.

import type { SessionStatus } from "./session-status.js";

/** Stored group role. `organiser` remains for legacy Firestore records. */
export type GroupRole = "owner" | "admin" | "member" | "organiser";
export type ActiveGroupRole = Exclude<GroupRole, "organiser">;
export type AppAdminRole = "owner" | "admin";

/** How a person participates in a session. This is not a permission role. */
export type ParticipantType = "registered_user" | "guest";

export interface GroupMember {
  userId: string;
  role: GroupRole;
}

export interface SuperAdminClaims {
  superAdmin?: unknown;
  appAdminRole?: unknown;
}

export function resolveGroupRole(
  members: GroupMember[],
  userId: string,
): GroupRole | null {
  return members.find((member) => member.userId === userId)?.role ?? null;
}

export function normalizeGroupRole(role: GroupRole | null): ActiveGroupRole | null {
  return role === "organiser" ? "admin" : role;
}

export function groupRoleLabel(role: GroupRole | null): "Owner" | "Admin" | "Member" | null {
  const normalized = normalizeGroupRole(role);
  if (!normalized) return null;
  return normalized === "owner" ? "Owner" : normalized === "admin" ? "Admin" : "Member";
}

export function isSuperAdminClaim(claims: SuperAdminClaims | null | undefined): boolean {
  return claims?.superAdmin === true;
}

export function getAppAdminRole(claims: SuperAdminClaims | null | undefined): AppAdminRole | null {
  if (!isSuperAdminClaim(claims)) return null;
  if (claims?.appAdminRole === "owner" || claims?.appAdminRole === "admin") {
    return claims.appAdminRole;
  }
  return null;
}

export function isOwnerRole(role: GroupRole | null): boolean {
  return role === "owner";
}

/** Owner, admin, or a legacy organiser record. */
export function isGroupAdminRole(role: GroupRole | null): boolean {
  return role === "owner" || role === "admin" || role === "organiser";
}

export function isGroupMemberRole(role: GroupRole | null): boolean {
  return role !== null;
}

// Ownership controls.
export const canManageAdmins = isOwnerRole;
export const canDeleteGroup = isOwnerRole;
export const canTransferOwnership = isOwnerRole;
export const canManageOrganisers = isOwnerRole;

/** A squad must keep one owner, so owners transfer ownership before leaving. */
export function canLeaveGroup(role: GroupRole | null): boolean {
  return role === "admin" || role === "organiser" || role === "member";
}

// Group administration. Legacy aliases remain for existing callers.
export const canManageGroup = isGroupAdminRole;
export const canManageSquad = isGroupAdminRole;
export const canManageMembers = isGroupAdminRole;

// Session operations.
export const canCreateSession = isGroupAdminRole;
export const canGenerateSchedule = isGroupAdminRole;
export const canRebalanceSession = isGroupAdminRole;
export const canManageSessionPlayers = isGroupAdminRole;
export const canAdvanceRound = isGroupAdminRole;
export const canDeleteSession = isGroupAdminRole;

// Score entry remains a member action.
export const canEnterScore = isGroupMemberRole;

/** Owners may correct completed scores after a session ends; other admins may
 * correct them only while the live session is active or paused. */
export function canCorrectCompletedScore(
  role: GroupRole | null,
  sessionStatus: SessionStatus,
): boolean {
  if (role === "owner") return sessionStatus !== "cancelled";
  return isGroupAdminRole(role) && (sessionStatus === "active" || sessionStatus === "paused");
}

// Legacy alias used by older Cloud Functions.
export const canRebalance = isGroupAdminRole;

export function canAddGroupMember(
  callerRole: GroupRole | null,
  newRole: "admin" | "member",
): boolean {
  if (callerRole === "owner") return true;
  return isGroupAdminRole(callerRole) && newRole === "member";
}

export function canRemoveGroupMember(
  callerRole: GroupRole | null,
  targetRole: GroupRole | null,
): boolean {
  if (!targetRole || targetRole === "owner") return false;
  if (callerRole === "owner") return true;
  return isGroupAdminRole(callerRole) && targetRole === "member";
}
