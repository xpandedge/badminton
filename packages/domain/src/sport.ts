import type { ScoringMode } from "./scoring.js";

export interface SportConfig {
  label: string;
  defaultScoringMode: ScoringMode;
  defaultTargetScore: number;
  terms: {
    game: string;
    court: string;
  };
}

export const SPORTS = {
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
  squash: {
    label: "Squash",
    defaultScoringMode: "points",
    defaultTargetScore: 11,
    terms: { game: "game", court: "court" },
  },
  table_tennis: {
    label: "Table tennis",
    defaultScoringMode: "points",
    defaultTargetScore: 11,
    terms: { game: "game", court: "table" },
  },
  tennis: {
    label: "Tennis",
    defaultScoringMode: "points",
    defaultTargetScore: 6,
    terms: { game: "game", court: "court" },
  },
} as const satisfies Record<string, SportConfig>;

export type Sport = keyof typeof SPORTS;

export const SPORT_OPTIONS = Object.keys(SPORTS) as Sport[];

export function isSport(value: string): value is Sport {
  return Object.prototype.hasOwnProperty.call(SPORTS, value);
}

export function getSportConfig(sport: Sport): SportConfig {
  return SPORTS[sport];
}
