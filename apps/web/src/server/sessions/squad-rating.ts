import "server-only";

import type { Firestore, Transaction } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import {
  SQUAD_RATING_START,
  applyDoublesRatingResult,
  gradeFromSquadRating,
  type ScorePayload,
} from "@picklebaddies/domain";

export interface SquadRatingMatchInput {
  groupId: string;
  teamAIds: [string, string];
  teamBIds: [string, string];
  winnerTeam: "A" | "B";
  payload: ScorePayload;
}

function numericStat(data: FirebaseFirestore.DocumentData | undefined, field: string): number {
  const value = Number(data?.[field]);
  return Number.isFinite(value) ? value : 0;
}

function baseRating(data: FirebaseFirestore.DocumentData | undefined): number {
  const value = Number(data?.squadRating);
  return Number.isFinite(value) && value > 0 ? value : SQUAD_RATING_START;
}

function pointStatsForPlayer(isTeamA: boolean, payload: ScorePayload): { for: number; against: number; diff: number } {
  if (!("teamAScore" in payload)) return { for: 0, against: 0, diff: 0 };

  const pointsFor = isTeamA ? payload.teamAScore : payload.teamBScore;
  const pointsAgainst = isTeamA ? payload.teamBScore : payload.teamAScore;
  return { for: pointsFor, against: pointsAgainst, diff: pointsFor - pointsAgainst };
}

function matchPlayerIds(match: FirebaseFirestore.DocumentData): {
  teamAIds: string[];
  teamBIds: string[];
} | null {
  const teamAIds = Array.isArray(match.teamAIds)
    ? match.teamAIds
    : Array.isArray(match.teamA)
      ? match.teamA.map((player: { playerId?: string }) => player.playerId)
      : [];
  const teamBIds = Array.isArray(match.teamBIds)
    ? match.teamBIds
    : Array.isArray(match.teamB)
      ? match.teamB.map((player: { playerId?: string }) => player.playerId)
      : [];
  if (
    teamAIds.length !== 2 ||
    teamBIds.length !== 2 ||
    [...teamAIds, ...teamBIds].some((playerId) => typeof playerId !== "string" || !playerId)
  ) {
    return null;
  }
  return { teamAIds, teamBIds };
}

function timestampMillis(value: unknown): number {
  if (value && typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof value === "number") return value;
  return 0;
}

/**
 * Applies any older scored matches that were written before squad-rating
 * updates were enabled. The per-match marker makes retries safe and keeps
 * normal score submission from being counted again at session completion.
 */
