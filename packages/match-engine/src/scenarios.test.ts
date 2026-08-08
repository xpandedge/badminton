import { describe, it, expect } from "vitest";
import { generateSchedule } from "./generate.js";
import type { EngineInput, EnginePlayer, EngineCourt } from "./types.js";

function mk(n: number, courts: number, durMin: number, gameMin = 15): EngineInput {
  const players: EnginePlayer[] = Array.from({ length: n }, (_, i) => ({
    playerId: `p${i}`, displayName: `p${i}`, skillLevel: "unknown", availableFromRound: 1,
  }));
  const cs: EngineCourt[] = Array.from({ length: courts }, (_, i) => ({ courtId: `c${i}`, name: `Court ${i+1}`, courtNumber: i + 1 }));
  return { mode: "initial", players, courts: cs, sessionDurationMinutes: durMin, estimatedGameMinutes: gameMin, elapsedRounds: 0, lockedMatches: [] };
}
function games(out: ReturnType<typeof generateSchedule>, id: string): number {
  return out.matches.filter((m) => [...m.teamA, ...m.teamB].includes(id)).length;
}
function spread(out: ReturnType<typeof generateSchedule>, ids: string[]): number {
  const g = ids.map((id) => games(out, id)); return Math.max(...g) - Math.min(...g);
}

describe("PRD scenarios", () => {
  it.each([
    ["4 players, 1 court", 4, 1, 60],
    ["8 players, 2 courts", 8, 2, 60],
    ["10 players, 2 courts", 10, 2, 60],
    ["12 players, 3 courts", 12, 3, 60],
    ["14 players, 3 courts", 14, 3, 60],
    ["18 players, 3 courts", 18, 3, 90],
  ])("%s: fair games + sit-out spread", (_label, n, courts, dur) => {
    const out = generateSchedule(mk(n, courts, dur));
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    expect(spread(out, ids)).toBeLessThanOrEqual(1);
    for (const m of out.matches) expect([...m.teamA, ...m.teamB].length).toBe(4);
  });

  it("scenario 1: 12/3/60 -> 4 rounds, 12 matches, everyone plays 4, no sit-outs", () => {
    const out = generateSchedule(mk(12, 3, 60));
    expect(out.matches.length).toBe(12);
    expect(out.sitOuts.length).toBe(0);
    for (let i = 0; i < 12; i++) expect(games(out, `p${i}`)).toBe(4);
  });

  it("is deterministic for identical input", () => {
    expect(generateSchedule(mk(14, 3, 60))).toEqual(generateSchedule(mk(14, 3, 60)));
  });

  it("rebalance preserves locked round 1 and only adds future rounds", () => {
    const input = mk(8, 2, 60);
    const locked = [{ roundNumber: 1, courtId: "c0", teamA: ["p0","p1"] as [string,string], teamB: ["p2","p3"] as [string,string] }];
    const out = generateSchedule({ ...input, mode: "rebalance", elapsedRounds: 1, lockedMatches: locked });
    expect(out.matches.every((m) => m.roundNumber >= 2)).toBe(true);
  });
});