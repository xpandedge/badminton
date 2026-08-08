// packages/match-engine/src/priors.ts
import type { EnginePlayer, PlayerPriors } from "./types.js";
import { createInitialState, pairKey, type EngineState } from "./state.js";

export function normalizePriorGames(
  priors: Record<string, PlayerPriors>,
  playerIds: string[],
  futureRounds: number
): Map<string, number> {
  const raw = playerIds.map((id) => priors[id]?.gamesPlayed ?? 0);
  const min = Math.min(...raw);
  return new Map(
    playerIds.map((id, i) => [id, Math.min((raw[i]! - min), futureRounds)])
  );
}

export function seedStateFromPriors(
  players: EnginePlayer[],
  priors: Record<string, PlayerPriors>,
  futureRounds: number
): EngineState {
  const state = createInitialState(players);
  const playerIds = players.map((p) => p.playerId);
  const playerSet = new Set(playerIds);
  const normalizedGames = normalizePriorGames(priors, playerIds, futureRounds);

  for (const p of players) {
    state.gamesPlayed.set(p.playerId, normalizedGames.get(p.playerId) ?? 0);

    const prior = priors[p.playerId];
    if (!prior) continue;

    for (const [key, count] of Object.entries(prior.partnerCounts)) {
      const [a, b] = key.split("|");
      if (a && b && playerSet.has(a) && playerSet.has(b)) {
        state.partnerCount.set(pairKey(a, b), count);
      }
    }

    for (const [key, count] of Object.entries(prior.opponentCounts)) {
      const [a, b] = key.split("|");
      if (a && b && playerSet.has(a) && playerSet.has(b)) {
        state.opponentCount.set(pairKey(a, b), count);
      }
    }
  }

  return state;
}
