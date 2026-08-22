import { describe, expect, it } from "vitest";
import {
  getSquadPurgeAfter,
  getTimestampMillis,
  isSquadArchived,
  isSquadPurgeDue,
  SQUAD_ARCHIVE_RETENTION_MS,
} from "./squad-archive.js";

describe("squad archive policy", () => {
  const nowMs = Date.parse("2026-08-22T12:00:00.000Z");

  it("sets the purge deadline exactly two days after archive time", () => {
    expect(SQUAD_ARCHIVE_RETENTION_MS).toBe(2 * 24 * 60 * 60 * 1000);
    expect(getSquadPurgeAfter(nowMs)).toBe(nowMs + SQUAD_ARCHIVE_RETENTION_MS);
  });

  it("reads Firestore-like timestamps, dates, numbers, and date strings", () => {
    const firestoreTimestamp = { toMillis: () => nowMs };

    expect(getTimestampMillis(firestoreTimestamp)).toBe(nowMs);
    expect(getTimestampMillis(new Date(nowMs))).toBe(nowMs);
    expect(getTimestampMillis(nowMs)).toBe(nowMs);
    expect(getTimestampMillis("2026-08-22T12:00:00.000Z")).toBe(nowMs);
  });

  it("returns null for missing or invalid timestamps", () => {
    expect(getTimestampMillis(undefined)).toBeNull();
    expect(getTimestampMillis(null)).toBeNull();
    expect(getTimestampMillis(Number.NaN)).toBeNull();
    expect(getTimestampMillis("not a timestamp")).toBeNull();
    expect(getTimestampMillis({ toMillis: () => Number.POSITIVE_INFINITY })).toBeNull();
  });

  it("detects archived squads from a valid archivedAt value", () => {
    expect(isSquadArchived({ archivedAt: { toMillis: () => nowMs } })).toBe(true);
    expect(isSquadArchived({ archivedAt: nowMs })).toBe(true);
    expect(isSquadArchived({})).toBe(false);
    expect(isSquadArchived({ archivedAt: "not a timestamp" })).toBe(false);
  });

  it("treats the exact purge deadline as due", () => {
    const purgeAfter = nowMs + SQUAD_ARCHIVE_RETENTION_MS;

    expect(isSquadPurgeDue({ purgeAfter }, nowMs)).toBe(false);
    expect(isSquadPurgeDue({ purgeAfter }, purgeAfter - 1)).toBe(false);
    expect(isSquadPurgeDue({ purgeAfter }, purgeAfter)).toBe(true);
    expect(isSquadPurgeDue({ purgeAfter }, purgeAfter + 1)).toBe(true);
    expect(isSquadPurgeDue({}, purgeAfter)).toBe(false);
    expect(isSquadPurgeDue({ purgeAfter: "not a timestamp" }, purgeAfter)).toBe(false);
  });
});
