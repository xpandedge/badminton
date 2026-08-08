import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

// VERY simple windowed rate limit since actual logic will depend on Redis or a DB counter.
// Here we just limit using a small document hit or simplistic approach if preferred.
// For now, minimal mock to meet requirements without too much overhead.

export async function checkRateLimit(joinCode: string, ip: string): Promise<void> {
  const db = getFirestore();
  const limitRef = db.collection("_rateLimits").doc(`${joinCode}_${ip}`);

  await db.runTransaction(async (t) => {
    const doc = await t.get(limitRef);
    const now = Date.now();
    const windowMs = 60000; // 1 min

    if (!doc.exists) {
      t.set(limitRef, { count: 1, resetAt: now + windowMs });
      return;
    }

    const data = doc.data()!;
    if (now > data.resetAt) {
      t.set(limitRef, { count: 1, resetAt: now + windowMs });
      return;
    }

    if (data.count >= 10) {
      throw new HttpsError("resource-exhausted", "Too many requests. Please try again later.");
    }

    t.update(limitRef, { count: data.count + 1 });
  });
}
