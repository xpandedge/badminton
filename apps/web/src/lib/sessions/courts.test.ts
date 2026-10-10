import { describe, expect, it } from "vitest";
import { changeCourts } from "./courts";

const courts = [
  { courtId: "a", name: "Court 1", courtNumber: 1, isActive: true },
  { courtId: "b", name: "Court 2", courtNumber: 2, isActive: false },
];
describe("live court changes", () => {
  it("adds an active court without enabling other courts", () => {
    const result = changeCourts(courts, { name: "Court 3", courtNumber: 3 }, "c");
    expect(result.filter(c => c.isActive)).toHaveLength(2);
    expect(result[0]?.courtId).toBe("c");
    expect(courts).toHaveLength(2);
  });
  it("renames and renumbers while preserving identity and availability", () => {
    expect(changeCourts(courts, { courtId: "b", name: " Back court ", courtNumber: 8 }, "unused")[1])
      .toEqual({ courtId: "b", name: "Back court", courtNumber: 8, isActive: false });
  });
  it("enables a disabled court", () => {
    expect(changeCourts(courts, { courtId: "b", isActive: true }, "unused")[1]?.isActive).toBe(true);
  });
  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid number %s", courtNumber => {
    expect(() => changeCourts(courts, { name: "New", courtNumber }, "c")).toThrow();
  });
  it("rejects duplicate names, numbers, empty names and missing courts", () => {
    for (const change of [{ name: " court 1 ", courtNumber: 3 }, { name: "New", courtNumber: 2 }, { name: " ", courtNumber: 3 }, { courtId: "missing", isActive: true }]) {
      expect(() => changeCourts(courts, change, "c")).toThrow();
    }
  });
});
