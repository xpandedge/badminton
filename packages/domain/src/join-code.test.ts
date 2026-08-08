import { describe, it, expect } from "vitest";
import { generateJoinCode, normalizeJoinCode } from "./join-code.js";

describe("join codes", () => {
  it("is deterministic given a seed and 6 unambiguous chars", () => {
    const code = generateJoinCode(() => 0.5);
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
    expect(generateJoinCode(() => 0.5)).toBe(code);
  });
  it("normalizes user input (uppercase, trims, strips spaces)", () => {
    expect(normalizeJoinCode("  ab c12 ")).toBe("ABC12");
  });
});
