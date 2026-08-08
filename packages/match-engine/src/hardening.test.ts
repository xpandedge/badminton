import { describe, it, expect } from "vitest";
import { generateSchedule } from "./generate.js";
import { seededOrder } from "./rng.js";
import type { EngineInput, EnginePlayer, EngineCourt } from "./types.js";

function mk(n: number, courts: number, durMin: number, gameMin = 15): EngineInput {
  const players: EnginePlayer[] = Array.from({ length: n }, (_, i) => ({
    playerId: `p${i}`, displayName: `p${i}`, skillLevel: "unknown", availableFromRound: 1,
  }));
  const cs: EngineCourt[] = Array.from({ length: courts }, (_, i) => ({ courtId: `c${i}`, name: `Court ${i + 1}`, courtNumber: i + 1 }));
  return { mode: "initial", players, courts: cs, sessionDurationMinutes: durMin, estimatedGameMinutes: gameMin, elapsedRounds: 0, lockedMatches: [] };
}

const gamesFor = (out: ReturnType<typeof generateSchedule>, id: string) =>
  out.matches.filter((m) => [...m.teamA, ...m.teamB].includes(id)).length;

describe("seed (PRD §14.1)", () => {
  it("same seed → identical output", () => {
    const a = generateSchedule({ ...mk(14, 3, 60), seed: 42 });
    const b = generateSchedule({ ...mk(14, 3, 60), seed: 42 });
    expect(a).toEqual(b);
  });

  it("different seeds → different assignment but equal fairness", () => {
    const a = generateSchedule({ ...mk(14, 3, 60), seed: 1 });
    const b = generateSchedule({ ...mk(14, 3, 60), seed: 2 });
    // Some match differs (seed actually affects output, not dead code)
    expect(JSON.stringify(a.matches)).not.toEqual(JSON.stringify(b.matches));
    // Both remain fair: games spread ≤ 1
    const ids = Array.from({ length: 14 }, (_, i) => `p${i}`);
    for (const out of [a, b]) {
      const g = ids.map((id) => gamesFor(out, id));
      expect(Math.max(...g) - Math.min(...g)).toBeLessThanOrEqual(1);
    }
  });

  it("seededOrder is a permutation of the ids", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const order = seededOrder(ids, 7);
    expect([...order.keys()].sort()).toEqual([...ids].sort());
    expect(new Set(order.values()).size).toBe(ids.length);
  });
});

describe("locked-round preservation (DELTA_SPEC D3)", () => {
  it("never schedules into a round that holds a locked match", () => {
    const input = mk(8, 2, 60);
    // Anomalous: a locked match sits in round 3 even though only 1 round elapsed.
    const locked = [{ roundNumber: 3, courtId: "c0", teamA: ["p0", "p1"] as [string, string], teamB: ["p2", "p3"] as [string, string] }];
    const out = generateSchedule({ ...input, mode: "rebalance", elapsedRounds: 1, lockedMatches: locked });
    // No generated match may land on round 3 (the locked round)
    expect(out.matches.some((m) => m.roundNumber === 3)).toBe(false);
    // And generation starts strictly after the last locked round
    expect(out.matches.every((m) => m.roundNumber >= 4)).toBe(true);
  });
});

describe("sit-out reasons (DELTA_SPEC D2 / §23)", () => {
  it("labels capacity-bound sit-outs as overflow", () => {
    // 12 players, 2 courts (8 slots) → 4 sit out each round due to overflow
    const out = generateSchedule(mk(12, 2, 60));
    expect(out.sitOuts.length).toBeGreaterThan(0);
    expect(out.sitOuts.every((s) => s.reason === "overflow")).toBe(true);
  });

  it("labels remainder sit-outs as rotation", () => {
    // 9 players, 3 courts (12 slots) → 1 sits as rotation remainder (not overflow)
    const out = generateSchedule(mk(9, 3, 60));
    expect(out.sitOuts.length).toBeGreaterThan(0);
    expect(out.sitOuts.every((s) => s.reason === "rotation")).toBe(true);
  });
});

describe("edge cases", () => {
  it("0 players → no matches, neutral metadata, no crash", () => {
    const out = generateSchedule(mk(0, 2, 60));
    expect(out.matches).toEqual([]);
    expect(out.metadata.fairnessScore).toBe(1);
    expect(out.metadata.minGamesPerPlayer).toBe(0);
    expect(out.metadata.maxGamesPerPlayer).toBe(0);
    expect(Number.isNaN(out.metadata.fairnessScore)).toBe(false);
  });

  it("fewer than 4 players → no matches", () => {
    const out = generateSchedule(mk(3, 1, 60));
    expect(out.matches).toEqual([]);
  });

  it("all players late-joining from round 2 → round 1 empty, later rounds fill", () => {
    const input = mk(8, 2, 60);
    for (const p of input.players) p.availableFromRound = 2;
    const out = generateSchedule(input);
    expect(out.matches.some((m) => m.roundNumber === 1)).toBe(false);
    expect(out.matches.some((m) => m.roundNumber >= 2)).toBe(true);
  });
});
