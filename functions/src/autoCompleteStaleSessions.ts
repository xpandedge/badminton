import {
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";
import { writeAudit } from "./lib/audit.js";

const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SCAN_LIMIT = 100;

export type AutoCompleteResult = {
  scanned: number;
  completed: number;
};

function timestampToMillis(value: unknown): number | null {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    const milliseconds = value.toMillis();
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  if (value instanceof Date) {
    const milliseconds = value.getTime();
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  return null;
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_SCAN_LIMIT;
  return Math.min(DEFAULT_SCAN_LIMIT, Math.max(1, Math.floor(limit)));
}

/**
 * Completes forgotten live sessions without touching scores or player stats.
 * Open matches are cancelled so no stale court assignment remains visible.
 * The transaction re-check makes retries safe if a session was completed while
 * the scheduled scan was running.
 */
export async function autoCompleteStaleSessions(
  db: Firestore,
  nowMs: number = Date.now(),
  limit?: number,
): Promise<AutoCompleteResult> {
  if (!Number.isFinite(nowMs)) throw new Error("nowMs must be a finite number");

  const candidates = await db
    .collection("sessions")
    .where("status", "in", ["active", "paused"])
    .limit(normalizeLimit(limit))
    .get();

  const cutoffMs = nowMs - SESSION_TIMEOUT_MS;
  let completed = 0;

  for (const candidate of candidates.docs) {
    const latest = await candidate.ref.get();
    if (!latest.exists) continue;

    const data = latest.data()!;
    const startedAtMs = timestampToMillis(data.startedAt) ?? timestampToMillis(data.updatedAt);
    if (startedAtMs === null || startedAtMs > cutoffMs) continue;

    const didComplete = await db.runTransaction(async (t) => {
      const current = await t.get(candidate.ref);
      if (!current.exists) return false;

      const currentData = current.data()!;
      const currentStartedAtMs = timestampToMillis(currentData.startedAt) ?? timestampToMillis(currentData.updatedAt);
      if (
        (currentData.status !== "active" && currentData.status !== "paused") ||
        currentStartedAtMs === null ||
        currentStartedAtMs > cutoffMs
      ) {
        return false;
      }

      const openMatches = await t.get(
        db.collection(`sessions/${candidate.id}/matches`).where("status", "in", ["scheduled", "in_progress"]),
      );

      t.update(candidate.ref, {
        status: "completed",
        autoCompletedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      for (const match of openMatches.docs) {
        t.update(match.ref, {
          status: "cancelled",
          isLocked: true,
          cancelledAt: FieldValue.serverTimestamp(),
          cancelReason: "session_auto_completed",
        });
      }
      writeAudit(t, candidate.id, {
        actorUid: "system",
        action: "session_auto_completed",
        details: {
          reason: "session_started_over_24_hours_ago",
          startedAtMs: currentStartedAtMs,
        },
      });
      return true;
    });

    if (didComplete) completed += 1;
  }

  return { scanned: candidates.size, completed };
}
