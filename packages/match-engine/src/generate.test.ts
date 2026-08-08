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

describe("generateSchedule", () => {
  it("scenario 1: 12 players, 3 courts, 60min -> 4 rounds, 12 matches, zero sit-outs", () => {
    const input = mk(12, 3, 60);
    const out = generateSchedule(input);
    expect(out.matches.length).toBe(12);
    expect(out.sitOuts.length).toBe(0);

    const games = new Map<string, number>();
    for (const m of out.matches) {
      for (const id of [...m.teamA, ...m.teamB]) {
        games.set(id, (games.get(id) ?? 0) + 1);
      }
    }

    for (let i = 0; i < 12; i++) {
      expect(games.get(`p${i}`)).toBe(4);
    }
  });

  it("rebalance preserves locked round 1 and only adds future rounds", () => {
    const input = mk(8, 2, 60);
    const locked = [{ roundNumber: 1, courtId: "c0", teamA: ["p0","p1"] as [string,string], teamB: ["p2","p3"] as [string,string] }];
    const out = generateSchedule({ ...input, mode: "rebalance", elapsedRounds: 1, lockedMatches: locked });
    expect(out.matches.every((m) => m.roundNumber >= 2)).toBe(true);
    expect(out.matches.length).toBe(6); // 4 total rounds - 1 elapsed = 3 remaining rounds * 2 matches/round = 6 matches
  });
});
