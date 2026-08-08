// Public API of the pure match engine (DELTA_SPEC D3).
//
// Continuous per-court scheduling: the web app calls `buildRound` directly —
// once with all active courts to seed a session, then repeatedly with just the
// court(s) that freed up — rather than a whole-session batch generator. See
// buildRound's doc comment for why this is safe to call repeatedly.

export * from "./types.js";
export { mulberry32, seededOrder } from "./rng.js";
export { buildRound, type RoundResult } from "./round.js";
export { selectSitOuts, type SitOutResult } from "./sitouts.js";
export {
  pairKey,
  recordMatch,
  recordSitOut,
  createInitialState,
  seedStateFromLocked,
  type EngineState,
} from "./state.js";
