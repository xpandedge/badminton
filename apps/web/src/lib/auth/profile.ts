import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import type { User } from "firebase/auth";

/** The subset of Firebase User this module needs (keeps the pure helper testable). */
export interface ProfileSource {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface UserProfileFields {
  displayName: string;
  displayNameLower: string;
  email: string | null;
  emailLower: string | null;
  photoURL: string | null;
}

/** Pure: map a Firebase user to the stored profile fields (PRD §15.1, minus timestamps). */
export function buildUserProfile(source: ProfileSource): UserProfileFields {
  const displayName = source.displayName ?? "";
  return {
    displayName,
    displayNameLower: displayName.toLowerCase(),
    email: source.email ?? null,
    emailLower: source.email?.toLowerCase() ?? null,
    photoURL: source.photoURL ?? null,
  };
}

/** Idempotently create users/{uid} on first sign-in. Never overwrites existing data. */
export async function ensureUserProfile(db: Firestore, user: User): Promise<void> {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data() as Partial<UserProfileFields>;
    const updates: Record<string, unknown> = {};
    if (user.email && data.emailLower !== user.email.toLowerCase()) {
      updates.email = user.email;
      updates.emailLower = user.email.toLowerCase();
    }
    // Backfill displayNameLower for existing profiles that pre-date this field.
    if (user.displayName && data.displayNameLower !== user.displayName.toLowerCase()) {
      updates.displayName = user.displayName;
      updates.displayNameLower = user.displayName.toLowerCase();
    }
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = serverTimestamp();
      await setDoc(ref, updates, { merge: true });
    }
    return;
  }
  await setDoc(ref, {
    ...buildUserProfile(user),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
