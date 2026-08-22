import "server-only";

/**
 * Convert Firestore values into something React can send to a Client Component.
 *
 * Firestore returns Timestamps as class instances. React refuses to serialize
 * those across the server/client boundary and throws:
 *
 *   Only plain objects, and a few built-ins, can be passed to Client Components
 *   from Server Components. Classes or null prototypes are not supported.
 *
 * In production that surfaces as an opaque "an error occurred" with the message
 * stripped, and the calling page renders as if there were simply no data — so
 * spreading raw `doc.data()` into a payload fails silently and looks like
 * missing records rather than a crash.
 *
 * Dates are fine to pass, so Timestamps become Dates. Anything already plain is
 * returned untouched.
 */
function isTimestampLike(value: unknown): value is { toDate: () => Date } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  );
}

export function toPlain<T>(value: T): T {
  if (value === null || value === undefined) return value;

  // Timestamps (and anything else exposing toDate) become Dates.
  if (isTimestampLike(value)) return value.toDate() as unknown as T;

  // Dates are already serializable; don't recurse into them.
  if (value instanceof Date) return value;

  if (Array.isArray(value)) {
    return value.map((item) => toPlain(item)) as unknown as T;
  }

  if (typeof value === "object") {
    // Only recurse into plain objects. A class instance we don't recognise is
    // left alone rather than silently flattened into something lossy.
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = toPlain(item);
    }
    return out as T;
  }

  return value;
}
