import { httpsCallable } from "firebase/functions";
import { getFirebaseServices } from "@/lib/firebase/client";
import type { ScorePayload } from "@picklebaddies/domain";

export interface ScoreLinkCourtMatch {
  matchId: string;
  teamA: Array<{ playerId: string; displayName: string }>;
  teamB: Array<{ playerId: string; displayName: string }>;
  status: string;
}

export interface ScoreLinkCourt {
  courtId: string;
  courtName: string;
  match: ScoreLinkCourtMatch | null;
}

export interface ScoreLinkData {
  sessionId: string;
  sessionName: string;
  sport: "badminton" | "pickleball";
  scoringMode: "winner_only" | "points";
  currentRoundNumber: number;
  sessionStatus: string;
  courts: ScoreLinkCourt[];
}

export async function getScoreLinkData(scoreCode: string): Promise<ScoreLinkData> {
  const { functions } = getFirebaseServices();
  const fn = httpsCallable<{ scoreCode: string }, ScoreLinkData>(functions, "getScoreLinkData");
  const result = await fn({ scoreCode });
  return result.data;
}

export async function submitScoreByLink(
  scoreCode: string,
  courtId: string,
  payload: ScorePayload,
): Promise<{ success: boolean; courtName: string; winnerTeam: "A" | "B" }> {
  const { functions } = getFirebaseServices();
  const fn = httpsCallable<
    { scoreCode: string; courtId: string; payload: ScorePayload },
    { success: boolean; courtName: string; winnerTeam: "A" | "B" }
  >(functions, "submitScoreByLink");
  const result = await fn({ scoreCode, courtId, payload });
  return result.data;
}