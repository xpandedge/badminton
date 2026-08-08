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

/** Engine algorithm version, surfaced in FairnessMetadata. Lives here to avoid a
 *  generate.ts ↔ fairness.ts circular import. */
export const ALGORITHM_VERSION = "v1";

/** Default deterministic seed when EngineInput.seed is omitted (PRD §14.1). */
export const DEFAULT_SEED = 0x5eed;

export interface EnginePlayer {
  playerId: string;
  displayName: string;
  skillLevel: SkillLevel;
  /** Round number (1-based) this player becomes available. Late joiners > 1. */
  availableFromRound: number;
}

export interface EngineCourt {
  courtId: string;
  name: string;
  courtNumber: number;
}

/** A locked (completed or in-progress) match — engine must preserve, never reschedule. */
export interface LockedMatch {
  roundNumber: number;
  courtId: string;
  teamA: [string, string]; // playerIds
  teamB: [string, string];
}

export type GenerationMode = "initial" | "rebalance";

export interface EngineInput {
  mode: GenerationMode;
  players: EnginePlayer[];
  courts: EngineCourt[];
  sessionDurationMinutes: number;
  estimatedGameMinutes: number;
  /** DELTA_SPEC D4: rounds already played (completed + in_progress). 0 for initial. */
  elapsedRounds: number;
  /** Matches the engine must treat as fixed (DELTA_SPEC D3 / PRD §14.9). */
  lockedMatches: LockedMatch[];
  /** Optional deterministic seed so output is reproducible (PRD §14.1). */
  seed?: number;
  priors?: Record<string, PlayerPriors>;
}

export type SitOutReason = "rotation" | "unavailable" | "overflow";

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

export interface FairnessMetadata {
  algorithmVersion: string;
  playersCount: number;
  courtsCount: number;
  roundsGenerated: number;
  /** DELTA_SPEC minor: 1 - normalised penalty, clamped 0..1. Informational only. */
  fairnessScore: number;
  /** fairnessPercent: fairnessScore * 100, rounded to nearest integer. Shown in host UI health meter. */
  fairnessPercent: number;
  minGamesPerPlayer: number;
  maxGamesPerPlayer: number;
  notes: string[];
}

export interface EngineOutput {
  matches: GeneratedMatch[];
  sitOuts: GeneratedSitOut[];
  metadata: FairnessMetadata;
}

export interface PlayerPriors {
  gamesPlayed: number;
  partnerCounts: Record<string, number>;
  opponentCounts: Record<string, number>;
}
