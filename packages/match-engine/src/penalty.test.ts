import { describe, it, expect } from "vitest";
import { bestTeamSplit, DEFAULT_WEIGHTS, type FoursomePlayer } from "./penalty.js";
import { createInitialState, recordMatch } from "./state.js";
import { balanceRatingFromSkill, type EnginePlayer } from "./types.js";

const fp = (id: string, skillLevel: FoursomePlayer["skillLevel"] = "unknown"): FoursomePlayer => ({ playerId: id, skillLevel });

describe("penalty model + best team split", () => {
  it("minimizes partner repeats first", () => {
    const players: EnginePlayer[] = ["p1","p2","p3","p4"].map((id) => ({
      playerId: id, displayName: id, skillLevel: "unknown", availableFromRound: 1,
    }));
    const s = createInitialState(players);
    recordMatch(s, 1, ["p1", "p2"], ["p3", "p4"]); // p1+p2 partnered

    const split = bestTeamSplit(s, [fp("p1"), fp("p2"), fp("p3"), fp("p4")]);

    // It should avoid p1+p2 as a team again.
    const hasP1P2 = (split.teamA.includes("p1") && split.teamA.includes("p2")) ||
                    (split.teamB.includes("p1") && split.teamB.includes("p2"));
    expect(hasP1P2).toBe(false);
  });

  it("minimizes skill gap", () => {
    const players: EnginePlayer[] = ["a1","a2","b1","b2"].map((id) => ({
      playerId: id, displayName: id, skillLevel: "unknown", availableFromRound: 1,
    }));
    const s = createInitialState(players);

    // a1+a2 vs b1+b2 -> 6 vs 2
    // a1+b1 vs a2+b2 -> 4 vs 4
    const split = bestTeamSplit(s, [
      fp("a1", "advanced"), fp("a2", "advanced"),
      fp("b1", "beginner"), fp("b2", "beginner")
    ]);

    expect(split.penalty).toBe(0); // perfect balance
  });

  it("uses numeric balance ratings when present", () => {
    const players: EnginePlayer[] = ["strongA", "strongB", "guestA", "guestB"].map((id) => ({
      playerId: id,
      displayName: id,
      skillLevel: "intermediate",
      availableFromRound: 1,
    }));
    const s = createInitialState(players);

    const split = bestTeamSplit(s, [
      { playerId: "strongA", skillLevel: "intermediate", balanceRating: 1200 },
      { playerId: "strongB", skillLevel: "intermediate", balanceRating: 1180 },
      { playerId: "guestA", skillLevel: "intermediate", balanceRating: 1000 },
      { playerId: "guestB", skillLevel: "intermediate", balanceRating: 980 },
    ]);

    const strongTogether = (
      split.teamA.includes("strongA") && split.teamA.includes("strongB")
    ) || (
      split.teamB.includes("strongA") && split.teamB.includes("strongB")
    );
    expect(strongTogether).toBe(false);
  });

  it("converts admin skill levels to temporary balance ratings", () => {
    expect(balanceRatingFromSkill("beginner")).toBe(900);
    expect(balanceRatingFromSkill("intermediate")).toBe(1000);
    expect(balanceRatingFromSkill("advanced")).toBe(1120);
    expect(balanceRatingFromSkill("unknown")).toBe(1000);
  });
});
