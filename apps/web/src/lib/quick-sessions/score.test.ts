import { describe, it, expect } from "vitest";
import { computeMatchKey, getWinner, computeRoundStatus } from "./score";
import type { GeneratedMatch } from "@picklebaddies/match-engine";
import type { QuickScore } from "./types";

describe("computeMatchKey", () => {
  it("produces r{round}_{courtId}", () => {
    expect(computeMatchKey(1, "court-1")).toBe("r1_court-1");
    expect(computeMatchKey(3, "court-2")).toBe("r3_court-2");
  });
});

describe("getWinner", () => {
  it("returns 'a' when team A has higher score", () => {
    expect(getWinner(11, 7)).toBe("a");
  });
  it("returns 'b' when team B has higher score", () => {
    expect(getWinner(7, 11)).toBe("b");
  });
  it("returns null when tied", () => {
    expect(getWinner(11, 11)).toBeNull();
  });
});

const m = (round: number, court: string): GeneratedMatch => ({
  roundNumber: round,
  courtId: court,
  matchNumber: 1,
  teamA: ["p1", "p2"],
  teamB: ["p3", "p4"],
});

describe("computeRoundStatus", () => {
  const matches: GeneratedMatch[] = [
    m(1, "court-1"), m(1, "court-2"),
    m(2, "court-1"), m(2, "court-2"),
    m(3, "court-1"), m(3, "court-2"),
  ];

  it("round 1 is playing when no scores recorded", () => {
    expect(computeRoundStatus(1, matches, {})).toBe("playing");
  });

  it("round 2 is up_next while round 1 is playing", () => {
    expect(computeRoundStatus(2, matches, {})).toBe("up_next");
  });

  it("round 1 becomes done when all its matches are scored", () => {
    const scores: Record<string, QuickScore> = {
      "r1_court-1": { teamAScore: 11, teamBScore: 7 },
      "r1_court-2": { teamAScore: 9, teamBScore: 11 },
    };
    expect(computeRoundStatus(1, matches, scores)).toBe("done");
  });

  it("round 2 becomes playing once round 1 is done", () => {
    const scores: Record<string, QuickScore> = {
      "r1_court-1": { teamAScore: 11, teamBScore: 7 },
      "r1_court-2": { teamAScore: 9, teamBScore: 11 },
    };
    expect(computeRoundStatus(2, matches, scores)).toBe("playing");
  });

  it("round 3 is up_next while round 2 is playing", () => {
    const scores: Record<string, QuickScore> = {
      "r1_court-1": { teamAScore: 11, teamBScore: 7 },
      "r1_court-2": { teamAScore: 9, teamBScore: 11 },
    };
    expect(computeRoundStatus(3, matches, scores)).toBe("up_next");
  });
});
