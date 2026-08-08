import { describe, it, expect } from "vitest";
import { buildRebalanceSummary } from "./rebalance-summary.js";

describe("buildRebalanceSummary", () => {
  it("describes preserved, cancelled, and regenerated matches plus removals", () => {
    const s = buildRebalanceSummary({
      completedPreserved: 2, cancelled: 1, regenerated: 1, removed: ["Ravi"],
    });
    expect(s).toContain("2 completed matches preserved");
    expect(s).toContain("1 not-yet-started match re-picked");
    expect(s).toContain("1 new match assigned");
    expect(s).toContain("Ravi removed from the session");
  });

  it("handles no removals", () => {
    const s = buildRebalanceSummary({ completedPreserved: 0, cancelled: 0, regenerated: 0, removed: [] });
    expect(s).toContain("0 completed matches preserved");
    expect(s).not.toContain("removed from the session");
  });

  it("pluralizes 'match' correctly for 0, 1, and 2+ counts", () => {
    const two = buildRebalanceSummary({ completedPreserved: 2, cancelled: 2, regenerated: 2, removed: [] });
    expect(two).toContain("2 completed matches preserved");
    expect(two).toContain("2 not-yet-started matches re-picked");
    expect(two).toContain("2 new matches assigned");

    const one = buildRebalanceSummary({ completedPreserved: 1, cancelled: 1, regenerated: 1, removed: [] });
    expect(one).toContain("1 completed match preserved");
    expect(one).toContain("1 not-yet-started match re-picked");
    expect(one).toContain("1 new match assigned");
  });

  it("handles multiple removed players", () => {
    const s = buildRebalanceSummary({ completedPreserved: 1, cancelled: 0, regenerated: 0, removed: ["Ali", "Sam"] });
    expect(s).toContain("Ali removed from the session");
    expect(s).toContain("Sam removed from the session");
  });
});
