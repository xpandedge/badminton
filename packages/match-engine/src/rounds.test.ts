import { describe, it, expect } from "vitest";
import { computeFutureRoundCount, maxPlayersPerRound } from "./rounds.js";
import type { EngineInput } from "./types.js";

const base: EngineInput = {
  mode: "initial",
  players: [],
  courts: [],
  sessionDurationMinutes: 60,
  estimatedGameMinutes: 15,
  elapsedRounds: 0,
  lockedMatches: [],
};

describe("computeFutureRoundCount", () => {
  it("initial: floor(duration / game) — 60/15 = 4 (PRD scenario 1)", () => {
    expect(computeFutureRoundCount(base)).toBe(4);
  });

  it("initial: 90/15 = 6 (PRD scenario 3)", () => {
    expect(computeFutureRoundCount({ ...base, sessionDurationMinutes: 90 })).toBe(6);
  });

  it("rebalance: uses remaining time after elapsed rounds (DELTA_SPEC D4)", () => {
    // 60min, 15min games, 1 round already played -> 45min left -> 3 future rounds
    expect(
      computeFutureRoundCount({ ...base, mode: "rebalance", elapsedRounds: 1 }),
    ).toBe(3);
  });

  it("rebalance: never negative when session over-run", () => {
    expect(
      computeFutureRoundCount({ ...base, mode: "rebalance", elapsedRounds: 10 }),
    ).toBe(0);
  });

  it("guards zero game duration", () => {
    expect(computeFutureRoundCount({ ...base, estimatedGameMinutes: 0 })).toBe(0);
  });
});

describe("maxPlayersPerRound", () => {
  it("3 courts -> 12 slots", () => {
    expect(maxPlayersPerRound(3)).toBe(12);
  });
});
