/**
 * Recompute every squad rating from scratch by replaying completed matches.
 *
 * Why this is needed: applySquadRatingForMatch used to abandon a whole match if
 * ANY of the four players lacked a groups/{groupId}/players doc. Session guests
 * always lack one, so a single guest silently cost the other three players their
 * rating, wins, losses and point difference for that match. The live code is
 * fixed, but every match already scored under the old behaviour is still wrong.
 *
 * Elo is order-dependent, so matches are replayed in the order they were played:
 * session startsAt, then roundNumber, then matchNumber.
 *
 * DRY RUN BY DEFAULT. Nothing is written unless you pass --apply.
 *
 *   npx tsx scripts/backfill-squad-ratings.ts                 # print the diff
 *   npx tsx scripts/backfill-squad-ratings.ts --apply         # write it
 *
 * Credentials, same as backfill-global-stats.ts:
 *   GOOGLE_APPLICATION_CREDENTIALS=... npx tsx scripts/backfill-squad-ratings.ts
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=... npx tsx ...
 *
 * Idempotent: it recomputes from zero every run rather than applying deltas, so
 * running it twice produces the same result.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
// Imported from source rather than the "@picklebaddies/domain" package name:
// the workspace root has no dependency on it, and adding one makes pnpm want to
// rebuild node_modules from scratch. tsx resolves the .js specifier to the .ts
// source, so this needs no build step. It is still the one real implementation —
// the replay must use exactly the same maths as submitScore, never a copy.
import {
  SQUAD_RATING_START,
  applyDoublesRatingResult,
  gradeFromSquadRating,
} from "../packages/domain/src/squad-rating.js";

const APPLY = process.argv.includes("--apply");

if (!getApps().length) {
  const projectId =
    process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_ADMIN_PROJECT_ID ?? undefined;
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS), projectId });
  } else {
    throw new Error("Set FIRESTORE_EMULATOR_HOST or GOOGLE_APPLICATION_CREDENTIALS");
  }
}

const db = getFirestore();

interface SquadStats {
  rating: number;
  gradedGames: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
}

function emptyStats(): SquadStats {
  return {
    rating: SQUAD_RATING_START,
    gradedGames: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDiff: 0,
  };
}

function millis(value: unknown): number {
  if (!value) return 0;
  const v = value as { toMillis?: () => number; toDate?: () => Date };
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  const parsed = new Date(value as string).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function teamIds(match: FirebaseFirestore.DocumentData, side: "A" | "B"): string[] {
  const direct = match[`team${side}Ids`];
  if (Array.isArray(direct) && direct.length) return direct;
  const objects = match[`team${side}`];
  if (Array.isArray(objects)) return objects.map((p: { playerId: string }) => p.playerId);
  return [];
}

async function run() {
  console.log(APPLY ? "APPLY MODE — changes will be written" : "DRY RUN — no writes");

  // Which players exist per squad. Guests and anyone without a squad player doc
  // still influence a match's difficulty at the neutral rating, but nothing is
  // stored for them — mirroring applySquadRatingForMatch.
  const knownBySquad = new Map<string, Set<string>>();
  const existingBySquad = new Map<string, Map<string, SquadStats>>();

  const groupsSnap = await db.collection("groups").get();
  for (const groupDoc of groupsSnap.docs) {
    const playersSnap = await db.collection(`groups/${groupDoc.id}/players`).get();
    const known = new Set<string>();
    const existing = new Map<string, SquadStats>();
    for (const p of playersSnap.docs) {
      known.add(p.id);
      const d = p.data();
      existing.set(p.id, {
        rating: Number(d.squadRating) || SQUAD_RATING_START,
        gradedGames: Number(d.squadGradedGames) || 0,
        wins: Number(d.squadWins) || 0,
        losses: Number(d.squadLosses) || 0,
        pointsFor: Number(d.squadPointsFor) || 0,
        pointsAgainst: Number(d.squadPointsAgainst) || 0,
        pointDiff: Number(d.squadPointDiff) || 0,
      });
    }
    knownBySquad.set(groupDoc.id, known);
    existingBySquad.set(groupDoc.id, existing);
  }
  console.log(`${groupsSnap.size} squads`);

  // Every completed match, ordered as played.
  const sessionsSnap = await db.collection("sessions").get();
  const sessions = sessionsSnap.docs
    .map((d) => ({ id: d.id, groupId: d.data().groupId as string, startsAt: millis(d.data().startsAt) }))
    .filter((s) => Boolean(s.groupId))
    .sort((a, b) => a.startsAt - b.startsAt);

  const computed = new Map<string, Map<string, SquadStats>>();
  const statsFor = (squadId: string, playerId: string): SquadStats => {
    let squad = computed.get(squadId);
    if (!squad) {
      squad = new Map();
      computed.set(squadId, squad);
    }
    let s = squad.get(playerId);
    if (!s) {
      s = emptyStats();
      squad.set(playerId, s);
    }
    return s;
  };

  let replayed = 0;
  let skippedNoSquadPlayers = 0;

  for (const session of sessions) {
    const matchesSnap = await db
      .collection(`sessions/${session.id}/matches`)
      .where("status", "==", "completed")
      .get();

    const matches = matchesSnap.docs
      .map((d) => d.data())
      .sort(
        (a, b) =>
          (Number(a.roundNumber) || 0) - (Number(b.roundNumber) || 0) ||
          (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0),
      );

    const known = knownBySquad.get(session.groupId) ?? new Set<string>();

    for (const match of matches) {
      const a = teamIds(match, "A");
      const b = teamIds(match, "B");
      if (a.length !== 2 || b.length !== 2) continue;

      const winnerTeam = match.winnerTeam as "A" | "B" | undefined;
      if (winnerTeam !== "A" && winnerTeam !== "B") continue;

      const ids = [...a, ...b];
      if (!ids.some((id) => known.has(id))) {
        skippedNoSquadPlayers++;
        continue;
      }

      // Unknown players contribute at the neutral rating but are never stored.
      const ratingOf = (id: string) =>
        known.has(id) ? statsFor(session.groupId, id).rating : SQUAD_RATING_START;

      const result = applyDoublesRatingResult({
        teamARatings: [ratingOf(a[0]!), ratingOf(a[1]!)],
        teamBRatings: [ratingOf(b[0]!), ratingOf(b[1]!)],
        winnerTeam,
      });
      const next = [...result.nextTeamARatings, ...result.nextTeamBRatings];

      const payload = match.scorePayload ?? {};
      const hasPoints =
        typeof payload.teamAScore === "number" && typeof payload.teamBScore === "number";

      ids.forEach((id, i) => {
        if (!known.has(id)) return;
        const isTeamA = i < 2;
        const s = statsFor(session.groupId, id);
        s.rating = next[i]!;
        s.gradedGames += 1;
        if (winnerTeam === (isTeamA ? "A" : "B")) s.wins += 1;
        else s.losses += 1;
        if (hasPoints) {
          const pf = isTeamA ? payload.teamAScore : payload.teamBScore;
          const pa = isTeamA ? payload.teamBScore : payload.teamAScore;
          s.pointsFor += pf;
          s.pointsAgainst += pa;
          s.pointDiff += pf - pa;
        }
      });

      replayed++;
    }
  }

  console.log(`replayed ${replayed} completed matches across ${sessions.length} sessions`);
  if (skippedNoSquadPlayers) {
    console.log(`skipped ${skippedNoSquadPlayers} matches with no squad players at all`);
  }

  // Report, then optionally write.
  let changed = 0;
  const writes: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }> = [];

  for (const [squadId, players] of computed) {
    const existing = existingBySquad.get(squadId) ?? new Map<string, SquadStats>();
    const lines: string[] = [];

    for (const [playerId, s] of players) {
      const before = existing.get(playerId) ?? emptyStats();
      const differs =
        before.rating !== s.rating ||
        before.gradedGames !== s.gradedGames ||
        before.wins !== s.wins ||
        before.losses !== s.losses ||
        before.pointDiff !== s.pointDiff;

      if (differs) {
        changed++;
        lines.push(
          `    ${playerId}  rating ${before.rating}→${s.rating}  ` +
            `grade ${gradeFromSquadRating(before.rating)}→${gradeFromSquadRating(s.rating)}  ` +
            `games ${before.gradedGames}→${s.gradedGames}  ` +
            `W/L ${before.wins}/${before.losses}→${s.wins}/${s.losses}  ` +
            `+/- ${before.pointDiff}→${s.pointDiff}`,
        );
      }

      writes.push({
        ref: db.doc(`groups/${squadId}/players/${playerId}`),
        data: {
          squadRating: s.rating,
          squadGrade: gradeFromSquadRating(s.rating),
          squadGradedGames: s.gradedGames,
          squadWins: s.wins,
          squadLosses: s.losses,
          squadPointsFor: s.pointsFor,
          squadPointsAgainst: s.pointsAgainst,
          squadPointDiff: s.pointDiff,
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
    }

    if (lines.length) {
      console.log(`\n  squad ${squadId}`);
      lines.forEach((l) => console.log(l));
    }
  }

  console.log(`\n${changed} player records would change; ${writes.length} total writes`);

  if (!APPLY) {
    console.log("\nDry run complete. Re-run with --apply to write these changes.");
    return;
  }

  let batch = db.batch();
  let pending = 0;
  for (const w of writes) {
    batch.set(w.ref, w.data, { merge: true });
    pending++;
    if (pending === 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending) await batch.commit();

  console.log(`Applied ${writes.length} writes.`);
}

run().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
