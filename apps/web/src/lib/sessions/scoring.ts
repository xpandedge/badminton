import { submitScore, completeMatchWithoutScore } from "@/server/sessions/score";
import type { ScorePayload } from "@picklebaddies/domain";
import { logEvent } from "@/lib/analytics/events";

export async function enterScore(sessionId: string, matchId: string, payload: ScorePayload) {
  const result = await submitScore({ sessionId, matchId, payload });
  if (!result.ok) throw new Error(result.message);
  void logEvent("score_entered", { sessionId, matchId });
}

export async function finishGameWithoutScore(sessionId: string, matchId: string) {
  const result = await completeMatchWithoutScore({ sessionId, matchId });
  if (!result.ok) throw new Error(result.message);
  void logEvent("game_finished_no_score", { sessionId, matchId });
}
