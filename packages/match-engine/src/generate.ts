import type { EngineInput, EngineOutput, GeneratedMatch, GeneratedSitOut } from "./types.js";
import { DEFAULT_SEED, PLAYERS_PER_MATCH } from "./types.js";
import { computeFutureRoundCount } from "./rounds.js";
import { createInitialState, seedStateFromLocked, type EngineState } from "./state.js";
import { seedStateFromPriors } from "./priors.js";
import { buildRound } from "./round.js";
import { computeFairness } from "./fairness.js";
import { seededOrder } from "./rng.js";

export { ALGORITHM_VERSION } from "./types.js";

export function generateSchedule(input: EngineInput): EngineOutput {
  const futureRounds = computeFutureRoundCount(input);

  const state: EngineState =
    input.mode === "rebalance"
      ? seedStateFromLocked(input.players, input.lockedMatches)
      : input.priors
        ? seedStateFromPriors(input.players, input.priors, futureRounds)
        : createInitialState(input.players);

  // Deterministic per-player tie-break order (PRD §14.1, DELTA_SPEC D3).
  const order = seededOrder(input.players.map((p) => p.playerId), input.seed ?? DEFAULT_SEED);

  // DELTA_SPEC D3/D7: never schedule into a round that already holds a locked
  // (completed/in-progress) match. Start strictly after the last locked round,
  // and skip any locked round defensively.
  const lockedRounds = new Set(input.lockedMatches.map((m) => m.roundNumber));
  const maxLockedRound = input.lockedMatches.reduce((mx, m) => Math.max(mx, m.roundNumber), 0);
  const firstFutureRound = Math.max(input.elapsedRounds + 1, maxLockedRound + 1);

  const matches: GeneratedMatch[] = [];
  const sitOuts: GeneratedSitOut[] = [];

  for (let r = 0; r < futureRounds; r++) {
    const roundNumber = firstFutureRound + r;
    if (lockedRounds.has(roundNumber)) continue; // never overwrite a locked round
    const available = input.players.filter((p) => p.availableFromRound <= roundNumber);
    if (available.length < PLAYERS_PER_MATCH) continue; // §23 fewer than 4 -> no matches this round
    const res = buildRound(state, available, input.courts, roundNumber, order);
    matches.push(...res.matches);
    sitOuts.push(...res.sitOuts);
  }

  return { matches, sitOuts, metadata: computeFairness(state, { matches, sitOuts }, input) };
}