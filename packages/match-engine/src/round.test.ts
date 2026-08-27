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

  it("keeps overplayed substitutes out when four lower-load players are available", () => {
    const sixPlayers: EnginePlayer[] = Array.from({ length: 6 }, (_, i) => ({
      playerId: `p${i}`, displayName: `p${i}`, skillLevel: "unknown", availableFromRound: 1,
    }));
    const state = createInitialState(sixPlayers);

    // Make the four least-played players an unattractive relationship group.
    // Game-load fairness must still win before partner/opponent optimisation.
    recordMatch(state, 1, ["p0", "p1"], ["p2", "p3"]);
    for (const id of ["p0", "p1", "p2", "p3"]) state.gamesPlayed.set(id, 0);
    state.gamesPlayed.set("p4", 2);
    state.gamesPlayed.set("p5", 2);

    const result = buildRound(state, sixPlayers, [courts[0]!], 2);
    const selected = new Set([...result.matches[0]!.teamA, ...result.matches[0]!.teamB]);

    expect(selected).toEqual(new Set(["p0", "p1", "p2", "p3"]));
  });

  it("globally balances two courts instead of leaving one court with bad leftovers", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const ps: EnginePlayer[] = ids.map((id) => ({
      playerId: id,
      displayName: id,
      skillLevel: "unknown",
      availableFromRound: 1,
    }));
    const state = createInitialState(ps);
    const order = new Map(ids.map((id, index) => [id, index]));

    recordMatch(state, 1, ["b", "f"], ["c", "d"]);
    recordMatch(state, 2, ["c", "e"], ["a", "d"]);
    recordMatch(state, 3, ["d", "f"], ["c", "h"]);
    recordMatch(state, 4, ["a", "c"], ["d", "f"]);

    for (const id of ids) {
      state.gamesPlayed.set(id, 0);
      state.playStreak.set(id, 0);
    }

    const result = buildRound(state, ps, courts, 5, order);
    const groupKeys = result.matches
      .map((m) => [...m.teamA, ...m.teamB].sort().join(""))
      .sort();

    expect(groupKeys).toEqual(["abch", "defg"]);
  });
});

describe("buildRound — who plays is chosen on pairing history, not just sit-out order", () => {
  const six: EnginePlayer[] = ["a", "b", "c", "d", "e", "f"].map((id) => ({
    playerId: id, displayName: id, skillLevel: "unknown", availableFromRound: 1,
  }));
  const oneCourt: EngineCourt[] = [{ courtId: "c1", name: "Court 1", courtNumber: 1 }];

  /** The continuous-refill shape: one freed court, an idle pool bigger than it needs. */
  it("avoids re-running a foursome that has already played together", () => {
    const state = createInitialState(six);
    // c,d,e,f have met over and over; a and b are the fresh pair.
    for (let round = 1; round <= 4; round++) {
      recordMatch(state, round, ["c", "d"], ["e", "f"]);
    }
    // Level sit-out fairness so nothing but pairing history separates the six.
    // Sorted by the old fairness ranking this sits a and b — the two players who
    // have met nobody — and re-runs c,d,e,f for a fifth time.
    for (const id of ["a", "b", "c", "d", "e", "f"]) {
      state.gamesPlayed.set(id, 4);
      state.sitOuts.set(id, 0);
      state.playStreak.set(id, 0);
    }

    const { matches } = buildRound(state, six, oneCourt, 5);
    expect(matches.length).toBe(1);
    const onCourt = new Set([...matches[0]!.teamA, ...matches[0]!.teamB]);
    // a and b have played nobody — they belong on court ahead of a fifth c/d/e/f.
    expect(onCourt.has("a")).toBe(true);
    expect(onCourt.has("b")).toBe(true);
  });

  it("still sits the players that sit-out fairness requires", () => {
    const state = createInitialState(six);
    // e and f have sat out twice already; they must play, whatever the history says.
    state.sitOuts.set("e", 2);
    state.sitOuts.set("f", 2);
    for (const id of ["a", "b", "c", "d"]) state.sitOuts.set(id, 0);
    for (let round = 1; round <= 3; round++) recordMatch(state, round, ["e", "f"], ["a", "b"]);

    const { matches, sitOuts } = buildRound(state, six, oneCourt, 4);
    expect(matches.length).toBe(1);
    const sat = new Set(sitOuts.map((s) => s.playerId));
    expect(sat.has("e")).toBe(false);
    expect(sat.has("f")).toBe(false);
    expect(sat.size).toBe(2);
  });

  it("never sits a player two rounds running when someone else can sit", () => {
    const state = createInitialState(six);
    for (const id of ["a", "b", "c", "d", "e", "f"]) state.gamesPlayed.set(id, 3);
    state.lastSitOutRound.set("a", 4);
    state.lastSitOutRound.set("b", 4);
    state.sitOuts.set("a", 1);
    state.sitOuts.set("b", 1);

    const { sitOuts } = buildRound(state, six, oneCourt, 5);
    const sat = sitOuts.map((s) => s.playerId);
    expect(sat).not.toContain("a");
    expect(sat).not.toContain("b");
  });
});
