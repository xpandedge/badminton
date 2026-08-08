import type { LockedMatch } from "@picklebaddies/match-engine";
import { type ScoringMode } from "@picklebaddies/domain";
export interface LockedMatchFull extends LockedMatch {
    matchId: string;
    status: "completed" | "in_progress";
    scorePayload?: any;
    winnerTeam?: "A" | "B";
    teamAIds: [string, string];
    teamBIds: [string, string];
}
export interface LockedCounts {
    completed: number;
    inProgress: number;
}
export interface CollectLockedResult {
    lockedMatches: LockedMatch[];
    lockedFull: LockedMatchFull[];
    counts: LockedCounts;
}
/** PRD §14.9 step 1–2: collect all completed + in_progress matches as locked constraints. */
export declare function collectLockedMatches(sessionId: string): Promise<CollectLockedResult>;
export interface PlayerStats {
    gamesPlayed: number;
    wins: number;
    losses: number;
    pointsFor: number;
    pointsAgainst: number;
    pointDifference: number;
    sitOutCount: number;
}
/** PRD §14.9 step 3: recompute per-player stats from completed matches only. */
export declare function recomputeStatsFromLocked(lockedFull: LockedMatchFull[], scoringMode: ScoringMode): Map<string, PlayerStats>;
