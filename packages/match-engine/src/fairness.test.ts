import { describe, it, expect } from "vitest";
import { computeFairness } from "./fairness.js";
import { createInitialState } from "./state.js";
import { generateSchedule } from "./generate.js";
import type { EngineInput } from "./types.js";
import { ALGORITHM_VERSION } from "./generate.js";

function mkInput(n: number, courts: number, durMin: number, gameMin = 15): EngineInput {
  return {
    mode: "initial",
    players: Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, displayName: `p${i}`, skillLevel: "unknown", availableFromRound: 1 })),
    courts: Array.from({ length: courts }, (_, i) => ({ courtId: `c${i}`, name: `Court ${i + 1}`, courtNumber: i + 1 })),
    sessionDurationMinutes: durMin,
    estimatedGameMinutes: gameMin,
    elapsedRounds: 0,
    lockedMatches: [],
  };
}

const mockInput: EngineInput = mkInput(4, 1, 60);

describe("fairness metadata", () => {
  it("reports max/min games correctly and fairnessScore 1 for perfect distribution", () => {
    const s = createInitialState(mockInput.players);
    s.gamesPlayed.set("p0", 1);
    s.gamesPlayed.set("p1", 1);
    s.gamesPlayed.set("p2", 1);
    s.gamesPlayed.set("p3", 1);

    const metadata = computeFairness(s, { matches: [], sitOuts: [] }, mockInput);
    expect(metadata.minGamesPerPlayer).toBe(1);
    expect(metadata.maxGamesPerPlayer).toBe(1);
    expect(metadata.fairnessScore).toBe(1);
  });

  it("reduces fairness score for sit-out spread", () => {
    const s = createInitialState(mockInput.players);
    s.sitOuts.set("p0", 2);
    s.sitOuts.set("p1", 0);
    const metadata = computeFairness(s, { matches: [], sitOuts: [] }, mockInput);
    expect(metadata.fairnessScore).toBeLessThan(1);
    expect(metadata.notes.some(n => n.toLowerCase().includes("sit-out"))).toBe(true);
  });

  it("reduces fairness score when repeated partners are detected", () => {
    const s = createInitialState(mockInput.players);
    // Simulate p0+p1 paired 3 times — well above the repeat threshold
    s.partnerCount.set("p0|p1", 3);
    const metadata = computeFairness(s, { matches: [], sitOuts: [] }, mockInput);
    expect(metadata.fairnessScore).toBeLessThan(1);
    expect(metadata.notes.some(n => n.toLowerCase().includes("repeat"))).toBe(true);
  });
});

describe("play-with-everyone diversity (integration)", () => {
  it("8 players / 2 courts / 60 min: each pair plays together at most twice", () => {
    const out = generateSchedule(mkInput(8, 2, 60));
    const partnerTally = new Map<string, number>();
    for (const m of out.matches) {
      const record = (a: string, b: string) => {
        const k = [a, b].sort().join("|");
        partnerTally.set(k, (partnerTally.get(k) ?? 0) + 1);
      };
      record(m.teamA[0], m.teamA[1]);
      record(m.teamB[0], m.teamB[1]);
    }
    const maxRepeat = Math.max(...partnerTally.values(), 0);
    expect(maxRepeat).toBeLessThanOrEqual(2);
  });

  it("12 players / 3 courts / 60 min: fairnessScore >= 0.7", () => {
    const out = generateSchedule(mkInput(12, 3, 60));
    expect((out.metadata as any).fairnessScore).toBeGreaterThanOrEqual(0.7);
  });

  it("10 players / 2 courts / 90 min: games spread <= 1", () => {
    const out = generateSchedule(mkInput(10, 2, 90));
    const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const gamesPerPlayer = ids.map((id) => out.matches.filter((m) => [...m.teamA, ...m.teamB].includes(id)).length);
    const spread = Math.max(...gamesPerPlayer) - Math.min(...gamesPerPlayer);
    expect(spread).toBeLessThanOrEqual(1);
  });
});
