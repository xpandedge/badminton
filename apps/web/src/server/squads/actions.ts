"use server";
import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  canAddGroupMember,
  canLeaveGroup,
  canManageAdmins,
  canManageGroup,
  canManageMembers,
  canRemoveGroupMember,
  canTransferOwnership,
  generateJoinCode,
  getSquadPurgeAfter,
  getTimestampMillis,
  isSquadArchived,
  type GroupRole,
  type SquadPlayerKind,
} from "@picklebaddies/domain";
import { getAdminDb, getAdminAuth } from "@/server/firebase/admin";
import { requireSession } from "@/server/auth/dal";
import { ok, err, type ActionResult } from "@/server/result";
import type { SquadAccess, SquadGroupData } from "./types";

type AddableMemberRole = "member" | "admin";

async function readSquadAccess(
  db: FirebaseFirestore.Firestore,
  squadId: string,
  uid: string,
): Promise<ActionResult<SquadAccess>> {
  const groupRef = db.doc(`groups/${squadId}`);
  const cleanUid = uid.trim();
  const memberRef = cleanUid ? db.doc(`groups/${squadId}/members/${cleanUid}`) : null;
  const [groupSnap, memberSnap] = await Promise.all([
    groupRef.get(),
    memberRef ? memberRef.get() : Promise.resolve(null),
  ]);

  if (!groupSnap.exists) return err("NOT_FOUND", "Squad not found");

  const memberData = memberSnap?.exists ? (memberSnap.data() as { role?: GroupRole }) : null;
  return ok({
    groupRef,
    group: groupSnap.data() as SquadGroupData,
    role: memberData?.role ?? null,
  });
}

/** Reads the squad and caller membership, rejecting all archived-squad writes. */
export async function requireActiveSquad(
  db: FirebaseFirestore.Firestore,
  squadId: string,
  uid: string,
): Promise<ActionResult<SquadAccess>> {
  const access = await readSquadAccess(db, squadId, uid);
  if (!access.ok) return access;
  if (isSquadArchived(access.data.group)) {
    return err("FAILED_PRECONDITION", "This squad is archived and read-only");
  }
  return access;
}

export interface SquadRsvpDefaultsInput {
  totalPlayers: number;
  casualConfirmedSlots: number;
  waitlistEnabled: boolean;
  cutoffHoursBeforeStart?: number | null;
}

function normalizeSquadRsvpDefaults(input: SquadRsvpDefaultsInput): SquadRsvpDefaultsInput {
  const totalPlayers = Math.trunc(Number(input.totalPlayers));
  const casualConfirmedSlots = Math.trunc(Number(input.casualConfirmedSlots));
  const cutoffHoursBeforeStart =
    input.cutoffHoursBeforeStart === null || input.cutoffHoursBeforeStart === undefined || input.cutoffHoursBeforeStart === 0
      ? null
      : Math.trunc(Number(input.cutoffHoursBeforeStart));

  if (!Number.isFinite(totalPlayers) || totalPlayers < 4) {
    throw Object.assign(new Error("Total player capacity must be at least 4"), { code: "INVALID_ARGUMENT" });
  }
  if (!Number.isFinite(casualConfirmedSlots) || casualConfirmedSlots < 0) {
    throw Object.assign(new Error("Casual confirmed slots cannot be negative"), { code: "INVALID_ARGUMENT" });
  }
  if (casualConfirmedSlots > totalPlayers) {
    throw Object.assign(new Error("Casual confirmed slots cannot exceed total capacity"), {
      code: "INVALID_ARGUMENT",
    });
  }
  if (cutoffHoursBeforeStart !== null && (!Number.isFinite(cutoffHoursBeforeStart) || cutoffHoursBeforeStart < 0)) {
    throw Object.assign(new Error("RSVP cutoff cannot be negative"), { code: "INVALID_ARGUMENT" });
  }

  return {
    totalPlayers,
    casualConfirmedSlots,
    waitlistEnabled: Boolean(input.waitlistEnabled),
    cutoffHoursBeforeStart,
  };
}

// ── shared creation helper ──────────────────────────────────────────────────

