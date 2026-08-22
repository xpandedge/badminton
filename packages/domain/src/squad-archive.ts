export const SQUAD_ARCHIVE_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

type TimestampLike = {
  toMillis: () => unknown;
};

export function getSquadPurgeAfter(nowMs: number = Date.now()): number {
  return nowMs + SQUAD_ARCHIVE_RETENTION_MS;
}

export function getTimestampMillis(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (value instanceof Date) {
    const milliseconds = value.getTime();
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const numericValue = Number(trimmed);
    if (Number.isFinite(numericValue)) return numericValue;

    const parsedValue = Date.parse(trimmed);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  if (typeof value === "object" && value !== null && "toMillis" in value) {
    const timestamp = value as Partial<TimestampLike>;
    if (typeof timestamp.toMillis !== "function") return null;

    try {
      const milliseconds = timestamp.toMillis();
      return typeof milliseconds === "number" && Number.isFinite(milliseconds)
        ? milliseconds
        : null;
    } catch {
      return null;
    }
  }

  return null;
}

export function isSquadArchived(data: { archivedAt?: unknown }): boolean {
  return getTimestampMillis(data.archivedAt) !== null;
}

export function isSquadPurgeDue(
  data: { purgeAfter?: unknown },
  nowMs: number = Date.now(),
): boolean {
  const purgeAfterMs = getTimestampMillis(data.purgeAfter);
  return purgeAfterMs !== null && Number.isFinite(nowMs) && purgeAfterMs <= nowMs;
}
