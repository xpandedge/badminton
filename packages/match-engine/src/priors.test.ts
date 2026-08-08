// packages/match-engine/src/priors.test.ts
import { describe, it, expect } from "vitest";
import { seedStateFromPriors, normalizePriorGames } from "./priors";
import type { EnginePlayer, PlayerPriors } from "./types";

function player(id: string): EnginePlayer {
  return { playerId: id, displayName: id, skillLevel: "unknown", availableFromRound: 1 };
}

const p = ["a", "b", "c", "d"].map(player);

describe("normalizePriorGames", () => {
  it("subtracts roster min and caps at futureRounds", () => {
    const priors: Record<string, PlayerPriors> = {
      a: { gamesPlayed: 10, partnerCounts: {}, opponentCounts: {} },
      b: { gamesPlayed: 8, partnerCounts: {}, opponentCounts: {} },
      c: { gamesPlayed: 6, partnerCounts: {}, opponentCounts: {} },
      d: { gamesPlayed: 6, partnerCounts: {}, opponentCounts: {} },
    };
    const result = normalizePriorGames(priors, ["a", "b", "c", "d"], 3);
    // min = 6; a=4→capped3, b=2, c=0, d=0
    expect(result.get("a")).toBe(3);
    expect(result.get("b")).toBe(2);
    expect(result.get("c")).toBe(0);
    expect(result.get("d")).toBe(0);
  });

  it("players missing from priors default to 0 games (treated as min)", () => {
    const priors: Record<string, PlayerPriors> = {
      a: { gamesPlayed: 4, partnerCounts: {}, opponentCounts: {} },
    };
    const result = normalizePriorGames(priors, ["a", "b"], 5);
    // b missing → 0, a=4, min=0; a normalized to 4, capped at 5
    expect(result.get("a")).toBe(4);
    expect(result.get("b")).toBe(0);
  });

  it("all equal prior games → all zero", () => {
    const priors: Record<string, PlayerPriors> = {
      a: { gamesPlayed: 5, partnerCounts: {}, opponentCounts: {} },
      b: { gamesPlayed: 5, partnerCounts: {}, opponentCounts: {} },
    };
    const result = normalizePriorGames(priors, ["a", "b"], 3);
    expect(result.get("a")).toBe(0);
    expect(result.get("b")).toBe(0);
  });
});

describe("seedStateFromPriors", () => {
  it("seeds gamesPlayed from normalized priors", () => {
    const priors: Record<string, PlayerPriors> = {
      a: { gamesPlayed: 5, partnerCounts: {}, opponentCounts: {} },
      b: { gamesPlayed: 3, partnerCounts: {}, opponentCounts: {} },
      c: { gamesPlayed: 3, partnerCounts: {}, opponentCounts: {} },
      d: { gamesPlayed: 3, partnerCounts: {}, opponentCounts: {} },
    };
    const state = seedStateFromPriors(p, priors, 4);
    // min=3; a=2, b/c/d=0
    expect(state.gamesPlayed.get("a")).toBe(2);
    expect(state.gamesPlayed.get("b")).toBe(0);
  });

  it("seeds partnerCounts for players in session only", () => {
    const priors: Record<string, PlayerPriors> = {
      a: { gamesPlayed: 0, partnerCounts: { "a|b": 3, "a|z": 7 }, opponentCounts: {} },
      b: { gamesPlayed: 0, partnerCounts: { "a|b": 3 }, opponentCounts: {} },
      c: { gamesPlayed: 0, partnerCounts: {}, opponentCounts: {} },
      d: { gamesPlayed: 0, partnerCounts: {}, opponentCounts: {} },
    };
    const state = seedStateFromPriors(p, priors, 3);
    expect(state.partnerCount.get("a|b")).toBe(3);
    // "a|z" excluded because z not in session
    expect(state.partnerCount.has("a|z")).toBe(false);
  });

  it("seeds opponentCounts for players in session only", () => {
    const priors: Record<string, PlayerPriors> = {
      a: { gamesPlayed: 0, partnerCounts: {}, opponentCounts: { "a|c": 2 } },
      b: { gamesPlayed: 0, partnerCounts: {}, opponentCounts: {} },
      c: { gamesPlayed: 0, partnerCounts: {}, opponentCounts: {} },
      d: { gamesPlayed: 0, partnerCounts: {}, opponentCounts: {} },
    };
    const state = seedStateFromPriors(p, priors, 3);
    expect(state.opponentCount.get("a|c")).toBe(2);
  });

  it("players absent from priors start with zero counts", () => {
    const state = seedStateFromPriors(p, {}, 3);
    expect(state.gamesPlayed.get("a")).toBe(0);
    expect(state.partnerCount.size).toBe(0);
  });
});
