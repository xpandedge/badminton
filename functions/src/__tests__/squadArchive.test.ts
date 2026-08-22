import { beforeAll, afterAll, describe, expect, it } from "vitest";
import * as admin from "firebase-admin";
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type Firestore,
} from "firebase-admin/firestore";
import { purgeExpiredArchivedSquads } from "../purgeArchivedSquads.js";

const PROJECT_ID = "picklebaddies-85732";
const EMULATOR_AVAILABLE = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeEmulator = EMULATOR_AVAILABLE ? describe : describe.skip;

let db: Firestore;

const groupIds = [
  "squad-archive-expired-full",
  "squad-archive-expired-partial",
  "squad-archive-future",
  "squad-archive-live",
  "squad-archive-restored",
];
const sessionIds = [
  "squad-archive-session-full",
  "squad-archive-session-partial",
];

async function seedGroup(
  groupId: string,
  data: Record<string, unknown>,
): Promise<void> {
  await db.doc(`groups/${groupId}`).set({
    name: groupId,
    memberIds: ["squad-archive-owner"],
    ...data,
  });
}

async function seedNestedData(): Promise<void> {
  const groupId = "squad-archive-expired-full";
  const groupDocuments = [
    "members/squad-archive-owner",
    "players/squad-archive-player",
    "venues/venue-1/courts/court-1",
    "joinRequests/request-1",
    "auditLogs/archive-1",
  ];

  for (const path of groupDocuments) {
    await db.doc(`groups/${groupId}/${path}`).set({ seeded: true });
  }

  const sessionId = "squad-archive-session-full";
  const sessionDocuments = [
    "players/session-player-1",
    "rounds/round-1/matches/match-1",
    "sitouts/sitout-1",
    "rsvps/squad-archive-owner",
    "engine/state",
    "leaderboard/session-player-1",
    "auditLogs/session-1",
  ];

  await db.doc(`sessions/${sessionId}`).set({
    groupId,
    name: "Archived session",
  });
  for (const path of sessionDocuments) {
    await db.doc(`sessions/${sessionId}/${path}`).set({ seeded: true });
  }
}

async function seedFixtures(nowMs: number): Promise<void> {
  const expiredAt = Timestamp.fromMillis(nowMs - 1_000);
  const future = Timestamp.fromMillis(nowMs + 60_000);

  await seedGroup("squad-archive-expired-full", {
    archivedAt: expiredAt,
    purgeAfter: Timestamp.fromMillis(nowMs - 1),
    archivedBy: "squad-archive-owner",
  });
  await seedGroup("squad-archive-expired-partial", {
    archivedAt: expiredAt,
    purgeAfter: Timestamp.fromMillis(nowMs - 1),
    archivedBy: "squad-archive-owner",
  });
  await seedGroup("squad-archive-future", {
    archivedAt: Timestamp.fromMillis(nowMs - 1_000),
    purgeAfter: future,
    archivedBy: "squad-archive-owner",
  });
  await seedGroup("squad-archive-live", {});

  await db.doc("sessions/squad-archive-session-partial").set({
    groupId: "squad-archive-expired-partial",
  });
  await db.doc("players/global-player-1").set({ displayName: "Global player" });
  await db.doc("users/squad-archive-user-1").set({ displayName: "User" });
  await seedNestedData();
}

async function deleteFixtures(): Promise<void> {
  await Promise.all(
    groupIds.map((groupId) => db.recursiveDelete(db.doc(`groups/${groupId}`))),
  );
  await Promise.all(
    sessionIds.map((sessionId) =>
      db.recursiveDelete(db.doc(`sessions/${sessionId}`)),
    ),
  );
  await db.doc("players/global-player-1").delete();
  await db.doc("users/squad-archive-user-1").delete();
}

describeEmulator("purgeExpiredArchivedSquads", () => {
  beforeAll(async () => {
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: PROJECT_ID });
    }
    db = getFirestore();
    await deleteFixtures();
  });

  afterAll(async () => {
    await deleteFixtures();
  });

  it("purges only expired squad data and preserves global records", async () => {
    const nowMs = Date.now();
    await seedFixtures(nowMs);

    const firstBatch = await purgeExpiredArchivedSquads(db, nowMs, 1);
    expect(firstBatch.scanned).toBe(1);
    expect(firstBatch.purged).toBe(1);

    const secondBatch = await purgeExpiredArchivedSquads(db, nowMs, 10);
    expect(secondBatch.scanned).toBe(1);
    expect(secondBatch.purged).toBe(1);

    expect((await db.doc("groups/squad-archive-expired-full").get()).exists).toBe(
      false,
    );
    expect(
      (await db.doc("sessions/squad-archive-session-full/engine/state").get())
        .exists,
    ).toBe(false);
    expect((await db.doc("groups/squad-archive-expired-partial").get()).exists).toBe(
      false,
    );
    expect((await db.doc("groups/squad-archive-future").get()).exists).toBe(true);
    expect((await db.doc("groups/squad-archive-live").get()).exists).toBe(true);
    expect((await db.doc("players/global-player-1").get()).exists).toBe(true);
    expect((await db.doc("users/squad-archive-user-1").get()).exists).toBe(true);

    const retry = await purgeExpiredArchivedSquads(db, nowMs, 10);
    expect(retry).toEqual({ scanned: 0, purged: 0 });
  });

  it("skips a candidate restored before the deletion pass", async () => {
    const nowMs = Date.now();
    await seedGroup("squad-archive-restored", {
      archivedAt: Timestamp.fromMillis(nowMs - 10_000),
      purgeAfter: Timestamp.fromMillis(nowMs - 1),
      archivedBy: "squad-archive-owner",
    });

    await db.doc("groups/squad-archive-restored").update({
      archivedAt: FieldValue.delete(),
      purgeAfter: FieldValue.delete(),
      archivedBy: FieldValue.delete(),
    });

    const result = await purgeExpiredArchivedSquads(db, nowMs, 10);
    expect(result).toEqual({ scanned: 0, purged: 0 });
    expect((await db.doc("groups/squad-archive-restored").get()).exists).toBe(true);
  });
});
