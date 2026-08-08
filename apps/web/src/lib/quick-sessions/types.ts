// apps/web/src/lib/quick-sessions/types.ts
import type { GeneratedMatch, GeneratedSitOut, SkillLevel } from "@picklebaddies/match-engine";

export type { SkillLevel };

export interface QuickPlayer {
  id: string;
  name: string;
  skillLevel: SkillLevel;
}

export interface PlayerStats {
  totalGames: number;
  totalSitOuts: number;
  sessionsPlayed: number;
  partnerCounts: Record<string, number>;
  opponentCounts: Record<string, number>;
  lastPlayedAt: number;
}

export interface RosterPlayer extends QuickPlayer {
  stats: PlayerStats;
}

export interface QuickSessionSetup {
  name: string;
  courts: number;
  rounds: number;
}

export interface QuickScore {
  teamAScore: number;
  teamBScore: number;
}

export interface QuickSession {
  id: string;
  name: string;
  courts: number;
  players: QuickPlayer[];
  matches: GeneratedMatch[];
  sitOuts: GeneratedSitOut[];
  scores: Record<string, QuickScore>;
  createdAt: number;
  ownerUid?: string;
  rosterPlayerIds?: string[];
  statsCommitted?: boolean;
}

export type RoundStatus = "done" | "playing" | "up_next";
