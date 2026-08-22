import { describe, expect, it } from "vitest";
import { toPlain } from "./serialize";

// Stand-in for firebase-admin's Timestamp: a class instance exposing toDate().
class FakeTimestamp {
  constructor(private readonly ms: number) {}
  toDate() {
    return new Date(this.ms);
  }
}

describe("toPlain", () => {
  it("converts a Firestore Timestamp to a Date", () => {
    const out = toPlain(new FakeTimestamp(1_700_000_000_000));
    expect(out).toBeInstanceOf(Date);
    expect((out as unknown as Date).getTime()).toBe(1_700_000_000_000);
  });

  it("converts every timestamp field in a session document", () => {
    // The real failure: only startsAt was converted, so updatedAt stayed a class
    // instance and the whole payload became unserializable.
    const doc = {
      id: "s1",
      name: "Saturday Smashers",
      startsAt: new FakeTimestamp(1_700_000_000_000),
      createdAt: new FakeTimestamp(1_600_000_000_000),
      updatedAt: new FakeTimestamp(1_650_000_000_000),
      cancelledAt: null,
      venueId: null,
      courtCount: 2,
    };

    const out = toPlain(doc) as Record<string, unknown>;

    expect(out.startsAt).toBeInstanceOf(Date);
    expect(out.createdAt).toBeInstanceOf(Date);
    expect(out.updatedAt).toBeInstanceOf(Date);
    expect(out.cancelledAt).toBeNull();
    expect(out.name).toBe("Saturday Smashers");
    expect(out.courtCount).toBe(2);
  });

  it("recurses through nested objects and arrays", () => {
    const out = toPlain({
      courts: [{ name: "Court 1", addedAt: new FakeTimestamp(1) }],
      meta: { nested: { at: new FakeTimestamp(2) } },
    }) as any;

    expect(out.courts[0].addedAt).toBeInstanceOf(Date);
    expect(out.meta.nested.at).toBeInstanceOf(Date);
    expect(out.courts[0].name).toBe("Court 1");
  });

  it("leaves already-plain values untouched", () => {
    const date = new Date(5);
    expect(toPlain("text")).toBe("text");
    expect(toPlain(7)).toBe(7);
    expect(toPlain(false)).toBe(false);
    expect(toPlain(null)).toBeNull();
    expect(toPlain(undefined)).toBeUndefined();
    expect(toPlain(date)).toBe(date);
  });

  it("produces output that survives JSON serialization", () => {
    const out = toPlain({ updatedAt: new FakeTimestamp(1_650_000_000_000) });
    expect(() => JSON.stringify(out)).not.toThrow();
  });
});
