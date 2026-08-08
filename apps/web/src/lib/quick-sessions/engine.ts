// apps/web/src/lib/quick-sessions/engine.ts
import type { EngineInput, PlayerPriors, GeneratedMatch } from "@picklebaddies/match-engine";
import type { QuickPlayer, QuickSessionSetup } from "./types";

export function buildEngineInput(
  setup: QuickSessionSetup,
  players: QuickPlayer[],
  priors?: Record<string, PlayerPriors>
): EngineInput {
  return {
    mode: "initial",
    players: players.map((p) => ({
      playerId: p.id,
      displayName: p.name,
      skillLevel: p.skillLevel,
      availableFromRound: 1,
    })),
    courts: Array.from({ length: setup.courts }, (_, i) => ({
      courtId: `court-${i + 1}`,
      name: `Court ${i + 1}`,
      courtNumber: i + 1,
    })),
    sessionDurationMinutes: setup.rounds * 15,
    estimatedGameMinutes: 15,
    elapsedRounds: 0,
    lockedMatches: [],
    priors,
  };
}

/** Build engine input for mid-session rebalance: regenerates only future rounds,
 *  respecting locked (done/live) matches as immutable history. */
export function buildEngineInputForRebalance(
  players: QuickPlayer[],
  courtsCount: number,
  lockedMatches: GeneratedMatch[],
  elapsedRounds: number,
  targetFutureRounds: number
): EngineInput {
  return {
    mode: "rebalance",
    players: players.map((p) => ({
      playerId: p.id,
      displayName: p.name,
      skillLevel: p.skillLevel,
      availableFromRound: 1,
    })),
    courts: Array.from({ length: courtsCount }, (_, i) => ({
      courtId: `court-${i + 1}`,
      name: `Court ${i + 1}`,
      courtNumber: i + 1,
    })),
    sessionDurationMinutes: (elapsedRounds + targetFutureRounds) * 15,
    estimatedGameMinutes: 15,
    elapsedRounds,
    lockedMatches,
  };
}
