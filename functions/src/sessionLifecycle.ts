import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { canCreateSession } from "@picklebaddies/domain";
import { requireGroupRole } from "./lib/auth.js";
import { writeAudit } from "./lib/audit.js";
import { assertString } from "./lib/validation.js";

const updateSessionStatus = async (
  request: any,
  statusFrom: string[],
  statusTo: string,
  actionLabel: string,
  additionalUpdates?: any
) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");

  const sessionId = assertString(request.data?.sessionId, "sessionId");

  const db = getFirestore();
  const isStart = statusTo === "active" && actionLabel === "session_started";

  return db.runTransaction(async (t) => {
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const round1Ref = db.doc(`sessions/${sessionId}/rounds/round_1`);

    // ── ALL READS FIRST ──
    const sessionDoc = await t.get(sessionRef);
    if (!sessionDoc.exists) throw new HttpsError("not-found", "Session not found.");
    const session = sessionDoc.data()!;

    await requireGroupRole(request.auth!.uid, session.groupId, canCreateSession, t);

    // M7: starting requires a generated schedule, else round_1 update throws NOT_FOUND.
    const round1Doc = isStart ? await t.get(round1Ref) : null;

    if (!statusFrom.includes(session.status)) {
      throw new HttpsError("failed-precondition", `Cannot transition to ${statusTo} from ${session.status}.`);
    }
    if (isStart && !round1Doc!.exists) {
      throw new HttpsError("failed-precondition", "Generate a schedule before starting the session.");
    }

    // ── THEN ALL WRITES ──
    const updates = { status: statusTo, ...additionalUpdates };
    t.update(sessionRef, updates);

    if (isStart) {
      t.update(round1Ref, { status: "in_progress" });
    }

    writeAudit(t, sessionId, {
      actorUid: request.auth!.uid,
      action: actionLabel,
    });

    return { success: true };
  });
};

export const startSession = onCall({ cors: true }, (request) =>
  updateSessionStatus(request, ["draft", "scheduled"], "active", "session_started", {
    currentRoundNumber: 1,
    startedAt: FieldValue.serverTimestamp(),
  })
);

export const pauseSession = onCall({ cors: true }, (request) =>
  updateSessionStatus(request, ["active"], "paused", "session_paused")
);

export const resumeSession = onCall({ cors: true }, (request) =>
  updateSessionStatus(request, ["paused"], "active", "session_resumed")
);

export const completeSession = onCall({ cors: true }, (request) =>
  updateSessionStatus(request, ["active", "paused"], "completed", "session_completed")
);
