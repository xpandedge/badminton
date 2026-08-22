import { describe, expect, it } from "vitest";
import { normalizePlayerDisplayName } from "./display-name.js";

describe("normalizePlayerDisplayName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizePlayerDisplayName("  Sanjeev   Sharma  ")).toBe("Sanjeev Sharma");
  });

  it("rejects a blank name", () => {
    expect(() => normalizePlayerDisplayName("   ")).toThrow("Enter the name players should call you");
  });

  it("rejects a one-character name", () => {
    expect(() => normalizePlayerDisplayName("S")).toThrow("Use at least 2 characters");
  });

  it("rejects names longer than 60 characters", () => {
    expect(() => normalizePlayerDisplayName("S".repeat(61))).toThrow("Use 60 characters or fewer");
  });
});
