// Public API of the pure match engine (DELTA_SPEC D3).
// M0: stable signatures + round math. Full deterministic generator lands in M4 (TDD).

export * from "./types.js";
export { computeFutureRoundCount, maxPlayersPerRound } from "./rounds.js";
export { mulberry32, seededOrder } from "./rng.js";
export { generateSchedule, ALGORITHM_VERSION } from "./generate.js";
export { pairKey, recordSitOut } from "./state.js";
export { seedStateFromPriors, normalizePriorGames } from "./priors.js";
