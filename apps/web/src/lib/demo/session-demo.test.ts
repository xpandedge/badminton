import { describe, expect, it } from "vitest";
import { DEMO_SNAPSHOTS } from "./session-demo";

describe("sample session scenarios", () => {
  it("keeps every player in exactly one place", () => {
    for (const sample of Object.values(DEMO_SNAPSHOTS)) {
      const names = sample.courts.flatMap(c => [...c.teamA, ...c.teamB]).concat([...sample.waiting]);
      expect(new Set(names).size).toBe(names.length);
    }
  });
  it("refills only the finished court and includes waiting players", () => {
    const before = DEMO_SNAPSHOTS.playing;
    const after = DEMO_SNAPSHOTS["court-finished"];
    expect(after.courts[1]).toEqual(before.courts[1]);
    const playing = [...after.courts[0]!.teamA, ...after.courts[0]!.teamB];
    expect(playing).toEqual(expect.arrayContaining([...before.waiting]));
    expect(after.waiting).toHaveLength(2);
  });
  it("adds a late player without disturbing current games", () => {
    expect(DEMO_SNAPSHOTS["late-arrival"].courts).toEqual(DEMO_SNAPSHOTS.playing.courts);
    expect(DEMO_SNAPSHOTS["late-arrival"].waiting).toEqual([...DEMO_SNAPSHOTS.playing.waiting, "Ruby"]);
  });
});
