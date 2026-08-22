# Global Multi-Court Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve multi-court match generation by selecting all foursomes for a fill together instead of greedily giving the first court the best group.

**Architecture:** Keep sit-outs and team splitting unchanged. In `buildRound`, when two or more courts are being generated and at most twelve players are being placed, partition the playing pool into groups of four, score each full partition by total `foursomePenalty`, and build matches from the lowest-penalty partition. Use the current greedy picker as the fallback.

**Tech Stack:** TypeScript, Vitest, pure `packages/match-engine`.

## Global Constraints

- Apply only when two or more courts are generated in the same fill.
- Leave single-court refills unchanged.
- Keep the existing partner/opponent/skill penalty weights unchanged.
- Do not add minutes tracking, dependencies, Firebase imports, or I/O to `packages/match-engine`.
- Fall back to greedy grouping for more than twelve playing players.

---

## File Structure

- `packages/match-engine/src/round.ts` owns round construction and should contain the partition helper functions near `pickLowestPenaltyFoursome`.
- `packages/match-engine/src/round.test.ts` owns regression coverage for generated rounds.

### Task 1: Add Regression Test

**Files:**
- Modify: `packages/match-engine/src/round.test.ts`

**Interfaces:**
- Consumes: `buildRound(state, players, courts, roundNumber, order)`
- Produces: a failing test that demonstrates lower total relationship penalty across two courts.

- [ ] **Step 1: Add the failing test**

```ts
it("globally balances two courts instead of leaving one court with bad leftovers", () => {
  const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ps: EnginePlayer[] = ids.map((id) => ({
    playerId: id,
    displayName: id,
    skillLevel: "unknown",
    availableFromRound: 1,
  }));
  const state = createInitialState(ps);
  const order = new Map(ids.map((id, index) => [id, index]));

  recordMatch(state, 1, ["e", "f"], ["g", "h"]);
  recordMatch(state, 2, ["a", "b"], ["c", "d"]);
  recordMatch(state, 3, ["a", "b"], ["c", "d"]);

  for (const id of ids) {
    state.gamesPlayed.set(id, 0);
    state.playStreak.set(id, 0);
  }

  const result = buildRound(state, ps, courts, 4, order);
  const groups = result.matches.map((m) => new Set([...m.teamA, ...m.teamB]));

  expect(groups.some((g) => ["a", "b", "c", "d"].every((id) => g.has(id)))).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `packages/match-engine`: `.\node_modules\.bin\vitest.CMD run src\round.test.ts`

### Task 2: Implement Global Grouping

**Files:**
- Modify: `packages/match-engine/src/round.ts`

**Interfaces:**
- Produces: `pickCourtFoursomes(state, pool, byId, order, groupCount): Array<[string, string, string, string]>`
- Keeps: `pickLowestPenaltyFoursome(...)` fallback for one court and larger fills.

- [ ] **Step 1: Add group selection wrapper**

In `buildRound`, replace the per-court direct call to `pickLowestPenaltyFoursome` with a precomputed `foursomes` array. Use global partitioning only when `courtsToUse.length > 1 && playing.length <= 12`.

- [ ] **Step 2: Add deterministic partition enumeration**

Use the first remaining player as the anchor for each recursive branch, combine it with every three-player combination from the rest, recurse on remaining players, and score the full partition by sum of `foursomePenalty`.

- [ ] **Step 3: Add stable tie-break**

When two partitions have equal penalty, compare their sorted group signatures using seeded `order`, then player id.

- [ ] **Step 4: Run focused tests**

Run from `packages/match-engine`: `.\node_modules\.bin\vitest.CMD run src\round.test.ts src\continuous.test.ts`

### Task 3: Verification

**Files:**
- Test only

**Interfaces:**
- Produces: passing tests and typecheck.

- [ ] **Step 1: Run engine tests**

Run from `packages/match-engine`: `.\node_modules\.bin\vitest.CMD run src\round.test.ts src\continuous.test.ts src\sitouts.test.ts src\state.test.ts`

- [ ] **Step 2: Run engine typecheck**

Run: `node_modules\.bin\tsc.cmd -p packages\match-engine\tsconfig.json --noEmit`

- [ ] **Step 3: Run web typecheck**

Run: `node_modules\.bin\tsc.cmd -p apps\web\tsconfig.json --noEmit`
