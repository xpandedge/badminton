import { describe, it, expect } from "vitest";
import { deriveWinner, leaderboardCompare, winRate } from "./scoring.js";

describe("deriveWinner — points are always optional, a winner is always required", () => {
  it("derives from points when given, regardless of mode; ties rejected", () => {
    expect(deriveWinner({ teamAScore: 21, teamBScore: 18 }, "points")).toBe("A");
    expect(deriveWinner({ teamAScore: 21, teamBScore: 18 }, "winner_only")).toBe("A");
    expect(() => deriveWinner({ teamAScore: 21, teamBScore: 21 }, "points")).toThrow();
  });
  it("falls back to an explicit winner pick when no points are given, regardless of mode", () => {
    expect(deriveWinner({ winnerTeam: "B" }, "winner_only")).toBe("B");
    expect(deriveWinner({ winnerTeam: "B" }, "points")).toBe("B");
  });
  it("throws when the payload has neither points nor a winner", () => {
    expect(() => deriveWinner({} as any, "points")).toThrow();
  });
});

describe("winRate", () => {
  it("is the won/played ratio, and zero for a player with no games", () => {
    expect(winRate({ wins: 3, gamesPlayed: 4 })).toBeCloseTo(0.75);
    expect(winRate({ wins: 0, gamesPlayed: 0 })).toBe(0);
  });
});

describe("leaderboardCompare", () => {
  it("ranks on win% first, not on raw wins", () => {
    const a = { wins: 2, pointDifference: 0, gamesPlayed: 2, sitOutCount: 0 }; // 100%
    const b = { wins: 5, pointDifference: 0, gamesPlayed: 8, sitOutCount: 0 }; // 62.5%
    expect(leaderboardCompare(a, b, "points")).toBeLessThan(0);      // a ranks first
    expect(leaderboardCompare(a, b, "winner_only")).toBeLessThan(0); // a ranks first
  });

  it("breaks an equal win% on raw wins, so more games at the same rate ranks ahead", () => {
    const a = { wins: 4, pointDifference: 0, gamesPlayed: 8, sitOutCount: 0 }; // 50%
    const b = { wins: 1, pointDifference: 0, gamesPlayed: 2, sitOutCount: 0 }; // 50%
    expect(leaderboardCompare(a, b, "points")).toBeLessThan(0);
    expect(leaderboardCompare(a, b, "winner_only")).toBeLessThan(0);
  });

  it("compares win% exactly, without floating-point drift", () => {
    const a = { wins: 1, pointDifference: 0, gamesPlayed: 3, sitOutCount: 0 };
    const b = { wins: 2, pointDifference: 0, gamesPlayed: 6, sitOutCount: 0 };
    // identical rate → falls through to raw wins, where b leads
    expect(leaderboardCompare(a, b, "points")).toBeGreaterThan(0);
  });

  it("ranks a player with no games behind anyone who has played", () => {
    const played = { wins: 0, pointDifference: -9, gamesPlayed: 3, sitOutCount: 0 }; // 0%
    const unplayed = { wins: 0, pointDifference: 0, gamesPlayed: 0, sitOutCount: 0 };
    expect(leaderboardCompare(played, unplayed, "points")).toBeLessThan(0);
    expect(leaderboardCompare(played, unplayed, "winner_only")).toBeLessThan(0);
  });

  it("points mode: equal win% and wins, then point diff", () => {
    const a = { wins: 3, pointDifference: 5, gamesPlayed: 4, sitOutCount: 0 };
    const b = { wins: 3, pointDifference: 9, gamesPlayed: 4, sitOutCount: 0 };
    expect(leaderboardCompare(a, b, "points")).toBeGreaterThan(0); // b ranks first
  });
  it("winner_only mode: ignores point diff, uses fewer sit-outs once rate and wins tie", () => {
    const a = { wins: 3, pointDifference: 0, gamesPlayed: 4, sitOutCount: 1 };
    const b = { wins: 3, pointDifference: 0, gamesPlayed: 4, sitOutCount: 0 };
    expect(leaderboardCompare(a, b, "winner_only")).toBeGreaterThan(0); // b ranks first (fewer sit-outs)
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
