// apps/web/src/lib/quick-sessions/queue.ts
import type { GeneratedMatch } from "@picklebaddies/match-engine";
import type { QuickScore } from "./types";
import { computeMatchKey } from "./score";

export type MatchState = "done" | "live" | "up_next";

export function computeMatchStates(
  matches: GeneratedMatch[],
  scores: Record<string, QuickScore>,
  courts: number
): Map<string, MatchState> {
  const sorted = [...matches].sort((a, b) =>
    a.roundNumber !== b.roundNumber ? a.roundNumber - b.roundNumber : a.matchNumber - b.matchNumber
  );

  const result = new Map<string, MatchState>();
  let liveCount = 0;

  for (const m of sorted) {
    const key = computeMatchKey(m.roundNumber, m.courtId);
    if (scores[key] !== undefined) {
      result.set(key, "done");
    } else if (liveCount < courts) {
      result.set(key, "live");
      liveCount++;
    } else {
      result.set(key, "up_next");
    }
  }

  return result;
}
