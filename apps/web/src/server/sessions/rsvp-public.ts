"use server";
import "server-only";

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import {
  buildSessionRsvpBuckets,
  normalizeCasualName,
  type RsvpResponse,
  type SessionRsvpEntry,
} from "@picklebaddies/domain";
import { getAdminDb } from "@/server/firebase/admin";
import { ok, err, type ActionResult } from "@/server/result";
import { requireActiveSessionSquad } from "./actions";
import {
  applyRsvpSessionPlayerPlan,
  planRsvpSessionPlayerUpdates,
  type RsvpPlannerGroupPlayer,
  type RsvpPlannerRecord,
  type RsvpPlannerSessionPlayer,
} from "./rsvp-session-players";

export interface PublicRsvpRoster {
  sessionId: string;
  sessionName: string;
  squadName: string;
  venueName: string;
  startsAtLabel: string;
  capacity: { totalPlayers: number; casualConfirmedSlots: number; waitlistEnabled: boolean };
  regularsIn: Array<{ displayName: string }>;
  regularsAway: Array<{ displayName: string }>;
  casualsConfirmed: Array<{ displayName: string; isPublic: boolean }>;
  casualsWaiting: Array<{ displayName: string; isPublic: boolean }>;
  knownPlayerOptions: Array<{ playerId: string; displayName: string; playerKind: "regular" | "casual" }>;
}

function getTimestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  return new Date(value as string).getTime() || 0;
}

function formatStartsAt(value: unknown): string {
  const date = typeof (value as { toDate?: () => Date })?.toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : value instanceof Date
      ? value
      : new Date(value as string);
  if (Number.isNaN(date.getTime())) return "Time to be confirmed";
  return date.toLocaleString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function publicRsvpDocId(normalizedName: string): string {
  const hash = createHash("sha1").update(normalizedName).digest("hex").slice(0, 20);
  return `public_${hash}`;
}

function toPlannerGroupPlayers(
  snapshot: FirebaseFirestore.QuerySnapshot,
): RsvpPlannerGroupPlayer[] {
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: typeof data.userId === "string" ? data.userId : undefined,
      displayName: data.displayName,
      skillLevel: typeof data.skillLevel === "string" ? data.skillLevel : undefined,
      playerKind: data.playerKind === "casual" ? "casual" : "regular",
    };
  });
}

function toPlannerRsvps(snapshot: FirebaseFirestore.QuerySnapshot): RsvpPlannerRecord[] {
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      response: data.response as RsvpResponse | undefined,
      status: data.status,
      participantType: data.participantType,
      displayName: data.displayName,
      adminOverride: data.adminOverride,
      createdAtMs: getTimestampMs(data.createdAt),
      updatedAtMs: getTimestampMs(data.updatedAt),
    };
  });
}

function toPlannerSessionPlayers(
  snapshot: FirebaseFirestore.QuerySnapshot,
): RsvpPlannerSessionPlayer[] {
  return snapshot.docs.map((doc) => ({ id: doc.id, status: doc.data().status }));
}

function sessionRsvpCapacity(session: FirebaseFirestore.DocumentData) {
  const capacity = session.rsvpCapacity ?? {};
  return {
    totalPlayers: Number(capacity.totalPlayers ?? 11),
    casualConfirmedSlots: Number(capacity.casualConfirmedSlots ?? 3),
    waitlistEnabled: capacity.waitlistEnabled !== false,
  };
}

async function findSessionByRsvpCode(rsvpCode: string) {
  const db = getAdminDb();
  const snap = await db
    .collection("sessions")
    .where("rsvpCode", "==", rsvpCode.trim().toUpperCase())
    .where("rsvpEnabled", "==", true)
    .limit(1)
    .get();
  return snap.docs[0] ?? null;
}