export async function reconcileSquadRatingsForSession(
  db: Firestore,
  sessionId: string,
): Promise<{ matchesApplied: number; playersUpdated: number }> {
  return db.runTransaction(async (t) => {
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const sessionSnap = await t.get(sessionRef);
    if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });

    const matchSnap = await t.get(
      db.collection(`sessions/${sessionId}/matches`).where("status", "==", "completed"),
    );
    const pendingMatches = matchSnap.docs
      .map((doc) => ({ doc, ids: matchPlayerIds(doc.data()) }))
      .filter((item) => item.ids && item.doc.data().winnerTeam && !item.doc.data().squadRatingAppliedAt)
      .sort((a, b) => {
        const roundDelta = Number(a.doc.data().roundNumber ?? 0) - Number(b.doc.data().roundNumber ?? 0);
        if (roundDelta !== 0) return roundDelta;
        return timestampMillis(a.doc.data().completedAt) - timestampMillis(b.doc.data().completedAt);
      });

    if (pendingMatches.length === 0) return { matchesApplied: 0, playersUpdated: 0 };

    const playerIds = [...new Set(pendingMatches.flatMap((item) => [
      ...item.ids!.teamAIds,
      ...item.ids!.teamBIds,
    ]))];
    const playerRefs = playerIds.map((playerId) => db.doc(`groups/${sessionSnap.data()!.groupId}/players/${playerId}`));
    const playerDocs = await Promise.all(playerRefs.map((ref) => t.get(ref)));
    const states = new Map(playerIds.map((playerId, index) => {
      const doc = playerDocs[index]!;
      const data = doc.data() ?? {};
      return [playerId, {
        ref: playerRefs[index]!,
        exists: doc.exists,
        data,
        rating: baseRating(data),
        gradedGames: numericStat(data, "squadGradedGames"),
        wins: numericStat(data, "squadWins"),
        losses: numericStat(data, "squadLosses"),
        pointsFor: numericStat(data, "squadPointsFor"),
        pointsAgainst: numericStat(data, "squadPointsAgainst"),
        pointDiff: numericStat(data, "squadPointDiff"),
      }];
    }));

    const changedPlayers = new Set<string>();
    for (const pending of pendingMatches) {
      const { teamAIds, teamBIds } = pending.ids!;
      const winnerTeam = pending.doc.data().winnerTeam as "A" | "B";
      const ratings = [...teamAIds, ...teamBIds].map((playerId) => states.get(playerId)?.rating ?? SQUAD_RATING_START);
      const result = applyDoublesRatingResult({
        teamARatings: [ratings[0]!, ratings[1]!],
        teamBRatings: [ratings[2]!, ratings[3]!],
        winnerTeam,
      });
      const nextRatings = [...result.nextTeamARatings, ...result.nextTeamBRatings];
      const payload = pending.doc.data().scorePayload as ScorePayload | undefined;

      for (let i = 0; i < 4; i++) {
        const playerId = [...teamAIds, ...teamBIds][i]!;
        const state = states.get(playerId);
        if (!state?.exists) continue;
        const isTeamA = i < 2;
        const isWinner = winnerTeam === (isTeamA ? "A" : "B");
        const points = payload ? pointStatsForPlayer(isTeamA, payload) : { for: 0, against: 0, diff: 0 };
        state.rating = nextRatings[i]!;
        state.gradedGames += 1;
        state.wins += isWinner ? 1 : 0;
        state.losses += isWinner ? 0 : 1;
        state.pointsFor += points.for;
        state.pointsAgainst += points.against;
        state.pointDiff += points.diff;
        changedPlayers.add(playerId);
      }
    }

    for (const playerId of changedPlayers) {
      const state = states.get(playerId)!;
      t.update(state.ref, {
        squadRating: state.rating,
        squadGrade: gradeFromSquadRating(state.rating),
        squadGradedGames: state.gradedGames,
        squadWins: state.wins,
        squadLosses: state.losses,
        squadPointsFor: state.pointsFor,
        squadPointsAgainst: state.pointsAgainst,
        squadPointDiff: state.pointDiff,
      });
    }
    for (const pending of pendingMatches) {
      t.update(pending.doc.ref, { squadRatingAppliedAt: FieldValue.serverTimestamp() });
    }

    return { matchesApplied: pendingMatches.length, playersUpdated: changedPlayers.size };
  });
}

export async function applySquadRatingForMatch(
  t: Transaction,
  db: Firestore,
  input: SquadRatingMatchInput,
): Promise<void> {
  const allPlayerIds = [...input.teamAIds, ...input.teamBIds];
  const playerRefs = allPlayerIds.map((playerId) => db.doc(`groups/${input.groupId}/players/${playerId}`));
  const playerDocs = await Promise.all(playerRefs.map((ref) => t.get(ref)));

  // Session guests have an auto-generated session-player id with no
  // groups/{groupId}/players counterpart. They still count toward the match's
  // difficulty at the neutral starting rating, but nothing is stored for them.
  // Their presence must never cost the other players their rating for the match.
  if (playerDocs.every((doc) => !doc.exists)) return;

  const ratings = playerDocs.map((doc) => baseRating(doc.data()));
  const ratingResult = applyDoublesRatingResult({
    teamARatings: [ratings[0]!, ratings[1]!],
    teamBRatings: [ratings[2]!, ratings[3]!],
    winnerTeam: input.winnerTeam,
  });
  const nextRatings = [...ratingResult.nextTeamARatings, ...ratingResult.nextTeamBRatings];

  for (let i = 0; i < playerRefs.length; i++) {
    if (!playerDocs[i]!.exists) continue;
    const isTeamA = i < 2;
    const isWinner = input.winnerTeam === (isTeamA ? "A" : "B");
    const data = playerDocs[i]!.data();
    const points = pointStatsForPlayer(isTeamA, input.payload);
    const nextRating = nextRatings[i]!;

    t.update(playerRefs[i]!, {
      squadRating: nextRating,
      squadGrade: gradeFromSquadRating(nextRating),
      squadGradedGames: numericStat(data, "squadGradedGames") + 1,
      squadWins: numericStat(data, "squadWins") + (isWinner ? 1 : 0),
      squadLosses: numericStat(data, "squadLosses") + (isWinner ? 0 : 1),
      squadPointsFor: numericStat(data, "squadPointsFor") + points.for,
      squadPointsAgainst: numericStat(data, "squadPointsAgainst") + points.against,
      squadPointDiff: numericStat(data, "squadPointDiff") + points.diff,
    });
  }
}
