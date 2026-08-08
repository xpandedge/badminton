import type { EngineInput, EnginePlayer, EngineCourt, LockedMatch, GenerationMode } from "@picklebaddies/match-engine";
import { isSchedulable } from "@picklebaddies/domain";

export function mapSessionToEngineInput(
  session: any,
  players: any[],
  rounds: any[],
  matches: any[],
  mode: GenerationMode
): EngineInput {
  const enginePlayers: EnginePlayer[] = players
    .filter((p) => isSchedulable(p.status))
    .map((p) => ({
      playerId: p.id || p.playerId,
      displayName: p.displayName,
      skillLevel: p.skillLevel || "unknown",
      // Late joiners have availableFromRound > 1 (DELTA_SPEC D7 / PRD §23)
      availableFromRound: mode === "rebalance" ? (p.availableFromRound || 1) : 1,
    }));

  const engineCourts: EngineCourt[] = (session.courts || [])
    .filter((c: any) => c.isActive)
    .map((c: any) => ({
      courtId: c.courtId || c.id,
      name: c.name,
      courtNumber: c.courtNumber,
    }));

  const elapsedRounds = rounds.filter((r) => r.status === "completed" || r.status === "in_progress").length;

  const lockedMatches: LockedMatch[] = matches
    .filter((m) => m.isLocked)
    .map((m) => ({
      roundNumber: m.roundNumber,
      courtId: m.courtId,
      teamA: m.teamAIds || [m.teamA[0]?.playerId, m.teamA[1]?.playerId],
      teamB: m.teamBIds || [m.teamB[0]?.playerId, m.teamB[1]?.playerId],
    }));

  return {
    mode,
    players: enginePlayers,
    courts: engineCourts,
    sessionDurationMinutes: session.durationMinutes || 60,
    estimatedGameMinutes: session.estimatedGameMinutes || 15,
    elapsedRounds,
    lockedMatches,
  };
}
