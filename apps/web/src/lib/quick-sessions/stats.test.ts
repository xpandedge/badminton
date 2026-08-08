// apps/web/src/lib/quick-sessions/stats.test.ts
import { describe, it, expect } from "vitest";
import { computeSessionDelta } from "./stats";
import type { GeneratedMatch, GeneratedSitOut } from "@picklebaddies/match-engine";

function match(r: number, c: string, tA: [string, string], tB: [string, string]): GeneratedMatch {
  return { roundNumber: r, courtId: c, matchNumber: 1, teamA: tA, teamB: tB };
}

function sitOut(r: number, playerId: string): GeneratedSitOut {
  return { roundNumber: r, playerId, reason: "rotation" };
}

describe("computeSessionDelta", () => {
  it("counts games per player", () => {
    const matches = [match(1, "c1", ["a", "b"], ["c", "d"])];
    const delta = computeSessionDelta(matches, []);
    expect(delta.gamesPerPlayer.get("a")).toBe(1);
    expect(delta.gamesPerPlayer.get("b")).toBe(1);
    expect(delta.gamesPerPlayer.get("c")).toBe(1);
    expect(delta.gamesPerPlayer.get("d")).toBe(1);
  });

  it("counts sit-outs per player", () => {
    const delta = computeSessionDelta([], [sitOut(1, "x"), sitOut(2, "x"), sitOut(1, "y")]);
    expect(delta.sitOutsPerPlayer.get("x")).toBe(2);
    expect(delta.sitOutsPerPlayer.get("y")).toBe(1);
  });

  it("counts partner pairs symmetrically (one entry per pair)", () => {
    const matches = [match(1, "c1", ["a", "b"], ["c", "d"])];
    const delta = computeSessionDelta(matches, []);
    const abKey = "a|b";
    const cdKey = "c|d";
    expect(delta.partnerCounts.get(abKey)).toBe(1);
    expect(delta.partnerCounts.get(cdKey)).toBe(1);
  });

  it("counts opponent pairs", () => {
    const matches = [match(1, "c1", ["a", "b"], ["c", "d"])];
    const delta = computeSessionDelta(matches, []);
    expect(delta.opponentCounts.get("a|c")).toBe(1);
    expect(delta.opponentCounts.get("a|d")).toBe(1);
    expect(delta.opponentCounts.get("b|c")).toBe(1);
    expect(delta.opponentCounts.get("b|d")).toBe(1);
  });

  it("accumulates across multiple matches", () => {
    const matches = [
      match(1, "c1", ["a", "b"], ["c", "d"]),
      match(2, "c1", ["a", "b"], ["c", "d"]),
    ];
    const delta = computeSessionDelta(matches, []);
    expect(delta.gamesPerPlayer.get("a")).toBe(2);
    expect(delta.partnerCounts.get("a|b")).toBe(2);
    expect(delta.opponentCounts.get("a|c")).toBe(2);
  });

  it("empty session produces empty delta", () => {
    const delta = computeSessionDelta([], []);
    expect(delta.gamesPerPlayer.size).toBe(0);
    expect(delta.sitOutsPerPlayer.size).toBe(0);
    expect(delta.partnerCounts.size).toBe(0);
    expect(delta.opponentCounts.size).toBe(0);
  });
});
