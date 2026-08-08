import { describe, it, expect } from "vitest";
import { findDuplicatePlayers } from "./duplicate.js";

const existing = [
  { id: "a", displayName: "Ravi Kumar", email: "ravi@x.com" },
  { id: "b", displayName: "Anita", email: null },
];

describe("findDuplicatePlayers", () => {
  it("flags exact email match (case-insensitive)", () => {
    const hits = findDuplicatePlayers(existing, { displayName: "R K", email: "RAVI@x.com" });
    expect(hits.map((h) => h.id)).toEqual(["a"]);
  });
  it("flags near-identical name (case/whitespace-insensitive)", () => {
    const hits = findDuplicatePlayers(existing, { displayName: "  ravi   kumar ", email: null });
    expect(hits.map((h) => h.id)).toEqual(["a"]);
  });
  it("returns empty when clearly new", () => {
    expect(findDuplicatePlayers(existing, { displayName: "Priya", email: "p@x.com" })).toEqual([]);
  });
});
