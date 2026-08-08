import { describe, it, expect } from "vitest";
import { findPlayerMatch } from "./player-view";

describe("findPlayerMatch (continuous per-court scheduling)", () => {
  const matches = [
    { id: "1", roundNumber: 1, status: "completed", teamA: [{ playerId: "p1" }], teamB: [{ playerId: "p2" }] },
    { id: "2", roundNumber: 1, status: "scheduled", teamA: [{ playerId: "p3" }], teamB: [{ playerId: "p4" }] },
    { id: "3", roundNumber: 2, status: "scheduled", teamA: [{ playerId: "p1" }], teamB: [{ playerId: "p6" }] },
  ];

  it("finds the player's current scheduled match", () => {
    const res = findPlayerMatch(matches, "p3");
    expect(res.currentMatch?.id).toBe("2");
    expect(res.waiting).toBe(false);
  });

  it("ignores a completed match — only a scheduled one counts as current", () => {
    const res = findPlayerMatch(matches, "p1");
    expect(res.currentMatch?.id).toBe("3");
    expect(res.waiting).toBe(false);
  });

  it("reports waiting when the player has no scheduled match", () => {
    const res = findPlayerMatch(matches, "p5");
    expect(res.currentMatch).toBe(null);
    expect(res.waiting).toBe(true);
  });
});
