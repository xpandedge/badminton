import {
  getFirestore,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  isSquadArchived,
  isSquadPurgeDue,
} from "@picklebaddies/domain";
import { autoCompleteStaleSessions } from "./autoCompleteStaleSessions.js";
import { FUNCTIONS_REGION } from "./options.js";

const DEFAULT_PURGE_LIMIT = 25;
const MAX_PURGE_LIMIT = 100;

export type PurgeResult = {
  scanned: number;
  purged: number;
};

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_PURGE_LIMIT;
  if (!Number.isFinite(limit)) return DEFAULT_PURGE_LIMIT;
  return Math.min(MAX_PURGE_LIMIT, Math.max(1, Math.floor(limit)));
}

/**
 * Deletes expired squad-owned data in a bounded, retry-safe batch.
 *
 * The group is re-read after the initial due query so a restored squad is
 * skipped. Top-level sessions are deleted separately because they are not
 * nested below the group document.
 */
export async function purgeExpiredArchivedSquads(
  db: Firestore,
  nowMs: number = Date.now(),
  limit?: number,
): Promise<PurgeResult> {
  if (!Number.isFinite(nowMs)) {
    throw new Error("nowMs must be a finite number");
  }

  const candidates = await db
    .collection("groups")
    .where("purgeAfter", "<=", getFirestoreTimestamp(nowMs))
    .limit(normalizeLimit(limit))
    .get();

  let purged = 0;

  for (const candidate of candidates.docs) {
    const latest = await candidate.ref.get();
    const data = latest.data();

    if (
      !latest.exists ||
      !data ||
      !isSquadArchived(data) ||
      !isSquadPurgeDue(data, nowMs)
    ) {
      continue;
    }

    const sessions = await db
      .collection("sessions")
      .where("groupId", "==", latest.id)
      .get();

    for (const session of sessions.docs) {
      await db.recursiveDelete(session.ref);
    }

    await db.recursiveDelete(latest.ref);
    purged += 1;
  }

  return { scanned: candidates.size, purged };
}

function getFirestoreTimestamp(milliseconds: number) {
  return Timestamp.fromMillis(milliseconds);
}

export const purgeArchivedSquads = onSchedule(
  {
    schedule: "every 24 hours",
    timeZone: "Australia/Brisbane",
    region: FUNCTIONS_REGION,
    maxInstances: 1,
  },
  async () => {
    const result = await purgeExpiredArchivedSquads(getFirestore());
    const sessionResult = await autoCompleteStaleSessions(getFirestore());
    console.log(
      `Archived squad purge scanned ${result.scanned} candidate(s) and purged ${result.purged}.`,
    );
    console.log(
      `Session cleanup scanned ${sessionResult.scanned} live session(s) and completed ${sessionResult.completed}.`,
    );
  },
);
