import type { ScoringMode } from "./scoring.js";

export type Sport = "badminton" | "pickleball";

export interface SportConfig {
  label: string;
  defaultScoringMode: ScoringMode;
  defaultTargetScore: number;
  terms: {
    game: string;
    court: string;
  };
}

export const SPORTS: Record<Sport, SportConfig> = {
  badminton: {
    label: "Badminton",
    defaultScoringMode: "points",
    defaultTargetScore: 21,
    terms: { game: "game", court: "court" },
  },
  pickleball: {
    label: "Pickleball",
    defaultScoringMode: "points",
    defaultTargetScore: 11,
    terms: { game: "game", court: "court" },
  },
};

export function getSportConfig(sport: Sport): SportConfig {
  return SPORTS[sport];
}