export async function getPublicRsvpRoster(rsvpCode: string): Promise<ActionResult<PublicRsvpRoster>> {
  const sessionDoc = await findSessionByRsvpCode(rsvpCode);
  if (!sessionDoc) return err("NOT_FOUND", "This RSVP link is not available");

  const db = getAdminDb();
  const session = sessionDoc.data();
  const [groupSnap, groupPlayersSnap, rsvpsSnap] = await Promise.all([
    db.doc(`groups/${session.groupId}`).get(),
    db.collection(`groups/${session.groupId}/players`).get(),
    db.collection(`sessions/${sessionDoc.id}/rsvps`).get(),
  ]);

  const rsvpByUserId = new Map(rsvpsSnap.docs.map((doc) => [doc.id, doc.data()]));
  const regulars: SessionRsvpEntry[] = [];
  const casuals: Array<SessionRsvpEntry & { isPublic?: boolean }> = [];
  const knownPlayerOptions: Array<{ playerId: string; displayName: string; playerKind: "regular" | "casual" }> = [];

  for (const playerDoc of groupPlayersSnap.docs) {
    const player = playerDoc.data();
    const displayName = String(player.displayName ?? "Player").trim() || "Player";
    const playerKind = player.playerKind === "casual" ? "casual" : "regular";
    const rsvp = rsvpByUserId.get(playerDoc.id) ?? (player.userId ? rsvpByUserId.get(player.userId) : null);
    const response = rsvp?.response as RsvpResponse | undefined;
    const entry: SessionRsvpEntry = {
      id: playerDoc.id,
      displayName,
      response,
      joinedAtMs: getTimestampMs(rsvp?.createdAt ?? rsvp?.updatedAt),
      adminOverride: rsvp?.adminOverride,
    };
    if (playerKind === "regular") {
      regulars.push(entry);
    } else if (response === "casual_joined") {
      casuals.push(entry);
    }
    knownPlayerOptions.push({ playerId: playerDoc.id, displayName, playerKind });
  }

  for (const rsvpDoc of rsvpsSnap.docs) {
    const rsvp = rsvpDoc.data();
    if (rsvp.participantType !== "public_casual" || rsvp.response !== "casual_joined") continue;
    casuals.push({
      id: rsvpDoc.id,
      displayName: String(rsvp.displayName ?? "Player").trim() || "Player",
      response: "casual_joined",
      joinedAtMs: getTimestampMs(rsvp.createdAt ?? rsvp.updatedAt),
      adminOverride: rsvp.adminOverride,
      isPublic: true,
    });
  }

  const capacityData = session.rsvpCapacity ?? {};
  const buckets = buildSessionRsvpBuckets({
    capacity: {
      totalPlayers: Number(capacityData.totalPlayers ?? 11),
      casualConfirmedSlots: Number(capacityData.casualConfirmedSlots ?? 3),
      waitlistEnabled: capacityData.waitlistEnabled !== false,
    },
    regulars,
    casuals,
  });

  return ok({
    sessionId: sessionDoc.id,
    sessionName: session.name ?? "Session",
    squadName: groupSnap.exists ? groupSnap.data()?.name ?? "Squad" : "Squad",
    venueName: session.venueName ?? "",
    startsAtLabel: formatStartsAt(session.startsAt),
    capacity: {
      totalPlayers: Number(capacityData.totalPlayers ?? 11),
      casualConfirmedSlots: Number(capacityData.casualConfirmedSlots ?? 3),
      waitlistEnabled: capacityData.waitlistEnabled !== false,
    },
    regularsIn: buckets.regularsIn.map((entry) => ({ displayName: entry.displayName })),
    regularsAway: buckets.regularsAway.map((entry) => ({ displayName: entry.displayName })),
    casualsConfirmed: buckets.casualsConfirmed.map((entry) => ({
      displayName: entry.displayName,
      isPublic: Boolean((entry as SessionRsvpEntry & { isPublic?: boolean }).isPublic),
    })),
    casualsWaiting: buckets.casualsWaiting.map((entry) => ({
      displayName: entry.displayName,
      isPublic: Boolean((entry as SessionRsvpEntry & { isPublic?: boolean }).isPublic),
    })),
    knownPlayerOptions: knownPlayerOptions.sort((a, b) => a.displayName.localeCompare(b.displayName)),
  });
}

