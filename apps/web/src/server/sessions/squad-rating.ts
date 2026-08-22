import "server-only";

import type { Firestore, Transaction } from "firebase-admin/firestore";
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
