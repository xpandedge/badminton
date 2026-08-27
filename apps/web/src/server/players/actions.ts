"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { parsePlayerGender, type PlayerGender } from "@picklebaddies/domain";
import { getAdminDb } from "@/server/firebase/admin";
import { requireSession } from "@/server/auth/dal";
import { ok, err, type ActionResult } from "@/server/result";

export interface GlobalPlayer {
  uid: string;
  displayName: string;
  isGuest: boolean;
  totalGames: number;
  totalWins: number;
  totalLosses: number;
  totalPointsFor: number;
  totalPointsAgainst: number;
  totalPointDiff: number;
  totalSitOuts: number;
  totalSessions: number;
  lastPlayedAt: null;
  createdAt: unknown;
  updatedAt: unknown;
}

/** Idempotently creates or updates the global players/{uid} doc on first sign-in. */
export async function ensureGlobalPlayer(
  displayName: string,
): Promise<ActionResult<void>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  const ref = db.doc(`players/${user.uid}`);
  const profileRef = db.doc(`users/${user.uid}`);

  await db.runTransaction(async (t) => {
    const [snap, profileSnap] = await Promise.all([
      t.get(ref),
      t.get(profileRef),
    ]);
    const gender = parsePlayerGender(profileSnap.data()?.gender);
    if (!snap.exists) {
      t.set(ref, {
        uid: user.uid,
        displayName: displayName.trim() || "Player",
        ...(gender ? { gender } : {}),
        isGuest: false,
        totalGames: 0,
        totalWins: 0,
        totalLosses: 0,
        totalPointsFor: 0,
        totalPointsAgainst: 0,
        totalPointDiff: 0,
        totalSitOuts: 0,
        totalSessions: 0,
        lastPlayedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      // Keep displayName in sync with auth profile
      const existing = snap.data()!;
      const update: Record<string, unknown> = {};
      if (displayName && existing.displayName !== displayName) {
        update.displayName = displayName;
      }
      if (gender && existing.gender !== gender) {
        update.gender = gender;
      }
      if (Object.keys(update).length > 0) {
        update.updatedAt = FieldValue.serverTimestamp();
        t.update(ref, update);
      }
    }
  });

  return ok(undefined);
}

/** Create a durable guest player doc. Returns the playerId to use in sessions. */
export async function createGuestPlayer(
  displayName: string,
  gender: PlayerGender,
): Promise<ActionResult<{ playerId: string }>> {
  if (!displayName || displayName.trim().length < 1) {
    return err("INVALID_ARGUMENT", "displayName is required");
  }
  const parsedGender = parsePlayerGender(gender);
  if (!parsedGender) return err("INVALID_ARGUMENT", "Choose Male, Female, or Non-binary.");

  const db = getAdminDb();
  const ref = db.collection("players").doc();
  const playerId = `guest_${ref.id}`;
  const guestRef = db.doc(`players/${playerId}`);

  await guestRef.set({
    uid: playerId,
    displayName: displayName.trim(),
    gender: parsedGender,
    isGuest: true,
    totalGames: 0,
    totalWins: 0,
    totalLosses: 0,
    totalPointsFor: 0,
    totalPointsAgainst: 0,
    totalPointDiff: 0,
    totalSitOuts: 0,
    totalSessions: 0,
    lastPlayedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return ok({ playerId });
}
