export type SessionFormat = "social_rotation" | "fixed_pair_round_robin";

export interface FixedPairRoundRobinTeam {
  teamId: string;
  displayName: string;
  playerIds: [string, string] | string[];
}

export interface GenerateFixedPairRoundRobinInput {
  teams: FixedPairRoundRobinTeam[];
  courtCount: number;
}

export interface FixedPairRoundRobinMatch {
  roundNumber: number;
  matchNumber: number;
  courtIndex: number;
  teamAId: string;
  teamBId: string;
}

export interface FixedPairRoundRobinBye {
  roundNumber: number;
  teamId: string;
}

export interface FixedPairRoundRobinSchedule {
  matches: FixedPairRoundRobinMatch[];
  byes: FixedPairRoundRobinBye[];
  totalRounds: number;
}

const BYE = "__duorally_bye__";

export function generateFixedPairRoundRobin(
  input: GenerateFixedPairRoundRobinInput,
): FixedPairRoundRobinSchedule {
  const courtCount = Math.trunc(input.courtCount);
  if (!Number.isFinite(courtCount) || courtCount < 1) {
    throw new Error("courtCount must be at least 1");
  }
  if (input.teams.length < 2) {
    throw new Error("At least 2 teams are required");
  }

  const teamIds = input.teams.map((team) => team.teamId.trim()).filter(Boolean);
  if (teamIds.length !== input.teams.length) {
    throw new Error("Every team must have a teamId");
  }
  if (new Set(teamIds).size !== teamIds.length) {
    throw new Error("Team ids must be unique");
  }
  for (const team of input.teams) {
    if (team.playerIds.length !== 2) {
      throw new Error("Every fixed-pair round robin team must have exactly 2 players");
    }
    if (new Set(team.playerIds).size !== 2) {
      throw new Error("Every fixed-pair round robin team must use 2 unique players");
    }
  }

  let rotation = teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, BYE];
  const logicalRoundCount = rotation.length - 1;
  const matches: FixedPairRoundRobinMatch[] = [];
  const byes: FixedPairRoundRobinBye[] = [];
  let displayRoundNumber = 1;

  for (let logicalRound = 0; logicalRound < logicalRoundCount; logicalRound++) {
    const logicalMatches: Array<{ teamAId: string; teamBId: string }> = [];
    const roundStart = displayRoundNumber;

    for (let i = 0; i < rotation.length / 2; i++) {
      const left = rotation[i]!;
      const right = rotation[rotation.length - 1 - i]!;
      if (left === BYE || right === BYE) {
        byes.push({ roundNumber: roundStart, teamId: left === BYE ? right : left });
      } else {
        logicalMatches.push({ teamAId: left, teamBId: right });
      }
    }

    for (let i = 0; i < logicalMatches.length; i += courtCount) {
      const wave = logicalMatches.slice(i, i + courtCount);
      wave.forEach((match, index) => {
        matches.push({
          ...match,
          roundNumber: displayRoundNumber,
          matchNumber: index + 1,
          courtIndex: index,
        });
      });
      displayRoundNumber++;
    }

    rotation = [rotation[0]!, rotation[rotation.length - 1]!, ...rotation.slice(1, -1)];
  }

  return {
    matches,
    byes,
    totalRounds: Math.max(0, displayRoundNumber - 1),
  };
}
