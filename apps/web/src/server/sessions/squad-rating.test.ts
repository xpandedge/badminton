import { describe, expect, it } from "vitest";
import { SQUAD_RATING_START } from "@picklebaddies/domain";
import { applySquadRatingForMatch } from "./squad-rating";

// Minimal Firestore/Transaction stubs. Only the surface applySquadRatingForMatch
// touches is modelled: db.doc(path), t.get(ref), t.update(ref, data).
function makeHarness(existing: Record<string, Record<string, unknown>>) {
  const updates: Array<{ path: string; data: Record<string, unknown> }> = [];

  const db = {
    doc(path: string) {
      return { path };
    },
  } as never;

  const t = {
    async get(ref: { path: string }) {
      const data = existing[ref.path];
      return {
        exists: data !== undefined,
        data: () => data,
      };
    },
    update(ref: { path: string }, data: Record<string, unknown>) {
      updates.push({ path: ref.path, data });
    },
  } as never;

  return { db, t, updates };
}

const GROUP = "g1";
const p = (id: string) => `groups/${GROUP}/players/${id}`;

describe("applySquadRatingForMatch", () => {
  it("rates all four players when every one has a squad player doc", async () => {
    const { db, t, updates } = makeHarness({
      [p("a1")]: { squadRating: 1000 },
      [p("a2")]: { squadRating: 1000 },
      [p("b1")]: { squadRating: 1000 },
      [p("b2")]: { squadRating: 1000 },
    });

    await applySquadRatingForMatch(t, db, {
      groupId: GROUP,
      teamAIds: ["a1", "a2"],
      teamBIds: ["b1", "b2"],
      winnerTeam: "A",
      payload: { teamAScore: 21, teamBScore: 15 },
    });

    expect(updates).toHaveLength(4);
    expect(updates.map((u) => u.path)).toEqual([p("a1"), p("a2"), p("b1"), p("b2")]);
    expect(updates[0]!.data.squadWins).toBe(1);
    expect(updates[2]!.data.squadLosses).toBe(1);
  });

  it("still rates the known players when a guest has no squad player doc", async () => {
    // b2 is a session guest: their session-player doc id is auto-generated and
    // has no groups/{gid}/players counterpart. The other three are regulars and
    // must still be rated for this match.
    const { db, t, updates } = makeHarness({
      [p("a1")]: { squadRating: 1000 },
      [p("a2")]: { squadRating: 1000 },
      [p("b1")]: { squadRating: 1000 },
    });

    await applySquadRatingForMatch(t, db, {
      groupId: GROUP,
      teamAIds: ["a1", "a2"],
      teamBIds: ["b1", "guest-auto-id"],
      winnerTeam: "A",
      payload: { teamAScore: 21, teamBScore: 15 },
    });

    expect(updates.map((u) => u.path)).toEqual([p("a1"), p("a2"), p("b1")]);
    expect(updates.every((u) => Number(u.data.squadGradedGames) === 1)).toBe(true);
  });

  it("treats a missing player as unrated when computing team strength", async () => {
    // The guest still counts toward the opposing team's difficulty at the
    // neutral starting rating, so the maths matches a 1000-rated opponent.
    const withGuest = makeHarness({
      [p("a1")]: { squadRating: 1200 },
      [p("a2")]: { squadRating: 1200 },
      [p("b1")]: { squadRating: 1000 },
    });
    await applySquadRatingForMatch(withGuest.t, withGuest.db, {
      groupId: GROUP,
      teamAIds: ["a1", "a2"],
      teamBIds: ["b1", "guest-auto-id"],
      winnerTeam: "A",
      payload: { teamAScore: 21, teamBScore: 15 },
    });

    const allKnown = makeHarness({
      [p("a1")]: { squadRating: 1200 },
      [p("a2")]: { squadRating: 1200 },
      [p("b1")]: { squadRating: 1000 },
      [p("b2")]: { squadRating: SQUAD_RATING_START },
    });
    await applySquadRatingForMatch(allKnown.t, allKnown.db, {
      groupId: GROUP,
      teamAIds: ["a1", "a2"],
      teamBIds: ["b1", "b2"],
      winnerTeam: "A",
      payload: { teamAScore: 21, teamBScore: 15 },
    });

    expect(withGuest.updates[0]!.data.squadRating).toBe(allKnown.updates[0]!.data.squadRating);
  });

  it("writes nothing when no player has a squad player doc", async () => {
    const { db, t, updates } = makeHarness({});

    await applySquadRatingForMatch(t, db, {
      groupId: GROUP,
      teamAIds: ["x1", "x2"],
      teamBIds: ["x3", "x4"],
      winnerTeam: "A",
      payload: { teamAScore: 21, teamBScore: 15 },
    });

    expect(updates).toHaveLength(0);
  });
});
