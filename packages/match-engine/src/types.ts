// Pure domain types for the match engine.
// No Firebase, no I/O. Mirrors PRD §14 + DELTA_SPEC D2/D3/D4/D7.

export type SkillLevel = "unknown" | "beginner" | "intermediate" | "advanced";

/** PRD §14.7 + DELTA_SPEC minor: unknown treated as mid-skill for balancing only. */
export const SKILL_VALUE: Record<SkillLevel, number> = {
  unknown: 2,
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

export const PLAYERS_PER_MATCH = 4;

/** Default deterministic seed when no explicit seed is supplied (PRD §14.1). */
export const DEFAULT_SEED = 0x5eed;

export interface EnginePlayer {
  playerId: string;
  displayName: string;
  skillLevel: SkillLevel;
  /** Unused by buildRound/selectSitOuts (continuous scheduling has no round-gated
   *  late-joiners — a player is simply included the next time they're idle).
   *  Kept optional for backward-compat with existing test fixtures. */
  availableFromRound?: number;
}

export interface EngineCourt {
  courtId: string;
  name: string;
  courtNumber: number;
}

/** A locked (completed) match — engine must preserve, never reschedule; used to
 *  rebuild EngineState via seedStateFromLocked. */
export interface LockedMatch {
  roundNumber: number;
  courtId: string;
  teamA: [string, string]; // playerIds
  teamB: [string, string];
}

export type SitOutReason = "rotation" | "unavailable" | "overflow";

/** `roundNumber` is a monotonic cycle/label, not a synchronization barrier —
 *  continuous per-court scheduling assigns it per fill event, not per wave. */
export interface GeneratedMatch {
  roundNumber: number;
  courtId: string;
  matchNumber: number;
  teamA: [string, string];
  teamB: [string, string];
}

export interface GeneratedSitOut {
  roundNumber: number;
  playerId: string;
  reason: SitOutReason;
}
