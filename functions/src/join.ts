import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { normalizeJoinCode, canManageSessionPlayers, isSkillLevel } from "@picklebaddies/domain";
import { requireGroupRole } from "./lib/auth.js";
import { writeAudit } from "./lib/audit.js";
import { checkRateLimit } from "./lib/rateLimit.js";
import { assertString } from "./lib/validation.js";
import type { SkillLevel } from "@picklebaddies/domain";

const MAX_DISPLAY_NAME = 60;

export const requestJoin = onCall({ cors: true }, async (req) => {
  const joinCode = assertString(req.data?.joinCode, "joinCode");
  const displayName = assertString(req.data?.displayName, "displayName").trim();
  const isGuest = !!req.data?.isGuest;

  // M1: unauthenticated callers write this doc — cap the stored string.
  if (displayName.length > MAX_DISPLAY_NAME) {
    throw new HttpsError("invalid-argument", `displayName must be ≤ ${MAX_DISPLAY_NAME} characters.`);
  }

  // Rate Limiting by IP roughly. V2 functions expose IP in req.rawRequest.ip or req.rawRequest.socket.remoteAddress
  // Using a fallback for simplicity
  const ip = req.rawRequest?.ip || "unknown-ip";
  await checkRateLimit(joinCode, ip);

  const db = getFirestore();
  const code = normalizeJoinCode(joinCode);

  const q = await db.collection("sessions").where("joinCode", "==", code).where("joinEnabled", "==", true).limit(1).get();
  if (q.empty) {
    throw new HttpsError("not-found", "Invalid or closed join code");
  }

  const session = q.docs[0]!;

  const ref = await session.ref.collection("joinRequests").add({
    displayName,
    isGuest: !!isGuest,
    userId: req.auth?.uid ?? null,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });

  return { sessionId: session.id, requestId: ref.id };
});


export const approveJoinRequest = onCall({ cors: true }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in");

  const sessionId = assertString(req.data?.sessionId, "sessionId");
  const requestId = assertString(req.data?.requestId, "requestId");
  const skillLevel = req.data?.skillLevel as SkillLevel;
  if (!isSkillLevel(skillLevel)) throw new HttpsError("invalid-argument", "Valid skillLevel is required");

  const db = getFirestore();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) throw new HttpsError("not-found", "Session not found");

  const sessionData = sessionSnap.data()!;
  const requestRef = sessionRef.collection("joinRequests").doc(requestId);

  await db.runTransaction(async (t) => {
    // ── READS (incl. authorization, so it joins the snapshot — F-C1) ──
    const reqSnap = await t.get(requestRef);
    if (!reqSnap.exists) throw new HttpsError("not-found", "Join request not found");

    await requireGroupRole(req.auth!.uid, sessionData.groupId, canManageSessionPlayers, t);

    const reqData = reqSnap.data()!;
    if (reqData.status !== "pending") {
      throw new HttpsError("failed-precondition", "Request is not pending");
    }

    const newPlayerId = reqData.userId || requestId; // if guest, use requestId as playerId
    const playerRef = sessionRef.collection("players").doc(newPlayerId);

    const playerSnap = await t.get(playerRef);
    if (playerSnap.exists) {
      throw new HttpsError("already-exists", "Player is already in the session");
    }

    // ── WRITES ──
    t.set(playerRef, {
      playerId: newPlayerId,
      displayName: reqData.displayName,
      skillLevel: skillLevel,
      status: "registered",
      participantType: reqData.isGuest ? "guest" : "registered_user",
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      sitOutCount: 0,
      addedAt: FieldValue.serverTimestamp()
    });

    t.update(requestRef, { status: "approved" });

    writeAudit(t, sessionId, {
      actorUid: req.auth!.uid,
      action: "player/join_approved",
      details: { requestId, playerId: newPlayerId },
    });
  });

  return { success: true };
});

export const rejectJoinRequest = onCall({ cors: true }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in");

  const sessionId = assertString(req.data?.sessionId, "sessionId");
  const requestId = assertString(req.data?.requestId, "requestId");

  const db = getFirestore();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) throw new HttpsError("not-found", "Session not found");
  const groupId = sessionSnap.data()!.groupId;

  const requestRef = sessionRef.collection("joinRequests").doc(requestId);

  await db.runTransaction(async (t) => {
    const reqSnap = await t.get(requestRef);
    if (!reqSnap.exists) throw new HttpsError("not-found", "Join request not found");

    await requireGroupRole(req.auth!.uid, groupId, canManageSessionPlayers, t);

    if (reqSnap.data()!.status !== "pending") {
      throw new HttpsError("failed-precondition", "Request is not pending");
    }

    t.update(requestRef, { status: "rejected" });

    writeAudit(t, sessionId, {
      actorUid: req.auth!.uid,
      action: "player/join_rejected",
      details: { requestId },
    });
  });

  return { success: true };
});
