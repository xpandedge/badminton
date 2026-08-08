import { describe, it, expect } from "vitest";
import { buildRebalanceSummary } from "./rebalance-summary.js";

describe("buildRebalanceSummary", () => {
  it("describes preserved matches and roster changes", () => {
    const s = buildRebalanceSummary({
      completedPreserved: 2, inProgressPreserved: 1,
      removed: ["Ravi"], addedFromRound: [{ name: "Anita", round: 4 }],
      minGames: 3, maxGames: 4,
    });
    expect(s).toContain("2 completed matches preserved");
    expect(s).toContain("1 current match preserved");
    expect(s).toContain("Ravi removed from future rounds");
    expect(s).toContain("Anita added from Round 4");
    expect(s).toContain("3–4");
  });

  it("handles no removals or additions", () => {
    const s = buildRebalanceSummary({
      completedPreserved: 0, inProgressPreserved: 0,
      removed: [], addedFromRound: [],
      minGames: 2, maxGames: 2,
    });
    expect(s).toContain("Future rounds regenerated.");
    expect(s).toContain("0 completed matches preserved");
    expect(s).toContain("2–2");
    expect(s).not.toContain("removed from future rounds");
    expect(s).not.toContain("added from Round");
  });

  it("pluralizes 'match' correctly for 0, 1, and 2+ counts", () => {
    const two = buildRebalanceSummary({ completedPreserved: 2, inProgressPreserved: 2, removed: [], addedFromRound: [], minGames: 1, maxGames: 1 });
    expect(two).toContain("2 completed matches preserved");
    expect(two).toContain("2 current matches preserved");

    const one = buildRebalanceSummary({ completedPreserved: 1, inProgressPreserved: 1, removed: [], addedFromRound: [], minGames: 1, maxGames: 1 });
    expect(one).toContain("1 completed match preserved");
    expect(one).toContain("1 current match preserved");

    const zero = buildRebalanceSummary({ completedPreserved: 0, inProgressPreserved: 0, removed: [], addedFromRound: [], minGames: 1, maxGames: 1 });
    expect(zero).toContain("0 completed matches preserved");
    expect(zero).toContain("0 current matches preserved");
  });

  it("handles multiple removed and added players", () => {
    const s = buildRebalanceSummary({
      completedPreserved: 1, inProgressPreserved: 0,
      removed: ["Ali", "Sam"], addedFromRound: [{ name: "Jo", round: 2 }, { name: "Pat", round: 3 }],
      minGames: 1, maxGames: 3,
    });
    expect(s).toContain("Ali removed from future rounds");
    expect(s).toContain("Sam removed from future rounds");
    expect(s).toContain("Jo added from Round 2");
    expect(s).toContain("Pat added from Round 3");
  });
});