async function updateKnownPlayerRsvp(
  rsvpCode: string,
  playerId: string,
  intent: "join" | "remove",
): Promise<ActionResult<void>> {
  const cleanPlayerId = playerId.trim();
  if (!cleanPlayerId) return err("INVALID_ARGUMENT", "Choose your name");

  const sessionDoc = await findSessionByRsvpCode(rsvpCode);
  if (!sessionDoc) return err("NOT_FOUND", "This RSVP link is not available");

  const db = getAdminDb();
  const activeSquad = await requireActiveSessionSquad(db, sessionDoc.id, "");
  if (!activeSquad.ok) return activeSquad;

  try {
    await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionDoc.id}`);
      const rsvpRef = db.doc(`sessions/${sessionDoc.id}/rsvps/${cleanPlayerId}`);
      const [sessionSnap, playerSnap, rsvpSnap, groupPlayersSnap, rsvpsSnap, sessionPlayersSnap] = await Promise.all([
        t.get(sessionRef),
        t.get(db.doc(`groups/${sessionDoc.data().groupId}/players/${cleanPlayerId}`)),
        t.get(rsvpRef),
        t.get(db.collection(`groups/${sessionDoc.data().groupId}/players`)),
        t.get(db.collection(`sessions/${sessionDoc.id}/rsvps`)),
        t.get(db.collection(`sessions/${sessionDoc.id}/players`)),
      ]);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      if (!playerSnap.exists) {
        throw Object.assign(new Error("Choose a player from the list"), { code: "NOT_FOUND" });
      }
      const session = sessionSnap.data()!;
      const player = playerSnap.data()!;
      const displayName = String(player.displayName ?? "Player").trim() || "Player";
      const playerKind = player.playerKind === "casual" ? "casual" : "regular";
      const response: RsvpResponse = intent === "join"
        ? playerKind === "casual" ? "casual_joined" : "in"
        : playerKind === "casual" ? "removed" : "away";
      t.set(rsvpRef, {
        userId: player.userId ?? cleanPlayerId,
        displayName,
        status: intent === "join" ? "going" : "not_going",
        response,
        playerKind,
        participantType: "registered_user",
        createdAt: rsvpSnap.exists ? rsvpSnap.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      const plan = planRsvpSessionPlayerUpdates({
        status: String(session.status ?? ""),
        capacity: sessionRsvpCapacity(session),
        groupPlayers: toPlannerGroupPlayers(groupPlayersSnap),
        rsvps: toPlannerRsvps(rsvpsSnap),
        sessionPlayers: toPlannerSessionPlayers(sessionPlayersSnap),
        changedRsvp: { playerId: cleanPlayerId, response },
      });
      applyRsvpSessionPlayerPlan(
        db,
        t,
        sessionDoc.id,
        plan,
        new Set(sessionPlayersSnap.docs.map((doc) => doc.id)),
      );
    });
    return ok(undefined);
  } catch (error: any) {
    if (error.code === "NOT_FOUND") return err("NOT_FOUND", error.message);
    if (error.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", error.message);
    throw error;
  }
}

export async function joinKnownPlayerRsvp(rsvpCode: string, playerId: string): Promise<ActionResult<void>> {
  return updateKnownPlayerRsvp(rsvpCode, playerId, "join");
}

export async function removeKnownPlayerRsvp(rsvpCode: string, playerId: string): Promise<ActionResult<void>> {
  return updateKnownPlayerRsvp(rsvpCode, playerId, "remove");
}

export async function joinPublicCasualRsvp(rsvpCode: string, displayName: string): Promise<ActionResult<void>> {
  const normalizedName = normalizeCasualName(displayName);
  if (normalizedName.length < 2) return err("INVALID_ARGUMENT", "Enter your name");

  const sessionDoc = await findSessionByRsvpCode(rsvpCode);
  if (!sessionDoc) return err("NOT_FOUND", "This RSVP link is not available");

  const db = getAdminDb();
  const activeSquad = await requireActiveSessionSquad(db, sessionDoc.id, "");
  if (!activeSquad.ok) return activeSquad;
  const rsvpRef = db.doc(`sessions/${sessionDoc.id}/rsvps/${publicRsvpDocId(normalizedName)}`);
  try {
    await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionDoc.id}`);
      const sessionGroupId = String(sessionDoc.data().groupId ?? "");
      const [sessionSnap, snap, groupPlayersSnap, rsvpsSnap, sessionPlayersSnap] = await Promise.all([
        t.get(sessionRef),
        t.get(rsvpRef),
        t.get(db.collection(`groups/${sessionGroupId}/players`)),
        t.get(db.collection(`sessions/${sessionDoc.id}/rsvps`)),
        t.get(db.collection(`sessions/${sessionDoc.id}/players`)),
      ]);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const exactKnownName = groupPlayersSnap.docs.some((doc) => {
        const knownName = String(doc.data().displayName ?? "").trim();
        return normalizeCasualName(knownName) === normalizedName;
      });
      if (exactKnownName) {
        throw Object.assign(new Error("That name is already signed up. Use Find your name above."), {
          code: "ALREADY_EXISTS",
        });
      }
      if (snap.exists && snap.data()?.response !== "removed") {
        throw Object.assign(new Error("That name is already on this session list"), {
          code: "ALREADY_EXISTS",
        });
      }
      t.set(rsvpRef, {
        displayName: displayName.trim().replace(/\s+/g, " "),
        normalizedName,
        participantType: "public_casual",
        response: "casual_joined",
        status: "going",
        createdAt: snap.exists ? snap.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      const session = sessionSnap.data()!;
      const plan = planRsvpSessionPlayerUpdates({
        status: String(session.status ?? ""),
        capacity: sessionRsvpCapacity(session),
        groupPlayers: toPlannerGroupPlayers(groupPlayersSnap),
        rsvps: toPlannerRsvps(rsvpsSnap),
        sessionPlayers: toPlannerSessionPlayers(sessionPlayersSnap),
        changedRsvp: { playerId: rsvpRef.id, response: "casual_joined" },
      });
      applyRsvpSessionPlayerPlan(
        db,
        t,
        sessionDoc.id,
        plan,
        new Set(sessionPlayersSnap.docs.map((doc) => doc.id)),
      );
    });
    return ok(undefined);
  } catch (error: any) {
    if (error.code === "ALREADY_EXISTS") return err("ALREADY_EXISTS", error.message);
    throw error;
  }
}

