// apps/web/src/lib/quick-sessions/queue.test.ts
import { describe, it, expect } from "vitest";
import { computeMatchStates } from "./queue";
import type { QuickScore } from "./types";
import type { GeneratedMatch } from "@picklebaddies/match-engine";

function match(roundNumber: number, courtId: string, matchNumber = 1): GeneratedMatch {
  return { roundNumber, courtId, matchNumber, teamA: ["p1", "p2"], teamB: ["p3", "p4"] };
}

function score(a = 11, b = 5): QuickScore { return { teamAScore: a, teamBScore: b }; }

const key = (r: number, c: string) => `r${r}_${c}`;

describe("computeMatchStates", () => {
  it("all up_next when no scores and courts=2", () => {
    const matches = [match(1, "court-1", 1), match(1, "court-2", 2), match(2, "court-1", 3)];
    const states = computeMatchStates(matches, {}, 2);
    expect(states.get(key(1, "court-1"))).toBe("live");
    expect(states.get(key(1, "court-2"))).toBe("live");
    expect(states.get(key(2, "court-1"))).toBe("up_next");
  });

  it("live window slides when first match scored", () => {
    const matches = [match(1, "court-1", 1), match(1, "court-2", 2), match(2, "court-1", 3)];
    const scores = { [key(1, "court-1")]: score() };
    const states = computeMatchStates(matches, scores, 2);
    expect(states.get(key(1, "court-1"))).toBe("done");
    expect(states.get(key(1, "court-2"))).toBe("live");
    expect(states.get(key(2, "court-1"))).toBe("live");
  });

  it("all done when all scored", () => {
    const matches = [match(1, "court-1", 1), match(1, "court-2", 2)];
    const scores = {
      [key(1, "court-1")]: score(),
      [key(1, "court-2")]: score(),
    };
    const states = computeMatchStates(matches, scores, 2);
    expect(states.get(key(1, "court-1"))).toBe("done");
    expect(states.get(key(1, "court-2"))).toBe("done");
  });

  it("courts=1 means only 1 live at a time", () => {
    const matches = [match(1, "court-1", 1), match(2, "court-1", 2), match(3, "court-1", 3)];
    const states = computeMatchStates(matches, {}, 1);
    expect(states.get(key(1, "court-1"))).toBe("live");
    expect(states.get(key(2, "court-1"))).toBe("up_next");
    expect(states.get(key(3, "court-1"))).toBe("up_next");
  });

  it("courts >= remaining matches → all live", () => {
    const matches = [match(1, "court-1", 1), match(2, "court-1", 2)];
    const states = computeMatchStates(matches, {}, 4);
    expect(states.get(key(1, "court-1"))).toBe("live");
    expect(states.get(key(2, "court-1"))).toBe("live");
  });

  it("sorted by roundNumber then matchNumber", () => {
    // Court-2 round-1 matchNumber=2, court-1 round-1 matchNumber=1 → court-1 queues first
    const matches = [match(1, "court-2", 2), match(1, "court-1", 1)];
    const scores = { [key(1, "court-1")]: score() };
    const states = computeMatchStates(matches, scores, 1);
    expect(states.get(key(1, "court-1"))).toBe("done");
    expect(states.get(key(1, "court-2"))).toBe("live");
  });

  it("handles empty matches", () => {
    const states = computeMatchStates([], {}, 2);
    expect(states.size).toBe(0);
  });
});
