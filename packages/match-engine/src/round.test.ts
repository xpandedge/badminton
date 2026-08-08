import { describe, it, expect } from "vitest";
import { buildRound } from "./round.js";
import { createInitialState, recordMatch } from "./state.js";
import type { EnginePlayer, EngineCourt } from "./types.js";

const players: EnginePlayer[] = Array.from({ length: 8 }, (_, i) => ({
  playerId: `p${i}`, displayName: `p${i}`, skillLevel: "unknown", availableFromRound: 1
}));
const courts: EngineCourt[] = [
  { courtId: "c1", name: "Court 1", courtNumber: 1 },
  { courtId: "c2", name: "Court 2", courtNumber: 2 },
];

describe("buildRound", () => {
  it("builds a single round correctly for 8 players and 2 courts", () => {
    const state = createInitialState(players);
    const result = buildRound(state, players, courts, 1);

    expect(result.sitOuts.length).toBe(0);
    expect(result.matches.length).toBe(2);

    const usedPlayers = new Set(result.matches.flatMap(m => [...m.teamA, ...m.teamB]));
    expect(usedPlayers.size).toBe(8);
  });

  it("builds a round for 9 players and 2 courts (1 sit out)", () => {
    const players9 = [...players, { playerId: "p8", displayName: "p8", skillLevel: "unknown", availableFromRound: 1 } as EnginePlayer];
    const state = createInitialState(players9);
    const result = buildRound(state, players9, courts, 1);

    expect(result.sitOuts.length).toBe(1);
    expect(result.matches.length).toBe(2);
    expect(result.matches[0].courtId).toBeDefined();
  });

  it("avoids recent partner", () => {
    const state = createInitialState(players);
    // make p0 and p1 partners in round 1
    recordMatch(state, 1, ["p0", "p1"], ["p2", "p3"]);

    // now we generate round 2
    const result = buildRound(state, players, courts, 2);

    // p0 and p1 should ideally not be partners again
    const matchWithP0 = result.matches.find(m => m.teamA.includes("p0") || m.teamB.includes("p0"))!;
    const isPartner = matchWithP0.teamA.includes("p0") && matchWithP0.teamA.includes("p1") ||
                      matchWithP0.teamB.includes("p0") && matchWithP0.teamB.includes("p1");
    expect(isPartner).toBe(false);
  });
});
