"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { canGenerateSchedule } from "@picklebaddies/domain";
import { generateSchedule as engineGenerateSchedule } from "@picklebaddies/match-engine";
import { getAdminDb } from "@/server/firebase/admin";
import { requireSession } from "@/server/auth/dal";
import { ok, err, type ActionResult } from "@/server/result";
import { mapSessionToEngineInput } from "@/server/lib/mapping";

export async function generateSchedule(
  sessionId: string,
): Promise<ActionResult<{ metadata: unknown }>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  if (!sessionId) return err("INVALID_ARGUMENT", "sessionId is required");

  const db = getAdminDb();
  const sessionRef = db.doc(`sessions/${sessionId}`);

  // F-H4: atomically claim the one-shot generation. Two concurrent calls cannot
  // both produce rounds — only the first to set scheduleGeneratedAt succeeds.
  let sessionData: any;
  try {
    sessionData = await db.runTransaction(async (t) => {
      const snap = await t.get(sessionRef);
      if (!snap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const s = snap.data()!;

      // Check membership
      const memberSnap = await t.get(db.doc(`groups/${s.groupId}/members/${session.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as any).role : null;
      if (!canGenerateSchedule(role)) {
        throw Object.assign(new Error("Must be a squad member to generate schedule"), { code: "FORBIDDEN" });
      }

      if (s.status !== "draft" && s.status !== "scheduled") {
        throw Object.assign(
          new Error("Session must be draft or scheduled to generate an initial schedule"),
          { code: "FAILED_PRECONDITION" },
        );
      }
      if (s.scheduleGeneratedAt) {
        throw Object.assign(
          new Error("A schedule has already been generated. Use rebalance to change it."),
          { code: "ALREADY_EXISTS" },
        );
      }

      t.update(sessionRef, { scheduleGeneratedAt: FieldValue.serverTimestamp() });
      return s;
    });
  } catch (e: any) {
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FORBIDDEN") return err("FORBIDDEN", e.message);
    if (e.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", e.message);
    if (e.code === "ALREADY_EXISTS") return err("ALREADY_EXISTS", e.message);
    throw e;
  }

  // Load players, rounds (none yet), matches (none yet)
  const playersSnap = await db.collection(`sessions/${sessionId}/players`).get();
  const players = playersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const engineInput = mapSessionToEngineInput(sessionData, players, [], [], "initial");
  const engineOutput = engineGenerateSchedule(engineInput);

  const batch = db.batch();

  // Initialize per-session leaderboard rows
  for (const player of players) {
    batch.set(db.doc(`sessions/${sessionId}/leaderboard/${player.id}`), {
      displayName: (player as any).displayName ?? null,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifference: 0,
      sitOutCount: 0,
    });
  }

  const roundRefs = new Map<number, FirebaseFirestore.DocumentReference>();

  for (const match of engineOutput.matches) {
    let rRef = roundRefs.get(match.roundNumber);
    if (!rRef) {
      rRef = db.collection(`sessions/${sessionId}/rounds`).doc(`round_${match.roundNumber}`);
      roundRefs.set(match.roundNumber, rRef);
      batch.set(rRef, { roundNumber: match.roundNumber, status: "scheduled" });
    }

    const getDisplayName = (pid: string) =>
      (players.find((p) => p.id === pid) as any)?.displayName ?? "Unknown";

    const mRef = rRef.collection("matches").doc();
    batch.set(mRef, {
      sessionId,
      roundNumber: match.roundNumber,
      courtId: match.courtId,
      matchNumber: match.matchNumber,
      teamA: match.teamA.map((pid) => ({ playerId: pid, displayName: getDisplayName(pid) })),
      teamB: match.teamB.map((pid) => ({ playerId: pid, displayName: getDisplayName(pid) })),
      teamAIds: match.teamA,
      teamBIds: match.teamB,
      status: "scheduled",
      isLocked: false,
    });
  }

  for (const sitOut of engineOutput.sitOuts) {
    batch.set(db.collection(`sessions/${sessionId}/sitOuts`).doc(), sitOut);
  }

  batch.set(db.collection(`sessions/${sessionId}/generationRuns`).doc(), {
    mode: "initial",
    metadata: engineOutput.metadata,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: session.uid,
  });

  batch.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
    actorUid: session.uid,
    action: "generation/created",
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  return ok({ metadata: engineOutput.metadata });
}
