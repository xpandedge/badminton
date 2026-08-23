"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { isSport, SPORT_OPTIONS, type Sport } from "@picklebaddies/domain";
import { normalizePlayerDisplayName } from "@/lib/auth/display-name";
import { getAdminAuth, getAdminDb } from "@/server/firebase/admin";
import { requireSession } from "@/server/auth/dal";
import { ok, err, type ActionResult } from "@/server/result";

export interface UserSearchResult {
  uid: string;
  displayName: string;
  email: string | null;
}

export async function searchUsers(query: string): Promise<ActionResult<UserSearchResult[]>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const q = query.trim().toLowerCase();
  if (q.length < 2) return ok([]);

  const db = getAdminDb();
  const prefixEnd = q + "\uf8ff"; // Unicode high value — standard Firestore prefix-range upper bound

  const [byEmail, byName] = await Promise.all([
    db.collection("users")
      .where("emailLower", ">=", q)
      .where("emailLower", "<=", prefixEnd)
      .limit(8)
      .get(),
    db.collection("users")
      .where("displayNameLower", ">=", q)
      .where("displayNameLower", "<=", prefixEnd)
      .limit(8)
      .get(),
  ]);

  const seen = new Set<string>();
  const results: UserSearchResult[] = [];
  for (const doc of [...byEmail.docs, ...byName.docs]) {
    if (seen.has(doc.id) || doc.id === session.uid) continue;
    seen.add(doc.id);
    const d = doc.data();
    results.push({
      uid: doc.id,
      displayName: (d.displayName as string | undefined) ?? "",
      email: (d.email as string | undefined) ?? null,
    });
    if (results.length >= 8) break;
  }

  return ok(results);
}

export async function setSportPreference(sport: Sport): Promise<ActionResult<void>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  if (!isSport(sport)) {
    return err("INVALID_ARGUMENT", `sport must be one of: ${SPORT_OPTIONS.join(", ")}`);
  }

  await getAdminDb()
    .doc(`users/${user.uid}`)
    .update({ sportPreference: sport, updatedAt: FieldValue.serverTimestamp() });

  return ok(undefined);
}

type MatchPlayerLabel = {
  playerId?: string;
  displayName?: string;
  [key: string]: unknown;
};

function renameMatchTeam(team: unknown, playerId: string, displayName: string): {
  changed: boolean;
  players: unknown;
} {
  if (!Array.isArray(team)) return { changed: false, players: team };
  let changed = false;
  const players = team.map((entry) => {
    const player = entry as MatchPlayerLabel;
    if (player.playerId !== playerId || player.displayName === displayName) return player;
    changed = true;
    return { ...player, displayName };
  });
  return { changed, players };
}

export async function updateMyDisplayName(displayNameInput: string): Promise<ActionResult<void>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  let displayName: string;
  try {
    displayName = normalizePlayerDisplayName(displayNameInput);
  } catch (validationError) {
    return err(
      "INVALID_ARGUMENT",
      validationError instanceof Error ? validationError.message : "Enter a valid player name",
    );
  }

  const db = getAdminDb();

  try {
    const groupsSnapshot = await db.collection("groups")
      .where("memberIds", "array-contains", user.uid)
      .get();
    const groupIds = groupsSnapshot.docs.map((groupDoc) => groupDoc.id);
    const sessionSnapshots = await Promise.all(
      groupIds.map((groupId) => db.collection("sessions").where("groupId", "==", groupId).get()),
    );
    const sessionDocs = sessionSnapshots.flatMap((snapshot) => snapshot.docs);

    const canonicalRefs = [db.doc(`users/${user.uid}`), db.doc(`players/${user.uid}`)];
    const groupRefs = groupIds.flatMap((groupId) => [
      db.doc(`groups/${groupId}/members/${user.uid}`),
      db.doc(`groups/${groupId}/players/${user.uid}`),
    ]);
    const sessionRefs = sessionDocs.flatMap((sessionDoc) => [
      db.doc(`sessions/${sessionDoc.id}/players/${user.uid}`),
      db.doc(`sessions/${sessionDoc.id}/leaderboard/${user.uid}`),
      db.doc(`sessions/${sessionDoc.id}/rsvps/${user.uid}`),
    ]);
    const existingSnapshots = await db.getAll(...canonicalRefs, ...groupRefs, ...sessionRefs);
    const matchesBySession = await Promise.all(
      sessionDocs.map((sessionDoc) => db.collection(`sessions/${sessionDoc.id}/matches`).get()),
    );

    await getAdminAuth().updateUser(user.uid, { displayName });

    const writer = db.bulkWriter();
    const now = FieldValue.serverTimestamp();

    for (const snapshot of existingSnapshots) {
      if (!snapshot.exists) continue;
      const data: Record<string, unknown> = { displayName, updatedAt: now };
      if (snapshot.ref.parent.id === "users") {
        data.displayNameLower = displayName.toLowerCase();
      }
      writer.set(snapshot.ref, data, { merge: true });
    }

    for (const matchesSnapshot of matchesBySession) {
      for (const matchDoc of matchesSnapshot.docs) {
        const match = matchDoc.data();
        const teamA = renameMatchTeam(match.teamA, user.uid, displayName);
        const teamB = renameMatchTeam(match.teamB, user.uid, displayName);
        if (!teamA.changed && !teamB.changed) continue;
        const matchUpdate: Record<string, unknown> = { updatedAt: now };
        if (teamA.changed) matchUpdate.teamA = teamA.players;
        if (teamB.changed) matchUpdate.teamB = teamB.players;
        writer.update(matchDoc.ref, matchUpdate);
      }
    }

    await writer.close();
    return ok(undefined);
  } catch (updateError) {
    console.error("player name update failed", updateError);
    return err("INTERNAL", "Could not update your player name. Please try again.");
  }
}
