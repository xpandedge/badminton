"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { canManageSquad, generateJoinCode } from "@picklebaddies/domain";
import { getAdminDb, getAdminAuth } from "@/server/firebase/admin";
import { requireSession } from "@/server/auth/dal";
import { ok, err, type ActionResult } from "@/server/result";

type AddableMemberRole = "member" | "organiser";

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
    ownerRecord?.email?.split("@")[0] ||
    "Owner";

  await db.runTransaction(async (t) => {
    t.set(groupRef, {
      name: name.trim(),
      nameLower: name.trim().toLowerCase(),
      description,
      createdBy: uid,
      memberIds: [uid],
      inviteCode: generateJoinCode(),
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
    .limit(1)
    .get();

  if (!existing.empty) {
    return ok({ squadId: existing.docs[0]!.id });
  }

  const auth = getAdminAuth();
  const ownerRecord = await auth.getUser(session.uid).catch(() => null);
  const ownerDisplayName =
    ownerRecord?.displayName?.trim() ||
    ownerRecord?.email?.split("@")[0] ||
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

  // Only owners may add members
  const callerSnap = await db.doc(`groups/${squadId}/members/${session.uid}`).get();
  const callerRole = callerSnap.exists ? (callerSnap.data() as any).role : null;
  if (!canManageSquad(callerRole)) {
    return err("FORBIDDEN", "Only squad owners can add members");
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
    targetUser.email?.split("@")[0] ||
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

  const callerSnap = await db.doc(`groups/${squadId}/members/${session.uid}`).get();
  const callerRole = callerSnap.exists ? (callerSnap.data() as any).role : null;
  if (!canManageSquad(callerRole)) {
    return err("FORBIDDEN", "Only squad owners can add guest players");
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
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return ok({ playerId });
}

// ── Self-join: shared helper ────────────────────────────────────────────────

/** Adds a signed-in user to a squad as a member + player. Idempotent. */
async function addUserToSquad(
  t: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  squadId: string,
  user: { uid: string; displayName?: string | null; email?: string | null },
): Promise<void> {
  const displayName = user.displayName?.trim() || user.email?.split("@")[0] || "Player";
  t.set(db.doc(`groups/${squadId}/members/${user.uid}`), {
    userId: user.uid, email: user.email ?? null, displayName, role: "member",
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  t.set(db.doc(`groups/${squadId}/players/${user.uid}`), {
    userId: user.uid, displayName, email: user.email ?? null,
    skillLevel: "unknown", isGuest: false,
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

  const memberSnap = await db.doc(`groups/${squadId}/members/${session.uid}`).get();
  if (memberSnap.exists) return ok({ status: "joined" }); // already in

  const record = await auth.getUser(session.uid).catch(() => null);
  const displayName = record?.displayName?.trim() || record?.email?.split("@")[0] || "Player";

  await db.doc(`groups/${squadId}/joinRequests/${session.uid}`).set({
    userId: session.uid,
    displayName,
    email: record?.email ?? null,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return ok({ status: "requested" });
}

// ── approve / reject join requests (any member) ─────────────────────────────

async function requireMember(db: FirebaseFirestore.Firestore, squadId: string, uid: string): Promise<boolean> {
  const snap = await db.doc(`groups/${squadId}/members/${uid}`).get();
  return snap.exists;
}

export async function approveJoinRequest(squadId: string, requesterId: string): Promise<ActionResult<void>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  if (!(await requireMember(db, squadId, session.uid))) {
    return err("FORBIDDEN", "Only squad members can approve requests");
  }

  const reqRef = db.doc(`groups/${squadId}/joinRequests/${requesterId}`);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) return err("NOT_FOUND", "Request not found");
  const reqData = reqSnap.data() as any;

  await db.runTransaction(async (t) => {
    await addUserToSquad(t, db, squadId, { uid: requesterId, displayName: reqData.displayName, email: reqData.email });
    t.delete(reqRef);
  });

  return ok(undefined);
}

export async function rejectJoinRequest(squadId: string, requesterId: string): Promise<ActionResult<void>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  if (!(await requireMember(db, squadId, session.uid))) {
    return err("FORBIDDEN", "Only squad members can manage requests");
  }

  await db.doc(`groups/${squadId}/joinRequests/${requesterId}`).delete();
  return ok(undefined);
}

// ── rotateInviteCode (owner) ────────────────────────────────────────────────

export async function rotateInviteCode(squadId: string): Promise<ActionResult<{ inviteCode: string }>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  const callerSnap = await db.doc(`groups/${squadId}/members/${session.uid}`).get();
  const callerRole = callerSnap.exists ? (callerSnap.data() as any).role : null;
  if (!canManageSquad(callerRole)) {
    return err("FORBIDDEN", "Only squad owners can change the invite code");
  }

  const inviteCode = generateJoinCode();
  await db.doc(`groups/${squadId}`).update({ inviteCode, updatedAt: FieldValue.serverTimestamp() });
  return ok({ inviteCode });
}
