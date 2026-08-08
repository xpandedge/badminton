import { submitScore } from "@/server/sessions/score";
import type { ScorePayload } from "@picklebaddies/domain";
import { logEvent } from "@/lib/analytics/events";

export async function enterScore(sessionId: string, roundNumber: number, matchId: string, payload: ScorePayload) {
  const result = await submitScore({ sessionId, roundNumber, matchId, payload });
  if (!result.ok) throw new Error(result.message);
  void logEvent("score_entered", { sessionId, roundNumber });
}
