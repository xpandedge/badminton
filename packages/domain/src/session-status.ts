export type SessionStatus = "draft" | "scheduled" | "active" | "paused" | "completed" | "cancelled";
export type MatchStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type SessionPlayerStatus =
  | "invited" | "registered" | "checked_in" | "active" | "waiting" | "left" | "removed" | "no_show";

/** DELTA_SPEC D7: present + available. Per-round play/sit is derived, not stored. */
export const SCHEDULABLE_STATUSES: ReadonlySet<SessionPlayerStatus> = new Set(["checked_in", "active"]);
export function isSchedulable(status: SessionPlayerStatus): boolean {
  return SCHEDULABLE_STATUSES.has(status);
}
