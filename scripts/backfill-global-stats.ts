/**
 * Backfill global players/{uid} stats from completed matches in all sessions.
 *
 * Run once after deploying Tasks 5.1–5.3:
 *   GOOGLE_APPLICATION_CREDENTIALS=... ts-node scripts/backfill-global-stats.ts
 * Or against the emulator:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=picklebaddies \
 *     ts-node scripts/backfill-global-stats.ts
 *
 * Idempotent: re-running recomputes stats from scratch (full recount, not delta).
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Init admin
if (!getApps().length) {
  const projectId = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? "picklebaddies";
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) });
  } else {
    throw new Error("Set FIRESTORE_EMULATOR_HOST or GOOGLE_APPLICATION_CREDENTIALS");
  }
}

const db = getFirestore();

interface PlayerStats {
  totalGames: number;
  totalWins: number;
  totalLosses: number;
  totalPointsFor: number;
  totalPointsAgainst: number;
  totalPointDiff: number;
  totalSessions: Set<string>;
  displayName: string;
  isGuest: boolean;
  lastPlayedAt: FirebaseFirestore.Timestamp | null;
}

async function run() {
  console.log("Starting global stats backfill…");

  const globalStats = new Map<string, PlayerStats>();

  const sessionsSnap = await db.collection("sessions").get();
  console.log(`Found ${sessionsSnap.size} sessions`);

  for (const sessionDoc of sessionsSnap.docs) {
    const sessionId = sessionDoc.id;
    const session = sessionDoc.data();

    // Collect all completed matches across all rounds
    const roundsSnap = await db.collection(`sessions/${sessionId}/rounds`).get();
    for (const roundDoc of roundsSnap.docs) {
      const matchesSnap = await db
        .collection(`sessions/${sessionId}/rounds/${roundDoc.id}/matches`)
        .where("status", "==", "completed")
        .get();

      for (const matchDoc of matchesSnap.docs) {
        const match = matchDoc.data();
        const teamAIds: string[] = match.teamAIds ?? match.teamA?.map((p: any) => p.playerId) ?? [];
        const teamBIds: string[] = match.teamBIds ?? match.teamB?.map((p: any) => p.playerId) ?? [];

        let winnerTeam: "A" | "B" | null = match.winnerTeam ?? null;
        if (!winnerTeam && match.scorePayload) {
          const p = match.scorePayload;
          if (typeof p.teamAScore === "number" && typeof p.teamBScore === "number") {
            winnerTeam = p.teamAScore > p.teamBScore ? "A" : p.teamBScore > p.teamAScore ? "B" : null;
          } else if (p.winnerTeam === "A" || p.winnerTeam === "B") {
            winnerTeam = p.winnerTeam;
          }
        }

        const completedAt: FirebaseFirestore.Timestamp | null = match.completedAt ?? null;

        const processTeam = (ids: string[], team: "A" | "B", teamPlayers: any[]) => {
          for (let i = 0; i < ids.length; i++) {
            const pid = ids[i]!;
            if (!globalStats.has(pid)) {
              globalStats.set(pid, {
                totalGames: 0, totalWins: 0, totalLosses: 0,
                totalPointsFor: 0, totalPointsAgainst: 0, totalPointDiff: 0,
                totalSessions: new Set(),
                displayName: teamPlayers[i]?.displayName ?? "Unknown",
                isGuest: pid.startsWith("guest_"),
                lastPlayedAt: null,
              });
            }
            const s = globalStats.get(pid)!;
            s.totalGames += 1;
            s.totalSessions.add(sessionId);

            if (winnerTeam === team) s.totalWins += 1;
            else if (winnerTeam !== null) s.totalLosses += 1;

            if (match.scorePayload && typeof match.scorePayload.teamAScore === "number") {
              const pf = team === "A" ? match.scorePayload.teamAScore : match.scorePayload.teamBScore;
              const pa = team === "A" ? match.scorePayload.teamBScore : match.scorePayload.teamAScore;
              s.totalPointsFor += pf;
              s.totalPointsAgainst += pa;
              s.totalPointDiff += pf - pa;
            }

            if (completedAt && (!s.lastPlayedAt || completedAt.toMillis() > s.lastPlayedAt.toMillis())) {
              s.lastPlayedAt = completedAt;
            }

            // Keep most recent displayName
            if (teamPlayers[i]?.displayName) s.displayName = teamPlayers[i].displayName;
          }
        };

        processTeam(teamAIds, "A", match.teamA ?? []);
        processTeam(teamBIds, "B", match.teamB ?? []);
      }
    }
  }

  console.log(`Computed stats for ${globalStats.size} players`);

  // Write in batches of 400
  const entries = Array.from(globalStats.entries());
  let written = 0;
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    for (const [pid, stats] of entries.slice(i, i + 400)) {
      const ref = db.doc(`players/${pid}`);
      batch.set(
        ref,
        {
          uid: pid,
          displayName: stats.displayName,
          isGuest: stats.isGuest,
          totalGames: stats.totalGames,
          totalWins: stats.totalWins,
          totalLosses: stats.totalLosses,
          totalPointsFor: stats.totalPointsFor,
          totalPointsAgainst: stats.totalPointsAgainst,
          totalPointDiff: stats.totalPointDiff,
          totalSitOuts: 0, // not tracked in old data
          totalSessions: stats.totalSessions.size,
          lastPlayedAt: stats.lastPlayedAt,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      written++;
    }
    await batch.commit();
    console.log(`  Wrote ${Math.min(i + 400, entries.length)} / ${entries.length}`);
  }

  console.log(`Done. Wrote global stats for ${written} players.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
