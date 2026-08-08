import type { EngineInput } from "./types.js";
import { PLAYERS_PER_MATCH } from "./types.js";

/**
 * DELTA_SPEC D4 — round count differs by mode.
 * initial:   floor(sessionDuration / gameDuration)
 * rebalance: floor(remaining / gameDuration) using elapsedRounds
 */
export function computeFutureRoundCount(input: EngineInput): number {
  const { sessionDurationMinutes, estimatedGameMinutes, elapsedRounds, mode } = input;
  if (estimatedGameMinutes <= 0) return 0;

  if (mode === "initial") {
    return Math.max(0, Math.floor(sessionDurationMinutes / estimatedGameMinutes));
  }

  const remaining = sessionDurationMinutes - elapsedRounds * estimatedGameMinutes;
  return Math.max(0, Math.floor(remaining / estimatedGameMinutes));
}

/** Max players that can play in one round given court count (PRD §14.4). */
export function maxPlayersPerRound(courtCount: number): number {
  return courtCount * PLAYERS_PER_MATCH;
}
