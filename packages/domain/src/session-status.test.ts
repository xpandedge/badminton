import { describe, it, expect } from "vitest";
import { SCHEDULABLE_STATUSES, isSchedulable } from "./session-status.js";

describe("schedulable player statuses (DELTA_SPEC D7)", () => {
  it("only checked_in/active players are schedulable", () => {
    expect(isSchedulable("active")).toBe(true);
    expect(isSchedulable("checked_in")).toBe(true);
  });
  it("waiting/left/removed/no_show are NOT scheduled into future rounds", () => {
    for (const s of ["waiting", "left", "removed", "no_show", "invited", "registered"] as const) {
      expect(isSchedulable(s)).toBe(false);
    }
  });
  it("exposes the schedulable set", () => {
    expect([...SCHEDULABLE_STATUSES].sort()).toEqual(["active", "checked_in"]);
  });
});
