"use server";
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { canCreateSession, normalizeJoinCode, type GroupRole } from "@picklebaddies/domain";
import { getAdminDb } from "@/server/firebase/admin";
import { requireSession } from "@/server/auth/dal";
import { checkRateLimit, err, ok, type ActionResult } from "@/server/result";
import { getBoardData, type BoardData } from "@/server/sessions/board";
import { canClaimPair, DISPLAY_TOKEN_PATTERN, normalizePairCode } from "@/lib/tv/connection";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const GRANT_MS = 12 * 60 * 60 * 1000;
const PAIR_MS = 10 * 60 * 1000;
async function managedBoard(code: string): Promise<ActionResult<{ sessionId: string; uid: string }>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Sign in as the session organiser to connect a TV.");
  const db = getAdminDb();
  const sessions = await db.collection("sessions").where("scoreCode", "==", normalizeJoinCode(code)).limit(1).get();
  const session = sessions.docs[0];
  if (!session || session.data().boardEnabled === false) return err("NOT_FOUND", "This board is unavailable.");
  const groupId = session.data().groupId;
  if (!groupId) return err("FORBIDDEN", "Only group owners and admins can connect a TV.");
  const member = await db.doc(`groups/${groupId}/members/${user.uid}`).get();
  if (!canCreateSession((member.data()?.role ?? null) as GroupRole | null)) return err("FORBIDDEN", "Only group owners and admins can connect a TV.");
  return ok({ sessionId: session.id, uid: user.uid });
}

/** Anonymous TV creates a short-lived challenge; the long secret never appears in its URL. */
export async function beginTvPairing(): Promise<ActionResult<{ token: string; pairCode: string; expiresAt: number }>> {
  try {
    const requestHeaders = await headers();
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    await checkRateLimit(`tv-pair:${hash(ip)}`, { maxRequests: 15, windowMs: 60_000 });
    const db = getAdminDb();
    const token = randomBytes(32).toString("hex");
    const pairCode = randomBytes(4).toString("hex").toUpperCase();
    const expiresAt = Date.now() + PAIR_MS;
    await db.runTransaction(async t => {
      const pairRef = db.doc(`tvPairCodes/${pairCode}`);
      const existing = await t.get(pairRef);
      if (existing.exists && Number(existing.data()?.expiresAt) > Date.now()) throw new Error("collision");
      t.set(pairRef, { tokenHash: hash(token), expiresAt, claimed: false, deleteAfter: new Date(expiresAt) });
      t.set(db.doc(`tvDisplays/${hash(token)}`), { expiresAt, sessionId: null, deleteAfter: new Date(expiresAt) });
    });
    return ok({ token, pairCode, expiresAt });
  } catch { return err("RESOURCE_EXHAUSTED", "Unable to create a pairing code. Please wait a minute and try again."); }
}

export async function claimTvPairing(boardCode: string, enteredCode: string): Promise<ActionResult> {
  const pairCode = normalizePairCode(enteredCode);
  if (!pairCode) return err("INVALID_ARGUMENT", "Enter the eight characters shown on the TV.");
  const access = await managedBoard(boardCode);
  if (!access.ok) return access;
  try {
    await checkRateLimit(`tv-claim:${access.data.uid}`, { maxRequests: 10, windowMs: 60_000 });
    const db = getAdminDb();
    return await db.runTransaction(async t => {
      const ref = db.doc(`tvPairCodes/${pairCode}`);
      const pair = (await t.get(ref)).data();
      if (!canClaimPair(pair, Date.now()) || typeof pair?.tokenHash !== "string") return err("NOT_FOUND", "Pairing code expired or already used. Get a new code on the TV.");
      const expiresAt = Date.now() + GRANT_MS;
      t.update(ref, { claimed: true });
      t.set(db.doc(`tvDisplays/${pair.tokenHash}`), { sessionId: access.data.sessionId, expiresAt, deleteAfter: new Date(expiresAt) });
      return ok(undefined);
    });
  } catch { return err("RESOURCE_EXHAUSTED", "Pairing failed. Wait a minute and try again."); }
}

export async function createCastDisplay(boardCode: string): Promise<ActionResult<{ token: string }>> {
  const access = await managedBoard(boardCode);
  if (!access.ok) return access;
  try {
    await checkRateLimit(`tv-cast:${access.data.uid}`, { maxRequests: 10, windowMs: 60_000 });
    const token = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + GRANT_MS;
    await getAdminDb().doc(`tvDisplays/${hash(token)}`).set({ sessionId: access.data.sessionId, expiresAt, deleteAfter: new Date(expiresAt) });
    return ok({ token });
  } catch { return err("RESOURCE_EXHAUSTED", "Unable to connect. Please wait a minute and try again."); }
}

export async function readTvDisplay(token: string): Promise<ActionResult<BoardData | null>> {
  if (!DISPLAY_TOKEN_PATTERN.test(token)) return err("NOT_FOUND", "Invalid display access.");
  const db = getAdminDb();
  const grant = (await db.doc(`tvDisplays/${hash(token)}`).get()).data();
  if (!grant || typeof grant.expiresAt !== "number" || grant.expiresAt <= Date.now()) return err("NOT_FOUND", "Display access expired. Connect this TV again.");
  if (!grant.sessionId) return ok(null);
  const session = (await db.doc(`sessions/${grant.sessionId}`).get()).data();
  if (!session || session.boardEnabled === false || typeof session.scoreCode !== "string") return err("NOT_FOUND", "This board has been turned off.");
  // Internal reuse: scoreCode is never returned to the TV or sent in a Cast message.
  return getBoardData(session.scoreCode);
}
