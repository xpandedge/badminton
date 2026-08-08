import { describe, it, expect } from "vitest";
import { findPlayerMatch } from "./player-view";

describe("findPlayerMatch (DELTA_SPEC D7)", () => {
  const matches = [
    { id: "1", roundNumber: 1, teamA: [{ playerId: "p1" }], teamB: [{ playerId: "p2" }] },
    { id: "2", roundNumber: 1, teamA: [{ playerId: "p3" }], teamB: [{ playerId: "p4" }] },
    { id: "3", roundNumber: 2, teamA: [{ playerId: "p1" }], teamB: [{ playerId: "p3" }] },
    { id: "4", roundNumber: 2, teamA: [{ playerId: "p5" }], teamB: [{ playerId: "p6" }] },
  ];

  it("finds current match and next match", () => {
    const res = findPlayerMatch(matches, 1, "p1");
    expect(res.currentMatch?.id).toBe("1");
    expect(res.nextMatch?.id).toBe("3");
    expect(res.waiting).toBe(false);
  });

  it("identifies waiting status if not in current round", () => {
    const res = findPlayerMatch(matches, 1, "p5");
    expect(res.currentMatch).toBe(null);
    expect(res.nextMatch?.id).toBe("4");
    expect(res.waiting).toBe(true);
  });

  it("handles no next match", () => {
    const res = findPlayerMatch(matches, 2, "p1");
    expect(res.currentMatch?.id).toBe("3");
    expect(res.nextMatch).toBe(null);
    expect(res.waiting).toBe(false);
  });
});
