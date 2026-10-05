import { describe, expect, it } from "vitest";
import { parseCastMessage, normalizePairCode, canClaimPair } from "./connection";
describe("TV connection contracts", () => {
  it("accepts only a display-token message, never arbitrary URLs or scoring codes", () => {
    const token = "a".repeat(64);
    expect(parseCastMessage({ type: "display", token })).toBe(token);
    expect(parseCastMessage({ type: "display", token: "ABC123" })).toBeNull();
    expect(parseCastMessage({ type: "url", url: "https://example.com" })).toBeNull();
    expect(parseCastMessage(null)).toBeNull();
  });
  it("normalizes short pairing codes without accepting arbitrary paths", () => {
    expect(normalizePairCode(" ab12-cd34 ")).toBe("AB12CD34");
    expect(normalizePairCode("../../abcd")).toBeNull();
  });
  it("rejects missing, expired and already-claimed pairing codes", () => {
    expect(canClaimPair(undefined, 10)).toBe(false);
    expect(canClaimPair({ expiresAt: 10 }, 10)).toBe(false);
    expect(canClaimPair({ expiresAt: 20, claimed: true }, 10)).toBe(false);
    expect(canClaimPair({ expiresAt: 20 }, 10)).toBe(true);
  });
});
