import { describe, it, expect } from "vitest";
import { SKILL_LEVELS, isSkillLevel } from "./skill.js";

describe("skill levels", () => {
  it("lists the four MVP levels in order", () => {
    expect(SKILL_LEVELS).toEqual(["unknown", "beginner", "intermediate", "advanced"]);
  });
  it("validates known/unknown values", () => {
    expect(isSkillLevel("advanced")).toBe(true);
    expect(isSkillLevel("pro")).toBe(false);
  });
});
