import { describe, it, expect } from "vitest";
import { swapPlayersInRound } from "./round-edit";
import type { GeneratedMatch, GeneratedSitOut } from "@picklebaddies/match-engine";

const match = (courtId: string, a: [string, string], b: [string, string]): GeneratedMatch => ({
  roundNumber: 1, courtId, matchNumber: 1, teamA: a, teamB: b,
});
const sitout = (id: string): GeneratedSitOut => ({ roundNumber: 1, playerId: id, reason: "rotation" });

describe("swapPlayersInRound", () => {
  it("swaps two players on different teams in the same match", () => {
    const { matches } = swapPlayersInRound(
      [match("court-1", ["A", "B"], ["C", "D"])],
      [],
      "A", "C"
    );
    expect(matches[0]!.teamA).toEqual(["C", "B"]);
    expect(matches[0]!.teamB).toEqual(["A", "D"]);
  });

  it("swaps two players on the same team", () => {
    const { matches } = swapPlayersInRound(
      [match("court-1", ["A", "B"], ["C", "D"])],
      [],
      "A", "B"
    );
    expect(matches[0]!.teamA).toEqual(["B", "A"]);
    expect(matches[0]!.teamB).toEqual(["C", "D"]);
  });

  it("swaps a court player with a bench player", () => {
    const { matches, sitOuts } = swapPlayersInRound(
      [match("court-1", ["A", "B"], ["C", "D"])],
      [sitout("E")],
      "A", "E"
    );
    expect(matches[0]!.teamA).toEqual(["E", "B"]);
    expect(sitOuts[0]!.playerId).toBe("A");
  });

  it("swaps two bench players", () => {
    const { sitOuts } = swapPlayersInRound(
      [match("court-1", ["A", "B"], ["C", "D"])],
      [sitout("E"), sitout("F")],
      "E", "F"
    );
    expect(sitOuts[0]!.playerId).toBe("F");
    expect(sitOuts[1]!.playerId).toBe("E");
  });

  it("swaps players across two different courts", () => {
    const { matches } = swapPlayersInRound(
      [
        match("court-1", ["A", "B"], ["C", "D"]),
        match("court-2", ["E", "F"], ["G", "H"]),
      ],
      [],
      "B", "G"
    );
    expect(matches[0]!.teamA).toEqual(["A", "G"]);
    expect(matches[1]!.teamB).toEqual(["B", "H"]);
  });

  it("is a no-op if a player id is not found in the round", () => {
    const matches = [match("court-1", ["A", "B"], ["C", "D"])];
    const result = swapPlayersInRound(matches, [], "A", "UNKNOWN");
    expect(result.matches[0]!.teamA).toEqual(["A", "B"]);
    expect(result.matches[0]!.teamB).toEqual(["C", "D"]);
  });

  it("does not mutate the original arrays", () => {
    const origMatches = [match("court-1", ["A", "B"], ["C", "D"])];
    const origSitOuts = [sitout("E")];
    swapPlayersInRound(origMatches, origSitOuts, "A", "E");
    expect(origMatches[0]!.teamA).toEqual(["A", "B"]);
    expect(origSitOuts[0]!.playerId).toBe("E");
  });
});
