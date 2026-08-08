import { submitScore, completeMatchWithoutScore } from "@/server/sessions/score";
import type { ScorePayload } from "@picklebaddies/domain";
import { logEvent } from "@/lib/analytics/events";

export async function enterScore(sessionId: string, roundNumber: number, matchId: string, payload: ScorePayload) {
  const result = await submitScore({ sessionId, roundNumber, matchId, payload });
  if (!result.ok) throw new Error(result.message);
  void logEvent("score_entered", { sessionId, roundNumber });
}

export async function finishGameWithoutScore(sessionId: string, roundNumber: number, matchId: string) {
  const result = await completeMatchWithoutScore({ sessionId, roundNumber, matchId });
  if (!result.ok) throw new Error(result.message);
  void logEvent("game_finished_no_score", { sessionId, roundNumber });
}
