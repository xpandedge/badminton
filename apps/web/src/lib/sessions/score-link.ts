import type { ScorePayload } from "@picklebaddies/domain";
import {
  getScoreLinkData as serverGetScoreLinkData,
  submitScoreByLink as serverSubmitScoreByLink,
  type ScoreLinkData,
  type ScoreLinkCourt,
  type ScoreLinkCourtMatch,
} from "@/server/sessions/score-link";

export type { ScoreLinkData, ScoreLinkCourt, ScoreLinkCourtMatch };

export async function getScoreLinkData(scoreCode: string): Promise<ScoreLinkData> {
  const result = await serverGetScoreLinkData(scoreCode);
  if (!result.ok) throw new Error(result.message);
  return result.data;
}

export async function submitScoreByLink(
  scoreCode: string,
  courtId: string,
  payload: ScorePayload,
): Promise<{ success: boolean; courtName: string; winnerTeam: "A" | "B" }> {
  const result = await serverSubmitScoreByLink(scoreCode, courtId, payload);
  if (!result.ok) throw new Error(result.message);
  return { success: true, ...result.data };
}
