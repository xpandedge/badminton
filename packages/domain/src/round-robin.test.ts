import { describe, expect, it } from "vitest";
import { generateFixedPairRoundRobin, type FixedPairRoundRobinTeam } from "./round-robin.js";

const teams = (count: number): FixedPairRoundRobinTeam[] =>
  Array.from({ length: count }, (_, index) => ({
    teamId: `team_${index + 1}`,
    displayName: `Team ${index + 1}`,
    playerIds: [`p${index + 1}a`, `p${index + 1}b`],
  }));

function matchupKey(teamAId: string, teamBId: string): string {
  return [teamAId, teamBId].sort().join(":");
}

describe("generateFixedPairRoundRobin", () => {
  it("schedules four teams on two courts as six matches across three rounds", () => {
    const schedule = generateFixedPairRoundRobin({ teams: teams(4), courtCount: 2 });

    expect(schedule.matches).toHaveLength(6);
    expect(schedule.totalRounds).toBe(3);
    expect(schedule.byes).toHaveLength(0);

    const keys = new Set(schedule.matches.map((match) => matchupKey(match.teamAId, match.teamBId)));
    expect(keys.size).toBe(6);
    expect(keys).toEqual(new Set([
      "team_1:team_4",
      "team_2:team_3",
      "team_1:team_3",
      "team_2:team_4",
      "team_1:team_2",
      "team_3:team_4",
    ]));
  });

  it("chunks six teams across two courts without repeating a team in a display round", () => {
    const schedule = generateFixedPairRoundRobin({ teams: teams(6), courtCount: 2 });

    expect(schedule.matches).toHaveLength(15);
    expect(schedule.totalRounds).toBe(10);

    const keys = new Set(schedule.matches.map((match) => matchupKey(match.teamAId, match.teamBId)));
    expect(keys.size).toBe(15);

    for (let roundNumber = 1; roundNumber <= schedule.totalRounds; roundNumber++) {
      const roundMatches = schedule.matches.filter((match) => match.roundNumber === roundNumber);
      expect(roundMatches.length).toBeLessThanOrEqual(2);
      const seen = new Set<string>();
      for (const match of roundMatches) {
        expect(seen.has(match.teamAId)).toBe(false);
        expect(seen.has(match.teamBId)).toBe(false);
        seen.add(match.teamAId);
        seen.add(match.teamBId);
      }
    }
  });

  it("records byes for odd team counts while still scheduling every matchup once", () => {
    const schedule = generateFixedPairRoundRobin({ teams: teams(5), courtCount: 2 });

    expect(schedule.matches).toHaveLength(10);
    expect(schedule.byes).toHaveLength(5);

    const keys = new Set(schedule.matches.map((match) => matchupKey(match.teamAId, match.teamBId)));
    expect(keys.size).toBe(10);
    expect(new Set(schedule.byes.map((bye) => bye.teamId))).toEqual(
      new Set(["team_1", "team_2", "team_3", "team_4", "team_5"]),
    );
  });

  it("rejects duplicate team ids and invalid court counts", () => {
    expect(() => generateFixedPairRoundRobin({ teams: teams(2), courtCount: 0 })).toThrow("courtCount");
    expect(() => generateFixedPairRoundRobin({
      teams: [
        { teamId: "team_1", displayName: "One", playerIds: ["a"] },
        { teamId: "team_2", displayName: "Two", playerIds: ["c", "d"] },
      ],
      courtCount: 1,
    })).toThrow("exactly 2 players");
    expect(() => generateFixedPairRoundRobin({
      teams: [
        { teamId: "same", displayName: "One", playerIds: ["a", "b"] },
        { teamId: "same", displayName: "Two", playerIds: ["c", "d"] },
      ],
      courtCount: 1,
    })).toThrow("unique");
  });
});
