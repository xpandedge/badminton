import { beforeAll, afterAll, describe, expect, it } from "vitest";
import * as admin from "firebase-admin";
import { Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
import { autoCompleteStaleSessions } from "../autoCompleteStaleSessions.js";

const PROJECT_ID = "picklebaddies-85732";
const EMULATOR_AVAILABLE = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeEmulator = EMULATOR_AVAILABLE ? describe : describe.skip;

let db: Firestore;
const sessionIds = [
  "auto-complete-stale",
  "auto-complete-paused",
  "auto-complete-fresh",
  "auto-complete-completed",
];

describeEmulator("autoCompleteStaleSessions", () => {
  beforeAll(async () => {
    if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();
    await Promise.all(sessionIds.map((id) => db.recursiveDelete(db.doc(`sessions/${id}`))));
  });

  afterAll(async () => {
    await Promise.all(sessionIds.map((id) => db.recursiveDelete(db.doc(`sessions/${id}`))));
  });

  it("completes only stale active and paused sessions and records an audit", async () => {
    const nowMs = Date.now();
    const stale = Timestamp.fromMillis(nowMs - 25 * 60 * 60 * 1000);
    const fresh = Timestamp.fromMillis(nowMs - 2 * 60 * 60 * 1000);

    await db.doc("sessions/auto-complete-stale").set({ status: "active", startedAt: stale });
    await db.doc("sessions/auto-complete-paused").set({ status: "paused", startedAt: stale });
    await db.doc("sessions/auto-complete-fresh").set({ status: "active", startedAt: fresh });
    await db.doc("sessions/auto-complete-completed").set({ status: "completed", startedAt: stale });
    await db.doc("sessions/auto-complete-stale/matches/match-1").set({ status: "in_progress" });

    const result = await autoCompleteStaleSessions(db, nowMs, 10);

    expect(result).toEqual({ scanned: 3, completed: 2 });
    expect((await db.doc("sessions/auto-complete-stale").get()).data()?.status).toBe("completed");
    expect((await db.doc("sessions/auto-complete-paused").get()).data()?.status).toBe("completed");
    expect((await db.doc("sessions/auto-complete-fresh").get()).data()?.status).toBe("active");
    expect((await db.doc("sessions/auto-complete-completed").get()).data()?.status).toBe("completed");
    expect((await db.doc("sessions/auto-complete-stale/matches/match-1").get()).data()?.status).toBe("cancelled");

    const audit = await db.collection("sessions/auto-complete-stale/auditLogs").get();
    expect(audit.docs.map((doc) => doc.data().action)).toContain("session_auto_completed");
  });

  it("uses updatedAt for a legacy session without startedAt", async () => {
    const nowMs = Date.now();
    await db.doc("sessions/auto-complete-stale").set({
      status: "active",
      updatedAt: Timestamp.fromMillis(nowMs - 26 * 60 * 60 * 1000),
    });

    const result = await autoCompleteStaleSessions(db, nowMs, 10);
    expect(result.completed).toBe(1);
    expect((await db.doc("sessions/auto-complete-stale").get()).data()?.status).toBe("completed");
  });
});
