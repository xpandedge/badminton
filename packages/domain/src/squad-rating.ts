export const SQUAD_RATING_START = 1000;
export const SQUAD_RATING_K_FACTOR = 32;
export const SQUAD_RATING_PROVISIONAL_GAMES = 3;

export type SquadGrade = "A+" | "A" | "B+" | "B" | "C+" | "C" | "D+" | "D";

export interface DoublesRatingInput {
  teamARatings: [number, number];
  teamBRatings: [number, number];
  winnerTeam: "A" | "B";
}

export interface DoublesRatingResult {
  teamADelta: number;
  teamBDelta: number;
  nextTeamARatings: [number, number];
  nextTeamBRatings: [number, number];
}

function averagePair(values: [number, number]): number {
  return (values[0] + values[1]) / 2;
}

function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

export function gradeFromSquadRating(rating: number): SquadGrade {
  if (rating >= 1280) return "A+";
  if (rating >= 1200) return "A";
  if (rating >= 1120) return "B+";
  if (rating >= 1040) return "B";
  if (rating > SQUAD_RATING_START) return "C+";
  if (rating >= 920) return "C";
  if (rating >= 860) return "D+";
  return "D";
}

export function isSquadGradeProvisional(gradedGames: number): boolean {
  return gradedGames < SQUAD_RATING_PROVISIONAL_GAMES;
}

export function applyDoublesRatingResult(input: DoublesRatingInput): DoublesRatingResult {
  const teamA = averagePair(input.teamARatings);
  const teamB = averagePair(input.teamBRatings);
  const teamAScore = input.winnerTeam === "A" ? 1 : 0;
  const teamBScore = input.winnerTeam === "B" ? 1 : 0;
  const teamADelta = Math.round(SQUAD_RATING_K_FACTOR * (teamAScore - expectedScore(teamA, teamB)));
  const teamBDelta = Math.round(SQUAD_RATING_K_FACTOR * (teamBScore - expectedScore(teamB, teamA)));

  return {
    teamADelta,
    teamBDelta,
    nextTeamARatings: [input.teamARatings[0] + teamADelta, input.teamARatings[1] + teamADelta],
    nextTeamBRatings: [input.teamBRatings[0] + teamBDelta, input.teamBRatings[1] + teamBDelta],
  };
}
