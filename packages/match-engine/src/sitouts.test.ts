import { describe, it, expect } from "vitest";
import { selectSitOuts } from "./sitouts.js";
import { createInitialState } from "./state.js";

describe("selectSitOuts", () => {
  it("9 players, 2 courts -> exactly 1 sits (PRD scenario 5)", () => {
    const ids = Array.from({ length: 9 }, (_, i) => `p${i}`);
    const s = createInitialState(ids.map((id) => ({ playerId: id, displayName: id, skillLevel: "unknown", availableFromRound: 1 })));
    const { playing, sitting } = selectSitOuts(s, ids, 2);
    expect(sitting.length).toBe(1);
    expect(playing.length).toBe(8);
  });
  it("prefers to sit players who have sat out the least... no: who have sat out the FEWEST keep priority to PLAY", () => {
    const ids = ["a","b","c","d","e"];
    const s = createInitialState(ids.map((id) => ({ playerId: id, displayName: id, skillLevel: "unknown", availableFromRound: 1 })));
    s.sitOuts.set("a", 0); s.sitOuts.set("b", 0); s.sitOuts.set("c", 0); s.sitOuts.set("d", 0); s.sitOuts.set("e", 2);
    const { sitting } = selectSitOuts(s, ids, 1); // 5 -> 4 play, 1 sits

    // We want the person with fewest sit-outs to have priority to play.
    // So the person sitting should be someone with MORE sit-outs? No wait!
    // PRD says: "Sit-outs should be distributed as evenly as possible".
    // If 'e' has sat out 2 times and everyone else 0, we want to sit one of 'a', 'b', 'c', or 'd' to catch up!
    // So sitting should NOT be 'e'. It should be 'a' or 'b' or 'c' or 'd'.

    // In fact, since a,b,c,d all have 0 sitouts, and 0 games played, tie break falls to ID.
    // The code says: `const so = (s.sitOuts.get(x) ?? 0) - (s.sitOuts.get(y) ?? 0);`
    // So ascending sit-outs. e has 2, a/b/c/d have 0.
    // So sitting is chosen from the front of ranked array... meaning the ones with FEWEST sit-outs sit first.
    // That spreads out sit-outs!
    expect(sitting).toEqual(["a"]); // a comes first alphabetically among those with 0 sit-outs.
  });

  it("uses two-game rhythm as a tie-breaker when fairness is equal", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const s = createInitialState(ids.map((id) => ({ playerId: id, displayName: id, skillLevel: "unknown", availableFromRound: 1 })));
    for (const id of ids) {
      s.sitOuts.set(id, 0);
      s.gamesPlayed.set(id, 2);
      s.playStreak.set(id, id === "b" ? 2 : 1);
    }
    const order = new Map(ids.map((id, index) => [id, index]));

    const { sitting } = selectSitOuts(s, ids, 1, order, 3);

    expect(sitting).toEqual(["b"]);
  });

  it("does not rest a lagging player just because they have a rhythm streak", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const s = createInitialState(ids.map((id) => ({ playerId: id, displayName: id, skillLevel: "unknown", availableFromRound: 1 })));
    for (const id of ids) {
      s.sitOuts.set(id, 0);
      s.gamesPlayed.set(id, id === "a" ? 1 : 2);
      s.playStreak.set(id, id === "a" ? 2 : 0);
    }
    const order = new Map(ids.map((id, index) => [id, index]));

    const { sitting } = selectSitOuts(s, ids, 1, order, 3);

    expect(sitting).not.toEqual(["a"]);
  });
});
