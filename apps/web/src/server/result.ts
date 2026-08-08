import "server-only";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: ActionErrorCode; message: string };

export type ActionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "INVALID_ARGUMENT"
  | "FAILED_PRECONDITION"
  | "RESOURCE_EXHAUSTED"
  | "INTERNAL";

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function err(code: ActionErrorCode, message: string): ActionResult<never> {
  return { ok: false, code, message };
}

/** Rate-limit bucket keyed by (uid + action). Stored in Firestore _rateLimits. */
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

import { getAdminDb } from "@/server/firebase/admin";
import type { Transaction } from "firebase-admin/firestore";

/**
 * Lightweight Firestore-backed rate limiter (mirrors functions/src/lib/rateLimit.ts).
 * Throws an ActionResult-compatible error object on limit exceeded; resolves quietly otherwise.
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig = { maxRequests: 10, windowMs: 60_000 },
  txn?: Transaction
): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection("_rateLimits").doc(key);
  const now = Date.now();

  const run = async (t: Transaction) => {
    const doc = await t.get(ref);
    if (!doc.exists) {
      t.set(ref, { count: 1, resetAt: now + config.windowMs });
      return;
    }
    const d = doc.data()!;
    if (now > d.resetAt) {
      t.set(ref, { count: 1, resetAt: now + config.windowMs });
      return;
    }
    if (d.count >= config.maxRequests) {
      throw Object.assign(new Error("Too many requests"), {
        code: "RESOURCE_EXHAUSTED" as ActionErrorCode,
      });
    }
    t.update(ref, { count: d.count + 1 });
  };

  if (txn) {
    await run(txn);
  } else {
    await db.runTransaction(run);
  }
}