export async function removePublicCasualRsvp(rsvpCode: string, displayName: string): Promise<ActionResult<void>> {
  const normalizedName = normalizeCasualName(displayName);
  if (normalizedName.length < 2) return err("INVALID_ARGUMENT", "Enter your name");

  const sessionDoc = await findSessionByRsvpCode(rsvpCode);
  if (!sessionDoc) return err("NOT_FOUND", "This RSVP link is not available");

  const db = getAdminDb();
  const rsvpRef = db.doc(`sessions/${sessionDoc.id}/rsvps/${publicRsvpDocId(normalizedName)}`);
  const activeSquad = await requireActiveSessionSquad(db, sessionDoc.id, "");
  if (!activeSquad.ok) return activeSquad;

  try {
    await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionDoc.id}`);
      const sessionGroupId = String(sessionDoc.data().groupId ?? "");
      const [sessionSnap, snap, groupPlayersSnap, rsvpsSnap, sessionPlayersSnap] = await Promise.all([
        t.get(sessionRef),
        t.get(rsvpRef),
        t.get(db.collection(`groups/${sessionGroupId}/players`)),
        t.get(db.collection(`sessions/${sessionDoc.id}/rsvps`)),
        t.get(db.collection(`sessions/${sessionDoc.id}/players`)),
      ]);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      if (!snap.exists || snap.data()?.participantType !== "public_casual") {
        throw Object.assign(new Error("That name is not on this public list"), { code: "NOT_FOUND" });
      }

      t.set(rsvpRef, {
        response: "removed",
        status: "not_going",
        removedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      const session = sessionSnap.data()!;
      const plan = planRsvpSessionPlayerUpdates({
        status: String(session.status ?? ""),
        capacity: sessionRsvpCapacity(session),
        groupPlayers: toPlannerGroupPlayers(groupPlayersSnap),
        rsvps: toPlannerRsvps(rsvpsSnap),
        sessionPlayers: toPlannerSessionPlayers(sessionPlayersSnap),
        changedRsvp: { playerId: rsvpRef.id, response: "removed" },
      });
      applyRsvpSessionPlayerPlan(
        db,
        t,
        sessionDoc.id,
        plan,
        new Set(sessionPlayersSnap.docs.map((doc) => doc.id)),
      );
    });
    return ok(undefined);
  } catch (error: any) {
    if (error.code === "NOT_FOUND") return err("NOT_FOUND", error.message);
    if (error.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", error.message);
    throw error;
  }
}
