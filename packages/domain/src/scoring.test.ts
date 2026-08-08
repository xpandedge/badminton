import { describe, it, expect } from "vitest";
import { deriveWinner, leaderboardCompare } from "./scoring.js";

describe("deriveWinner (DELTA_SPEC D1)", () => {
  it("points mode: higher score wins, ties rejected", () => {
    expect(deriveWinner({ teamAScore: 21, teamBScore: 18 }, "points")).toBe("A");
    expect(() => deriveWinner({ teamAScore: 21, teamBScore: 21 }, "points")).toThrow();
  });
  it("winner_only mode: takes winnerTeam, rejects stray scores", () => {
    expect(deriveWinner({ winnerTeam: "B" }, "winner_only")).toBe("B");
    expect(() => deriveWinner({ teamAScore: 21, teamBScore: 18 } as any, "winner_only")).toThrow();
  });
});

describe("leaderboardCompare", () => {
  it("points mode: wins, then point diff, then games", () => {
    const a = { wins: 3, pointDifference: 5, gamesPlayed: 4, sitOutCount: 0 };
    const b = { wins: 3, pointDifference: 9, gamesPlayed: 4, sitOutCount: 0 };
    expect(leaderboardCompare(a, b, "points")).toBeGreaterThan(0); // b ranks first
  });
  it("winner_only mode: ignores point diff, uses wins, games, fewer sit-outs", () => {
    const a = { wins: 3, pointDifference: 0, gamesPlayed: 5, sitOutCount: 1 };
    const b = { wins: 3, pointDifference: 0, gamesPlayed: 4, sitOutCount: 0 };
    expect(leaderboardCompare(a, b, "winner_only")).toBeLessThan(0); // a ranks first (more games)
  });

  it("points mode ignores sitOutCount; falls to displayName when fully tied", () => {
    const a = { wins: 2, pointDifference: 3, gamesPlayed: 4, sitOutCount: 5, displayName: "Zoe" };
    const b = { wins: 2, pointDifference: 3, gamesPlayed: 4, sitOutCount: 0, displayName: "Amy" };
    // sitOutCount differs but points mode must ignore it → deterministic by name (Amy < Zoe)
    expect(leaderboardCompare(a, b, "points")).toBeGreaterThan(0); // b (Amy) ranks first
  });

  it("fully-tied rows are deterministically ordered by displayName in both modes", () => {
    const a = { wins: 1, pointDifference: 1, gamesPlayed: 2, sitOutCount: 0, displayName: "Bob" };
    const b = { wins: 1, pointDifference: 1, gamesPlayed: 2, sitOutCount: 0, displayName: "Ana" };
    expect(leaderboardCompare(a, b, "points")).toBeGreaterThan(0);
    expect(leaderboardCompare(a, b, "winner_only")).toBeGreaterThan(0);
  });
});