async function createSquadForUser(
  uid: string,
  name: string,
  description: string | null,
): Promise<{ squadId: string }> {
  const db = getAdminDb();
  const auth = getAdminAuth();
  const groupRef = db.collection("groups").doc();

  // Fetch owner's profile so we can populate the player doc
  const ownerRecord = await auth.getUser(uid).catch(() => null);
  const ownerDisplayName =
    ownerRecord?.displayName?.trim() ||
    "Owner";

  await db.runTransaction(async (t) => {
    t.set(groupRef, {
      name: name.trim(),
      nameLower: name.trim().toLowerCase(),
      description,
      createdBy: uid,
      memberIds: [uid],
      inviteCode: generateJoinCode(),
      rsvpDefaults: {
        totalPlayers: 11,
        casualConfirmedSlots: 3,
        waitlistEnabled: true,
        cutoffHoursBeforeStart: null,
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.set(groupRef.collection("members").doc(uid), {
      userId: uid,
      displayName: ownerDisplayName,
      email: ownerRecord?.email ?? null,
      role: "owner",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.set(groupRef.collection("players").doc(uid), {
      userId: uid,
      displayName: ownerDisplayName,
      email: ownerRecord?.email ?? null,
      skillLevel: "unknown",
      isGuest: false,
      playerKind: "regular",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { squadId: groupRef.id };
}

// ── createSquad ───────────────────────────────────────────────────────────────

export interface CreateSquadInput {
  name: string;
  description?: string;
}

export async function createSquad(
  input: CreateSquadInput,
): Promise<ActionResult<{ squadId: string }>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const { name, description = null } = input;
  if (!name || name.trim().length < 2) {
    return err("INVALID_ARGUMENT", "Squad name must be at least 2 characters");
  }

  const result = await createSquadForUser(session.uid, name, description);
  return ok(result);
}

// ── archive / restore ───────────────────────────────────────────────────────

export async function archiveSquad(
  squadId: string,
): Promise<ActionResult<{ purgeAfter: number }>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");
  if (!squadId) return err("INVALID_ARGUMENT", "Squad is required");

  const db = getAdminDb();
  const access = await readSquadAccess(db, squadId, session.uid);
  if (!access.ok) return access;
  if (!canManageAdmins(access.data.role)) {
    return err("FORBIDDEN", "Only the squad owner can archive this squad");
  }
  if (isSquadArchived(access.data.group)) {
    return err("FAILED_PRECONDITION", "This squad is already archived");
  }

  const purgeAfter = getSquadPurgeAfter();
  await access.data.groupRef.update({
    archivedAt: FieldValue.serverTimestamp(),
    purgeAfter: Timestamp.fromMillis(purgeAfter),
    archivedBy: session.uid,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: session.uid,
  });

  return ok({ purgeAfter });
}

export async function restoreSquad(squadId: string): Promise<ActionResult<void>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");
  if (!squadId) return err("INVALID_ARGUMENT", "Squad is required");

  const db = getAdminDb();
  const access = await readSquadAccess(db, squadId, session.uid);
  if (!access.ok) return access;
  if (!canManageAdmins(access.data.role)) {
    return err("FORBIDDEN", "Only the squad owner can restore this squad");
  }
  if (!isSquadArchived(access.data.group)) {
    return err("FAILED_PRECONDITION", "This squad is not archived");
  }

  const purgeAfter = getTimestampMillis(access.data.group.purgeAfter);
  if (purgeAfter === null || purgeAfter <= Date.now()) {
    return err("FAILED_PRECONDITION", "The squad restore window has expired");
  }

  await access.data.groupRef.update({
    archivedAt: FieldValue.delete(),
    purgeAfter: FieldValue.delete(),
    archivedBy: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: session.uid,
  });

  return ok(undefined);
}

// ── getOrCreateDefaultSquad ─────────────────────────────────────────────────
// Lets a brand-new user reach session creation with zero setup: returns their
// first squad if they have one, otherwise silently creates a personal one.

export async function getOrCreateDefaultSquad(): Promise<ActionResult<{ squadId: string }>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  const existing = await db
    .collection("groups")
    .where("memberIds", "array-contains", session.uid)
    .limit(500)
    .get();

  const activeSquad = existing.docs.find((doc) => !isSquadArchived(doc.data()));
  if (activeSquad) {
    return ok({ squadId: activeSquad.id });
  }

  const auth = getAdminAuth();
  const ownerRecord = await auth.getUser(session.uid).catch(() => null);
  const ownerDisplayName =
    ownerRecord?.displayName?.trim() ||
    "My";

  const result = await createSquadForUser(session.uid, `${ownerDisplayName}'s Squad`, null);
  return ok(result);
}

// ── addMemberToSquad ──────────────────────────────────────────────────────────
// Owner looks up an existing app user by email and adds them to the squad.

export async function addMemberToSquad(
  squadId: string,
  email: string,
  role: AddableMemberRole = "member",
): Promise<ActionResult<{ userId: string }>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  const auth = getAdminAuth();

  const activeSquad = await requireActiveSquad(db, squadId, session.uid);
  if (!activeSquad.ok) return activeSquad;

  const callerSnap = await db.doc(`groups/${squadId}/members/${session.uid}`).get();
  const callerRole = callerSnap.exists ? (callerSnap.data() as { role?: GroupRole }).role ?? null : null;
  if (!canAddGroupMember(callerRole, role)) {
    return err(
      "FORBIDDEN",
      role === "admin"
        ? "Only the group owner can appoint admins"
        : "Only group owners and admins can add members",
    );
  }

  // Look up target user by email
  let targetUser: { uid: string; displayName?: string; email?: string };
  try {
    const record = await auth.getUserByEmail(email.trim().toLowerCase());
    targetUser = { uid: record.uid, displayName: record.displayName, email: record.email };
  } catch {
    return err("NOT_FOUND", "No account found with that email. They must sign up first.");
  }

  const memberRef = db.doc(`groups/${squadId}/members/${targetUser.uid}`);
  const existing = await memberRef.get();
  if (existing.exists) {
    return ok({ userId: targetUser.uid }); // idempotent
  }

  const displayName =
    targetUser.displayName?.trim() ||
    "Player";

  const playerRef = db.doc(`groups/${squadId}/players/${targetUser.uid}`);

  await db.runTransaction(async (t) => {
    // All reads must come before any writes in a Firestore transaction.
    const existingPlayer = await t.get(playerRef);

    t.set(memberRef, {
      userId: targetUser.uid,
      email: targetUser.email ?? null,
      displayName,
      role,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.update(db.doc(`groups/${squadId}`), {
      memberIds: FieldValue.arrayUnion(targetUser.uid),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (!existingPlayer.exists) {
      t.set(playerRef, {
        userId: targetUser.uid,
        displayName,
        email: targetUser.email ?? null,
        skillLevel: "unknown",
        isGuest: false,
        playerKind: "regular",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });

  return ok({ userId: targetUser.uid });
}

// ── addGuestPlayerToSquad ─────────────────────────────────────────────────────
// Add a name-only guest player (no Firebase account required).
// Useful for testing and for walk-in players without smartphones.

export interface AddGuestPlayerInput {
  squadId: string;
  displayName: string;
  skillLevel?: string;
}

export async function addGuestPlayerToSquad(
  input: AddGuestPlayerInput,
): Promise<ActionResult<{ playerId: string }>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const { squadId, displayName, skillLevel = "unknown" } = input;

  if (!displayName || displayName.trim().length < 1) {
    return err("INVALID_ARGUMENT", "Player name is required");
  }

  const db = getAdminDb();

  const activeSquad = await requireActiveSquad(db, squadId, session.uid);
  if (!activeSquad.ok) return activeSquad;

  const callerSnap = await db.doc(`groups/${squadId}/members/${session.uid}`).get();
  const callerRole = callerSnap.exists ? (callerSnap.data() as { role?: GroupRole }).role ?? null : null;
  if (!canManageMembers(callerRole)) {
    return err("FORBIDDEN", "Only group owners and admins can add guest players");
  }

  // Generate a stable guest ID that won't collide with real user UIDs
  const guestDocRef = db.collection(`groups/${squadId}/players`).doc();
  const playerId = `guest_${guestDocRef.id}`;
  const playerRef = db.doc(`groups/${squadId}/players/${playerId}`);

  await playerRef.set({
    userId: null,
    displayName: displayName.trim(),
    email: null,
    skillLevel,
    isGuest: true,
    playerKind: "casual",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return ok({ playerId });
}

// ── venue and court management ──────────────────────────────────────────────

export async function addVenueToSquad(
  squadId: string,
  name: string,
): Promise<ActionResult<{ venueId: string }>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");
  if (!name.trim()) return err("INVALID_ARGUMENT", "Venue name is required");

  const db = getAdminDb();
  const activeSquad = await requireActiveSquad(db, squadId, session.uid);
  if (!activeSquad.ok) return activeSquad;
  const callerRole = await getMemberRole(db, squadId, session.uid);
  if (!canManageGroup(callerRole)) {
    return err("FORBIDDEN", "Only group owners and admins can add venues");
  }

  const venueRef = db.collection(`groups/${squadId}/venues`).doc();
  await venueRef.set({
    name: name.trim(),
    address: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: session.uid,
  });
  return ok({ venueId: venueRef.id });
}

export async function addCourtToSquadVenue(
  squadId: string,
  venueId: string,
  name: string,
  courtNumber: number,
): Promise<ActionResult<{ courtId: string }>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");
  if (!name.trim()) return err("INVALID_ARGUMENT", "Court name is required");
  if (!Number.isInteger(courtNumber) || courtNumber < 1) {
    return err("INVALID_ARGUMENT", "Court number must be at least 1");
  }

  const db = getAdminDb();
  const activeSquad = await requireActiveSquad(db, squadId, session.uid);
  if (!activeSquad.ok) return activeSquad;
  const [callerRole, venueSnap] = await Promise.all([
    getMemberRole(db, squadId, session.uid),
    db.doc(`groups/${squadId}/venues/${venueId}`).get(),
  ]);
  if (!canManageGroup(callerRole)) {
    return err("FORBIDDEN", "Only group owners and admins can add courts");
  }
  if (!venueSnap.exists) return err("NOT_FOUND", "Venue not found");

  const courtRef = db.collection(`groups/${squadId}/venues/${venueId}/courts`).doc();
  await courtRef.set({
    name: name.trim(),
    courtNumber,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: session.uid,
  });
  return ok({ courtId: courtRef.id });
}

// ── Self-join: shared helper ────────────────────────────────────────────────

/** Adds a signed-in user to a squad as a member + player. Idempotent. */
async function addUserToSquad(
  t: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  squadId: string,
  user: { uid: string; displayName?: string | null; email?: string | null },
  playerKind: SquadPlayerKind = "regular",
): Promise<void> {
  const displayName = user.displayName?.trim() || "Player";
  t.set(db.doc(`groups/${squadId}/members/${user.uid}`), {
    userId: user.uid, email: user.email ?? null, displayName, role: "member",
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  t.set(db.doc(`groups/${squadId}/players/${user.uid}`), {
    userId: user.uid, displayName, email: user.email ?? null,
    skillLevel: "unknown", isGuest: false,
    playerKind,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  t.update(db.doc(`groups/${squadId}`), {
    memberIds: FieldValue.arrayUnion(user.uid),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// ── joinSquadByCode ─────────────────────────────────────────────────────────
// Invite code is pre-authorization: a valid code joins the squad directly.

export async function joinSquadByCode(code: string): Promise<ActionResult<{ squadId: string; name: string }>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const normalized = code.trim().toUpperCase();
  if (!normalized) return err("INVALID_ARGUMENT", "Enter an invite code");

  const db = getAdminDb();
  const auth = getAdminAuth();
  const snap = await db.collection("groups").where("inviteCode", "==", normalized).limit(1).get();
  if (snap.empty) return err("NOT_FOUND", "No squad found for that code");

  const groupDoc = snap.docs[0]!;
  const squadId = groupDoc.id;
  const name = (groupDoc.data() as any).name ?? "Squad";

  const activeSquad = await requireActiveSquad(db, squadId, session.uid);
  if (!activeSquad.ok) return activeSquad;

  const memberSnap = await db.doc(`groups/${squadId}/members/${session.uid}`).get();
  if (memberSnap.exists) return ok({ squadId, name }); // already a member — idempotent

  const record = await auth.getUser(session.uid).catch(() => null);
  await db.runTransaction(async (t) => {
    await addUserToSquad(t, db, squadId, { uid: session.uid, displayName: record?.displayName, email: record?.email });
    // Clear any pending request now that they're in.
    t.delete(db.doc(`groups/${squadId}/joinRequests/${session.uid}`));
  });

  return ok({ squadId, name });
}

// ── searchSquads ────────────────────────────────────────────────────────────
// All squads are discoverable by name; joining still requires a request.

export interface SquadSearchResult {
  squadId: string;
  name: string;
  memberCount: number;
  relation: "member" | "requested" | "none";
}

export async function searchSquads(query: string): Promise<ActionResult<SquadSearchResult[]>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const q = query.trim().toLowerCase();
  if (q.length < 2) return ok([]);

  const db = getAdminDb();
  // Small-scale name search: scan a bounded set and substring-match in memory.
  // (Fine for MVP data volumes; revisit with a search index if squads grow large.)
  const snap = await db.collection("groups").limit(500).get();
  const matches = snap.docs
    .map((d) => ({ id: d.id, data: d.data() as any }))
    .filter(({ data }) => {
      if (isSquadArchived(data)) return false;
      const name = (data.nameLower ?? (data.name ?? "").toLowerCase()) as string;
      return name.includes(q);
    })
    .slice(0, 20);

  const results: SquadSearchResult[] = await Promise.all(
    matches.map(async ({ id, data }) => {
      const memberIds: string[] = data.memberIds ?? [];
      let relation: SquadSearchResult["relation"] = "none";
      if (memberIds.includes(session.uid)) {
        relation = "member";
      } else {
        const reqSnap = await db.doc(`groups/${id}/joinRequests/${session.uid}`).get();
        if (reqSnap.exists) relation = "requested";
      }
      return { squadId: id, name: data.name ?? "Squad", memberCount: memberIds.length, relation };
    }),
  );

  return ok(results);
}

// ── requestToJoinSquad ──────────────────────────────────────────────────────

export async function requestToJoinSquad(squadId: string): Promise<ActionResult<{ status: "requested" | "joined" }>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  const auth = getAdminAuth();

  const groupSnap = await db.doc(`groups/${squadId}`).get();
  if (!groupSnap.exists) return err("NOT_FOUND", "Squad not found");

  const activeSquad = await requireActiveSquad(db, squadId, session.uid);
  if (!activeSquad.ok) return activeSquad;

  const memberSnap = await db.doc(`groups/${squadId}/members/${session.uid}`).get();
  if (memberSnap.exists) return ok({ status: "joined" }); // already in

  const record = await auth.getUser(session.uid).catch(() => null);
  const displayName = record?.displayName?.trim() || "Player";

  await db.doc(`groups/${squadId}/joinRequests/${session.uid}`).set({
    userId: session.uid,
    displayName,
    email: record?.email ?? null,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return ok({ status: "requested" });
}

// ── approve / reject join requests ──────────────────────────────────────────

async function getMemberRole(
  db: FirebaseFirestore.Firestore,
  squadId: string,
  uid: string,
): Promise<GroupRole | null> {
  const snap = await db.doc(`groups/${squadId}/members/${uid}`).get();
  return snap.exists ? (snap.data() as { role?: GroupRole }).role ?? null : null;
}

export async function approveJoinRequest(
  squadId: string,
  requesterId: string,
  playerKind: SquadPlayerKind = "regular",
): Promise<ActionResult<void>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");
  if (playerKind !== "regular" && playerKind !== "casual") {
    return err("INVALID_ARGUMENT", "Choose regular or casual");
  }

  const db = getAdminDb();
  const activeSquad = await requireActiveSquad(db, squadId, session.uid);
  if (!activeSquad.ok) return activeSquad;
  if (!canManageMembers(await getMemberRole(db, squadId, session.uid))) {
    return err("FORBIDDEN", "Only group owners and admins can approve requests");
  }

  const reqRef = db.doc(`groups/${squadId}/joinRequests/${requesterId}`);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) return err("NOT_FOUND", "Request not found");
  const reqData = reqSnap.data() as any;

  await db.runTransaction(async (t) => {
    await addUserToSquad(t, db, squadId, { uid: requesterId, displayName: reqData.displayName, email: reqData.email }, playerKind);
    t.delete(reqRef);
  });

  return ok(undefined);
}

export async function rejectJoinRequest(squadId: string, requesterId: string): Promise<ActionResult<void>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  const activeSquad = await requireActiveSquad(db, squadId, session.uid);
  if (!activeSquad.ok) return activeSquad;
  if (!canManageMembers(await getMemberRole(db, squadId, session.uid))) {
    return err("FORBIDDEN", "Only group owners and admins can manage requests");
  }

  await db.doc(`groups/${squadId}/joinRequests/${requesterId}`).delete();
  return ok(undefined);
}

// ── rotateInviteCode ────────────────────────────────────────────────────────

export async function rotateInviteCode(squadId: string): Promise<ActionResult<{ inviteCode: string }>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  const activeSquad = await requireActiveSquad(db, squadId, session.uid);
  if (!activeSquad.ok) return activeSquad;
  const callerSnap = await db.doc(`groups/${squadId}/members/${session.uid}`).get();
  const callerRole = callerSnap.exists ? (callerSnap.data() as { role?: GroupRole }).role ?? null : null;
  if (!canManageGroup(callerRole)) {
    return err("FORBIDDEN", "Only group owners and admins can change the invite code");
  }

  const inviteCode = generateJoinCode();
  await db.doc(`groups/${squadId}`).update({ inviteCode, updatedAt: FieldValue.serverTimestamp() });
  return ok({ inviteCode });
}

// ── RSVP defaults and player type ───────────────────────────────────────────

export async function updateSquadPlayerKind(
  squadId: string,
  playerId: string,
  kind: SquadPlayerKind,
): Promise<ActionResult<void>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");
  if (kind !== "regular" && kind !== "casual") {
    return err("INVALID_ARGUMENT", "Choose Regular or Casual");
  }

  const db = getAdminDb();
  const activeSquad = await requireActiveSquad(db, squadId, session.uid);
  if (!activeSquad.ok) return activeSquad;
  const callerRole = await getMemberRole(db, squadId, session.uid);
  if (!canManageMembers(callerRole)) {
    return err("FORBIDDEN", "Only squad owners and admins can change player type");
  }

  const playerRef = db.doc(`groups/${squadId}/players/${playerId}`);
  const playerSnap = await playerRef.get();
  if (!playerSnap.exists) return err("NOT_FOUND", "Player not found");

  await playerRef.set({
    playerKind: kind,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: session.uid,
  }, { merge: true });
  return ok(undefined);
}

export async function updateSquadRsvpDefaults(
  squadId: string,
  input: SquadRsvpDefaultsInput,
): Promise<ActionResult<void>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  const activeSquad = await requireActiveSquad(db, squadId, session.uid);
  if (!activeSquad.ok) return activeSquad;
  const callerRole = await getMemberRole(db, squadId, session.uid);
  if (!canManageGroup(callerRole)) {
    return err("FORBIDDEN", "Only squad owners and admins can change RSVP defaults");
  }

  let defaults: SquadRsvpDefaultsInput;
  try {
    defaults = normalizeSquadRsvpDefaults(input);
  } catch (error: any) {
    if (error.code === "INVALID_ARGUMENT") return err("INVALID_ARGUMENT", error.message);
    throw error;
  }

  await db.doc(`groups/${squadId}`).set({
    rsvpDefaults: defaults,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: session.uid,
  }, { merge: true });

  return ok(undefined);
}

// ── updateMemberRole ────────────────────────────────────────────────────────

export async function updateMemberRole(
  squadId: string,
  targetUserId: string,
  role: "admin" | "member",
): Promise<ActionResult<void>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  const activeSquad = await requireActiveSquad(db, squadId, session.uid);
  if (!activeSquad.ok) return activeSquad;

  try {
    await db.runTransaction(async (t) => {
      const callerRef = db.doc(`groups/${squadId}/members/${session.uid}`);
      const targetRef = db.doc(`groups/${squadId}/members/${targetUserId}`);
      const [callerSnap, targetSnap] = await Promise.all([t.get(callerRef), t.get(targetRef)]);

      const callerRole = callerSnap.exists
        ? (callerSnap.data() as { role?: GroupRole }).role ?? null
        : null;
      const targetRole = targetSnap.exists
        ? (targetSnap.data() as { role?: GroupRole }).role ?? null
        : null;

      if (!canManageAdmins(callerRole)) {
        throw Object.assign(new Error("Only the group owner can change admin roles"), { code: "FORBIDDEN" });
      }
      if (!targetSnap.exists) {
        throw Object.assign(new Error("Member not found"), { code: "NOT_FOUND" });
      }
      if (targetRole === "owner") {
        throw Object.assign(new Error("The owner role cannot be changed here"), { code: "FORBIDDEN" });
      }

      t.update(targetRef, {
        role,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: session.uid,
      });
    });
  } catch (error: any) {
    if (error.code === "FORBIDDEN") return err("FORBIDDEN", error.message);
    if (error.code === "NOT_FOUND") return err("NOT_FOUND", error.message);
    throw error;
  }

  return ok(undefined);
}

// ── transferSquadOwnership ─────────────────────────────────────────────────

export async function transferSquadOwnership(
  squadId: string,
  targetUserId: string,
): Promise<ActionResult<void>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");
  if (!squadId || !targetUserId) {
    return err("INVALID_ARGUMENT", "Squad and new owner are required");
  }
  if (targetUserId === session.uid) {
    return err("INVALID_ARGUMENT", "Choose another squad member as the new owner");
  }

  const db = getAdminDb();
  const activeSquad = await requireActiveSquad(db, squadId, session.uid);
  if (!activeSquad.ok) return activeSquad;
  try {
    await db.runTransaction(async (t) => {
      const groupRef = db.doc(`groups/${squadId}`);
      const callerRef = db.doc(`groups/${squadId}/members/${session.uid}`);
      const targetRef = db.doc(`groups/${squadId}/members/${targetUserId}`);
      const [groupSnap, callerSnap, targetSnap] = await Promise.all([
        t.get(groupRef),
        t.get(callerRef),
        t.get(targetRef),
      ]);

      if (!groupSnap.exists) {
        throw Object.assign(new Error("Squad not found"), { code: "NOT_FOUND" });
      }
      const callerRole = callerSnap.exists
        ? (callerSnap.data() as { role?: GroupRole }).role ?? null
        : null;
      if (!canTransferOwnership(callerRole)) {
        throw Object.assign(
          new Error("Only the current squad owner can transfer ownership"),
          { code: "FORBIDDEN" },
        );
      }
      if (!targetSnap.exists) {
        throw Object.assign(
          new Error("Choose a registered squad member as the new owner"),
          { code: "NOT_FOUND" },
        );
      }
      const targetRole = (targetSnap.data() as { role?: GroupRole }).role ?? null;
      if (targetRole === "owner") {
        throw Object.assign(new Error("This member already owns the squad"), {
          code: "FAILED_PRECONDITION",
        });
      }

      t.update(targetRef, {
        role: "owner",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: session.uid,
      });
      t.update(callerRef, {
        role: "admin",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: session.uid,
      });
      t.update(groupRef, {
        createdBy: targetUserId,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: session.uid,
      });
      t.set(db.collection(`groups/${squadId}/auditLogs`).doc(), {
        actorUid: session.uid,
        action: "ownership/transferred",
        details: { previousOwnerId: session.uid, newOwnerId: targetUserId },
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error: any) {
    if (error.code === "FORBIDDEN") return err("FORBIDDEN", error.message);
    if (error.code === "NOT_FOUND") return err("NOT_FOUND", error.message);
    if (error.code === "FAILED_PRECONDITION") {
      return err("FAILED_PRECONDITION", error.message);
    }
    throw error;
  }

  return ok(undefined);
}

// ── leaveSquad ─────────────────────────────────────────────────────────────

export async function leaveSquad(squadId: string): Promise<ActionResult<void>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");
  if (!squadId) return err("INVALID_ARGUMENT", "Squad is required");

  const db = getAdminDb();
  const activeSquad = await requireActiveSquad(db, squadId, session.uid);
  if (!activeSquad.ok) return activeSquad;
  try {
    await db.runTransaction(async (t) => {
      const groupRef = db.doc(`groups/${squadId}`);
      const memberRef = db.doc(`groups/${squadId}/members/${session.uid}`);
      const squadPlayerRef = db.doc(`groups/${squadId}/players/${session.uid}`);
      const sessionsQuery = db.collection("sessions").where("groupId", "==", squadId);
      const [groupSnap, memberSnap, squadPlayerSnap, sessionsSnap] = await Promise.all([
        t.get(groupRef),
        t.get(memberRef),
        t.get(squadPlayerRef),
        t.get(sessionsQuery),
      ]);

      if (!groupSnap.exists) {
        throw Object.assign(new Error("Squad not found"), { code: "NOT_FOUND" });
      }
      if (!memberSnap.exists) {
        throw Object.assign(new Error("You are no longer a member of this squad"), {
          code: "NOT_FOUND",
        });
      }
      const callerRole = (memberSnap.data() as { role?: GroupRole }).role ?? null;
      if (!canLeaveGroup(callerRole)) {
        throw Object.assign(
          new Error("Transfer ownership to another member before leaving this squad"),
          { code: "FAILED_PRECONDITION" },
        );
      }

      const unstartedSessions = sessionsSnap.docs.filter((sessionDoc) => {
        const status = sessionDoc.data().status;
        return status === "draft" || status === "scheduled";
      });
      const cleanup = await Promise.all(unstartedSessions.map(async (sessionDoc) => {
        const playerRef = db.doc(`sessions/${sessionDoc.id}/players/${session.uid}`);
        const leaderboardRef = db.doc(`sessions/${sessionDoc.id}/leaderboard/${session.uid}`);
        const rsvpRef = db.doc(`sessions/${sessionDoc.id}/rsvps/${session.uid}`);
        const engineRef = db.doc(`sessions/${sessionDoc.id}/engine/state`);
        const [playerSnap, leaderboardSnap, rsvpSnap, matchesSnap, sitOutsSnap, engineSnap] =
          await Promise.all([
            t.get(playerRef),
            t.get(leaderboardRef),
            t.get(rsvpRef),
            t.get(db.collection(`sessions/${sessionDoc.id}/matches`)),
            t.get(db.collection(`sessions/${sessionDoc.id}/sitOuts`)),
            t.get(engineRef),
          ]);
        return {
          sessionDoc,
          playerRef,
          leaderboardRef,
          rsvpRef,
          engineRef,
          playerSnap,
          leaderboardSnap,
          rsvpSnap,
          matchesSnap,
          sitOutsSnap,
          engineSnap,
        };
      }));

      for (const item of cleanup) {
        if (item.playerSnap.exists) t.delete(item.playerRef);
        if (item.leaderboardSnap.exists) t.delete(item.leaderboardRef);
        if (item.rsvpSnap.exists) t.delete(item.rsvpRef);

        const sessionData = item.sessionDoc.data();
        const rsvpStatus = item.rsvpSnap.exists ? item.rsvpSnap.data()?.status : null;
        const sessionUpdate: Record<string, unknown> = {
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (rsvpStatus === "going") {
          sessionUpdate.rsvpGoingCount = Math.max(
            0,
            Number(sessionData.rsvpGoingCount ?? 0) - 1,
          );
        } else if (rsvpStatus === "not_going") {
          sessionUpdate.rsvpNotGoingCount = Math.max(
            0,
            Number(sessionData.rsvpNotGoingCount ?? 0) - 1,
          );
        }

        const hasGeneratedSchedule = Boolean(sessionData.scheduleGeneratedAt)
          || !item.matchesSnap.empty
          || !item.sitOutsSnap.empty
          || item.engineSnap.exists;
        if (hasGeneratedSchedule) {
          for (const matchDoc of item.matchesSnap.docs) t.delete(matchDoc.ref);
          for (const sitOutDoc of item.sitOutsSnap.docs) t.delete(sitOutDoc.ref);
          if (item.engineSnap.exists) t.delete(item.engineRef);
          Object.assign(sessionUpdate, {
            scheduleGeneratedAt: null,
            nextCycleNumber: 1,
            currentRoundNumber: 0,
          });
        }
        t.update(item.sessionDoc.ref, sessionUpdate);
      }

      t.delete(memberRef);
      if (squadPlayerSnap.exists) t.delete(squadPlayerRef);
      t.update(groupRef, {
        memberIds: FieldValue.arrayRemove(session.uid),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: session.uid,
      });
      t.set(db.collection(`groups/${squadId}/auditLogs`).doc(), {
        actorUid: session.uid,
        action: "member/left",
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error: any) {
    if (error.code === "NOT_FOUND") return err("NOT_FOUND", error.message);
    if (error.code === "FAILED_PRECONDITION") {
      return err("FAILED_PRECONDITION", error.message);
    }
    throw error;
  }

  return ok(undefined);
}

// ── removePlayerFromSquad ───────────────────────────────────────────────────

export async function removePlayerFromSquad(
  squadId: string,
  targetPlayerId: string,
): Promise<ActionResult<void>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  const activeSquad = await requireActiveSquad(db, squadId, session.uid);
  if (!activeSquad.ok) return activeSquad;
  try {
    await db.runTransaction(async (t) => {
      const callerRef = db.doc(`groups/${squadId}/members/${session.uid}`);
      const targetMemberRef = db.doc(`groups/${squadId}/members/${targetPlayerId}`);
      const targetPlayerRef = db.doc(`groups/${squadId}/players/${targetPlayerId}`);
      const [callerSnap, targetMemberSnap, targetPlayerSnap] = await Promise.all([
        t.get(callerRef),
        t.get(targetMemberRef),
        t.get(targetPlayerRef),
      ]);

      const callerRole = callerSnap.exists
        ? (callerSnap.data() as { role?: GroupRole }).role ?? null
        : null;
      const targetRole = targetMemberSnap.exists
        ? (targetMemberSnap.data() as { role?: GroupRole }).role ?? null
        : null;
      const targetIsGuest = !targetMemberSnap.exists && targetPlayerSnap.exists
        && (targetPlayerSnap.data() as { isGuest?: boolean }).isGuest === true;

      const canRemove = targetIsGuest
        ? canManageMembers(callerRole)
        : canRemoveGroupMember(callerRole, targetRole);
      if (!canRemove) {
        throw Object.assign(
          new Error("You do not have permission to remove this group member"),
          { code: "FORBIDDEN" },
        );
      }

      t.delete(targetMemberRef);
      t.delete(targetPlayerRef);
      t.update(db.doc(`groups/${squadId}`), {
        memberIds: FieldValue.arrayRemove(targetPlayerId),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error: any) {
    if (error.code === "FORBIDDEN") return err("FORBIDDEN", error.message);
    throw error;
  }

  return ok(undefined);
}
