"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
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

  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) {
      t.set(ref, {
        uid: user.uid,
        displayName: displayName || user.email?.split("@")[0] || "Player",
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
      if (displayName && existing.displayName !== displayName) {
        t.update(ref, { displayName, updatedAt: FieldValue.serverTimestamp() });
      }
    }
  });

  return ok(undefined);
}

/** Create a durable guest player doc. Returns the playerId to use in sessions. */
export async function createGuestPlayer(
  displayName: string,
): Promise<ActionResult<{ playerId: string }>> {
  if (!displayName || displayName.trim().length < 1) {
    return err("INVALID_ARGUMENT", "displayName is required");
  }

  const db = getAdminDb();
  const ref = db.collection("players").doc();
  const playerId = `guest_${ref.id}`;
  const guestRef = db.doc(`players/${playerId}`);

  await guestRef.set({
    uid: playerId,
    displayName: displayName.trim(),
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
