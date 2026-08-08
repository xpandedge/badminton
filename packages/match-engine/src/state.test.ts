import { describe, it, expect } from "vitest";
import { createInitialState, seedStateFromLocked, pairKey, recordMatch } from "./state.js";
import type { EnginePlayer, LockedMatch } from "./types.js";

const players: EnginePlayer[] = ["p1","p2","p3","p4"].map((id) => ({
  playerId: id, displayName: id, skillLevel: "unknown", availableFromRound: 1,
}));

describe("engine state", () => {
  it("starts everyone at zero", () => {
    const s = createInitialState(players);
    expect(s.gamesPlayed.get("p1")).toBe(0);
    expect(s.sitOuts.get("p1")).toBe(0);
  });
  it("pairKey is order-independent", () => {
    expect(pairKey("p2","p1")).toBe(pairKey("p1","p2"));
  });
  it("seeds games + partner/opponent history from locked matches", () => {
    const locked: LockedMatch[] = [{ roundNumber: 1, courtId: "c1", teamA: ["p1","p2"], teamB: ["p3","p4"] }];
    const s = seedStateFromLocked(players, locked);
    expect(s.gamesPlayed.get("p1")).toBe(1);
    expect(s.partnerCount.get(pairKey("p1","p2"))).toBe(1);
    expect(s.opponentCount.get(pairKey("p1","p3"))).toBe(1);
  });
});