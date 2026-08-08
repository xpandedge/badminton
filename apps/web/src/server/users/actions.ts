"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { type Sport } from "@picklebaddies/domain";
import { getAdminDb } from "@/server/firebase/admin";
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

  if (sport !== "badminton" && sport !== "pickleball") {
    return err("INVALID_ARGUMENT", "sport must be badminton or pickleball");
  }

  await getAdminDb()
    .doc(`users/${user.uid}`)
    .update({ sportPreference: sport, updatedAt: FieldValue.serverTimestamp() });

  return ok(undefined);
}
