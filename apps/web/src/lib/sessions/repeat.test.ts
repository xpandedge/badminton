import { describe, expect, it } from "vitest";
import { selectRepeatPlayers } from "./repeat";

describe("selectRepeatPlayers", () => {
  it("keeps selected registered players and resets their session stats", () => {
    expect(selectRepeatPlayers([
      { playerId: "a", displayName: "Ava", skillLevel: "3", status: "active", participantType: "registered_user", squadRating: 4 },
      { playerId: "b", displayName: "Ben", skillLevel: "2", status: "active", participantType: "registered_user" },
    ], ["a"])).toEqual([
      { playerId: "a", displayName: "Ava", skillLevel: "3", squadRating: 4 },
    ]);
  });

  it("never carries guests or removed players into a repeat", () => {
    expect(selectRepeatPlayers([
      { playerId: "guest", displayName: "Guest", status: "active", participantType: "guest" },
      { playerId: "gone", displayName: "Gone", status: "removed", participantType: "registered_user" },
    ], ["guest", "gone"])).toEqual([]);
  });
});
