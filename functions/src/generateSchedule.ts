import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { canGenerateSchedule } from "@picklebaddies/domain";
import { generateSchedule as engineGenerateSchedule } from "@picklebaddies/match-engine";
import { requireGroupRole } from "./lib/auth.js";
import { mapSessionToEngineInput } from "./lib/mapping.js";
import { writeAudit } from "./lib/audit.js";

export const generateSchedule = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");

  const sessionId = request.data.sessionId;
  if (!sessionId || typeof sessionId !== "string") {
    throw new HttpsError("invalid-argument", "sessionId must be provided.");
  }

  const db = getFirestore();
  const sessionRef = db.doc(`sessions/${sessionId}`);

  // F-H4: atomically claim the one-shot initial generation so two concurrent
  // calls can't both produce rounds (which would duplicate matches/leaderboards).
  // Reads role + status in the same snapshot; later edits go through rebalance.
  const session = await db.runTransaction(async (t) => {
    const sessionDoc = await t.get(sessionRef);
    if (!sessionDoc.exists) throw new HttpsError("not-found", "Session not found.");
    const s = sessionDoc.data()!;

    await requireGroupRole(request.auth!.uid, s.groupId, canGenerateSchedule, t);

    if (s.status !== "draft" && s.status !== "scheduled") {
      throw new HttpsError("failed-precondition", "Session must be draft or scheduled to generate an initial schedule.");
    }
    if (s.scheduleGeneratedAt) {
      throw new HttpsError("already-exists", "A schedule has already been generated. Use rebalance to change it.");
    }

    t.update(sessionRef, { scheduleGeneratedAt: FieldValue.serverTimestamp() });
    return s;
  });

  const playersSnap = await db.collection(`sessions/${sessionId}/players`).get();
  const players = playersSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const roundsSnap = await db.collection(`sessions/${sessionId}/rounds`).get();
  const rounds = roundsSnap.docs.map(d => d.data());

  const matchesSnap = await db.collectionGroup("matches")
                              .where("sessionId", "==", sessionId)
                              .get();
  const matches = matchesSnap.docs.map(d => d.data());

  const engineInput = mapSessionToEngineInput(session, players, rounds, matches, "initial");
  const engineOutput = engineGenerateSchedule(engineInput);

  const batch = db.batch();

  // Initialize Leaderboards
  for (const player of players) {
    const lbRef = db.doc(`sessions/${sessionId}/leaderboard/${player.id}`);
    batch.set(lbRef, {
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifference: 0,
      sitOutCount: 0,
    });
  }

  // Save Rounds, Matches, SitOuts
  const roundRefs = new Map<number, FirebaseFirestore.DocumentReference>();

  for (const match of engineOutput.matches) {
    let rRef = roundRefs.get(match.roundNumber);
    if (!rRef) {
      rRef = db.collection(`sessions/${sessionId}/rounds`).doc(`round_${match.roundNumber}`);
      roundRefs.set(match.roundNumber, rRef);
      batch.set(rRef, {
        roundNumber: match.roundNumber,
        status: "scheduled",
      });
    }

    const teamAIds = match.teamA;
    const teamBIds = match.teamB;

    const getDisplayName = (pid: string) => players.find(p => p.id === pid)?.displayName || "Unknown";

    const mRef = rRef.collection("matches").doc();
    batch.set(mRef, {
      roundNumber: match.roundNumber,
      courtId: match.courtId,
      matchNumber: match.matchNumber,
      teamA: teamAIds.map(pid => ({ playerId: pid, displayName: getDisplayName(pid) })),
      teamB: teamBIds.map(pid => ({ playerId: pid, displayName: getDisplayName(pid) })),
      teamAIds,
      teamBIds,
      status: "scheduled",
      isLocked: false,
    });
  }

  for (const sitOut of engineOutput.sitOuts) {
    const sRef = db.collection(`sessions/${sessionId}/sitOuts`).doc();
    batch.set(sRef, {
      ...sitOut,
    });
  }

  // Generation Run log
  const genRef = db.collection(`sessions/${sessionId}/generationRuns`).doc();
  batch.set(genRef, {
    mode: "initial",
    metadata: engineOutput.metadata,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: request.auth.uid,
  });

  writeAudit(batch, sessionId, {
    actorUid: request.auth.uid,
    action: "generation/created",
    details: { metadata: engineOutput.metadata }
  });

  await batch.commit();

  return { success: true, metadata: engineOutput.metadata };
});
