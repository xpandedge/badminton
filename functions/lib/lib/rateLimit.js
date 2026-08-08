"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRateLimit = checkRateLimit;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
// VERY simple windowed rate limit since actual logic will depend on Redis or a DB counter.
// Here we just limit using a small document hit or simplistic approach if preferred.
// For now, minimal mock to meet requirements without too much overhead.
async function checkRateLimit(joinCode, ip) {
    const db = (0, firestore_1.getFirestore)();
    const limitRef = db.collection("_rateLimits").doc(`${joinCode}_${ip}`);
    await db.runTransaction(async (t) => {
        const doc = await t.get(limitRef);
        const now = Date.now();
        const windowMs = 60000; // 1 min
        if (!doc.exists) {
            t.set(limitRef, { count: 1, resetAt: now + windowMs });
            return;
        }
        const data = doc.data();
        if (now > data.resetAt) {
            t.set(limitRef, { count: 1, resetAt: now + windowMs });
            return;
        }
        if (data.count >= 10) {
            throw new https_1.HttpsError("resource-exhausted", "Too many requests. Please try again later.");
        }
        t.update(limitRef, { count: data.count + 1 });
    });
}
