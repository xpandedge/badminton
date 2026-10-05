import { describe, expect, it } from "vitest";
import type { BoardMatch } from "./board";
import { advanceTv, currentTvMatches, initialTvState, tvPage } from "./tv";

const match = (court: number, id = `m${court}`, roundNumber = 1): BoardMatch => ({
  matchId: id, courtId: `c${court}`, courtName: `Court ${court}`, roundNumber,
  status: "scheduled", teamA: [], teamB: [], winnerTeam: null, teamAScore: null, teamBScore: null,
});
const courts = Array.from({ length: 6 }, (_, i) => `c${i + 1}`);
const matches = courts.map((_, i) => match(i + 1));

describe("TV presentation", () => {
  it("rotates four then two without resetting on a refresh", () => {
    let state = advanceTv(initialTvState(), matches, 0);
    state = advanceTv(state, [...matches], 9000);
    expect(tvPage(state, courts, 9999)).toEqual(courts.slice(0, 4));
    expect(tvPage(state, courts, 10000)).toEqual(courts.slice(4));
    expect(tvPage(state, courts, 20000)).toEqual(courts.slice(0, 4));
    expect(state.pending).toHaveLength(0);
  });
  it("shows simultaneous assignments together, holds them, then resumes", () => {
    let state = advanceTv(initialTvState(), matches, 0);
    const next = matches.map((m, i) => i >= 4 ? match(i + 1, `new${i}`) : m);
    state = advanceTv(state, next, 3000);
    expect(tvPage(state, courts, 3000).slice(0, 2)).toEqual(["c5", "c6"]);
    state = advanceTv(state, next, 22999);
    expect(state.pending).toHaveLength(2);
    state = advanceTv(state, next, 23000);
    expect(state.pending).toHaveLength(0);
  });
  it("queues more than four assignments without starving later courts", () => {
    let state = advanceTv(initialTvState(), matches, 0);
    const next = courts.map((_, i) => match(i + 1, `new${i}`));
    state = advanceTv(state, next, 1000);
    expect(tvPage(state, courts, 1000)).toEqual(courts.slice(0, 4));
    state = advanceTv(state, next, 21000);
    expect(tvPage(state, courts, 21000).slice(0, 2)).toEqual(courts.slice(4));
  });
  it("gives an assignment arriving near expiry its own full display time", () => {
    let state = advanceTv(initialTvState(), matches, 0);
    let next = [match(1, "new1"), ...matches.slice(1)];
    state = advanceTv(state, next, 1000);
    next = [next[0]!, match(2, "new2"), ...matches.slice(2)];
    state = advanceTv(state, next, 20000);
    state = advanceTv(state, next, 21000);
    expect(state.pending.map(p => p.courtId)).toEqual(["c2"]);
    state = advanceTv(state, next, 39999);
    expect(state.pending.map(p => p.courtId)).toEqual(["c2"]);
    state = advanceTv(state, next, 40000);
    expect(state.pending).toHaveLength(0);
  });
  it("drops cancelled announcements and baselines after a connection gap", () => {
    let state = advanceTv(initialTvState(), matches, 0);
    const next = [match(1, "new"), ...matches.slice(1)];
    state = advanceTv(state, next, 1000);
    expect(state.pending).toHaveLength(1);
    state = advanceTv(state, matches.slice(1), 2000);
    expect(state.pending).toHaveLength(0);
    state = advanceTv(state, next, 3000, true);
    expect(state.pending).toHaveLength(0);
  });
  it("does not call a future-round assignment to a free court", () => {
    expect(currentTvMatches([match(1), match(2, "future", 2)], ["c1", "c2"], true).map(m => m.matchId)).toEqual(["m1"]);
    expect(currentTvMatches([match(1), match(2, "refill", 2)], ["c1", "c2"]).map(m => m.matchId)).toEqual(["m1", "refill"]);
  });
  it("prefers in-progress matches and detects changed teams on the same id", () => {
    const playing = { ...match(1, "playing"), status: "in_progress" };
    expect(currentTvMatches([match(1), playing], ["c1"])[0]!.matchId).toBe("playing");
    let state = advanceTv(initialTvState(), matches, 0);
    state = advanceTv(state, [{ ...matches[0]!, teamA: [{ playerId: "new-player", displayName: "New" }] }, ...matches.slice(1)], 1);
    expect(state.pending).toHaveLength(1);
  });
});
