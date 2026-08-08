"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { canManageSquad } from "@picklebaddies/domain";
import { getAdminDb, getAdminAuth } from "@/server/firebase/admin";
import { requireSession } from "@/server/auth/dal";
import { ok, err, type ActionResult } from "@/server/result";

type AddableMemberRole = "member" | "organiser";

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

  const db = getAdminDb();
  const auth = getAdminAuth();
  const groupRef = db.collection("groups").doc();

  // Fetch owner's profile so we can populate the player doc
  const ownerRecord = await auth.getUser(session.uid).catch(() => null);
  const ownerDisplayName =
    ownerRecord?.displayName?.trim() ||
    ownerRecord?.email?.split("@")[0] ||
    "Owner";

  await db.runTransaction(async (t) => {
    t.set(groupRef, {
      name: name.trim(),
      description,
      createdBy: session.uid,
      memberIds: [session.uid],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.set(groupRef.collection("members").doc(session.uid), {
      userId: session.uid,
      displayName: ownerDisplayName,
      email: ownerRecord?.email ?? null,
      role: "owner",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.set(groupRef.collection("players").doc(session.uid), {
      userId: session.uid,
      displayName: ownerDisplayName,
      email: ownerRecord?.email ?? null,
      skillLevel: "unknown",
      isGuest: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return ok({ squadId: groupRef.id });
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
