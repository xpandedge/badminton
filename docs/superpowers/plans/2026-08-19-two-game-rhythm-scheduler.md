# Two-Game Rhythm Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a soft default "two games on, then natural rest" rhythm to live-session scheduling without weakening fairness.

**Architecture:** Store a `playStreak` map in the pure match-engine `EngineState`. Update the streak when matches and sit-outs are recorded, persist it through the web server's Firestore engine-state serializer, and use it as a late sit-out ranking tie-breaker after recent-sit, sit-out-count, and games-played fairness.

**Tech Stack:** TypeScript, Vitest, pure `packages/match-engine`, Next.js server-only Firestore helpers in `apps/web/src/server/sessions/scheduling.ts`.

## Global Constraints

- Do not add minutes-played tracking.
- Keep `packages/match-engine` pure with no Firebase or I/O imports.
- Preserve the existing recent sit-out shield.
- Preserve games-played catch-up fairness over rhythm.
- Existing persisted engine states without `playStreak` must continue to work.

---

## File Structure

- `packages/match-engine/src/state.ts` owns `EngineState`, `createInitialState`, `recordMatch`, `recordSitOut`, and locked-state seeding. Add `playStreak` here.
- `packages/match-engine/src/sitouts.ts` owns sit-out candidate ranking. Add the rhythm tie-breaker here only after fairness comparisons.
- `packages/match-engine/src/state.test.ts` verifies state mutation semantics.
- `packages/match-engine/src/sitouts.test.ts` verifies sit-out ranking behavior.
- `apps/web/src/server/sessions/scheduling.ts` serializes/deserializes engine state for Firestore and rebuilds state from assignments.

### Task 1: Add `playStreak` State

**Files:**
- Modify: `packages/match-engine/src/state.ts`
- Test: `packages/match-engine/src/state.test.ts`

**Interfaces:**
- Produces: `EngineState.playStreak: Map<string, number>`
- Produces: `recordMatch(...)` increments `playStreak` for the four players in the match.
- Produces: `recordSitOut(...)` resets `playStreak` for the sitting player.

- [ ] **Step 1: Write the failing tests**

```ts
it("tracks consecutive played games and resets when sitting out", () => {
  const s = createInitialState(players);
  recordMatch(s, 1, ["p1", "p2"], ["p3", "p4"]);
  expect(s.playStreak.get("p1")).toBe(1);
  recordMatch(s, 2, ["p1", "p3"], ["p2", "p4"]);
  expect(s.playStreak.get("p1")).toBe(2);
  recordSitOut(s, "p1", 3);
  expect(s.playStreak.get("p1")).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.\node_modules\.bin\vitest.CMD run src\state.test.ts`

- [ ] **Step 3: Implement state changes**

Add `playStreak` to `EngineState`, initialize it to zero for each player, increment it in `recordMatch`, and reset it to zero in `recordSitOut`.

- [ ] **Step 4: Run state tests**

Run: `.\node_modules\.bin\vitest.CMD run src\state.test.ts`

### Task 2: Add Rhythm Tie-Breaker

**Files:**
- Modify: `packages/match-engine/src/sitouts.ts`
- Test: `packages/match-engine/src/sitouts.test.ts`

**Interfaces:**
- Consumes: `EngineState.playStreak`
- Produces: sit-out ranking that prefers higher `playStreak` only after recent-sit, sit-out-count, and games-played fairness.

- [ ] **Step 1: Write failing ranking tests**

```ts
it("uses two-game rhythm as a tie-breaker when fairness is equal", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const s = createInitialState(ids.map((id) => ({ playerId: id, displayName: id, skillLevel: "unknown", availableFromRound: 1 })));
  for (const id of ids) {
    s.gamesPlayed.set(id, 2);
    s.sitOuts.set(id, 0);
    s.playStreak.set(id, id === "b" ? 2 : 1);
  }
  const order = new Map(ids.map((id, index) => [id, index]));
  expect(selectSitOuts(s, ids, 1, order, 3).sitting).toEqual(["b"]);
});
```

- [ ] **Step 2: Write fairness guard test**

```ts
it("does not rest a lagging player just because they have a rhythm streak", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const s = createInitialState(ids.map((id) => ({ playerId: id, displayName: id, skillLevel: "unknown", availableFromRound: 1 })));
  for (const id of ids) {
    s.sitOuts.set(id, 0);
    s.gamesPlayed.set(id, id === "a" ? 1 : 2);
    s.playStreak.set(id, id === "a" ? 2 : 0);
  }
  const order = new Map(ids.map((id, index) => [id, index]));
  expect(selectSitOuts(s, ids, 1, order, 3).sitting).not.toEqual(["a"]);
});
```

- [ ] **Step 3: Implement ranking**

After the games-played comparison, compare capped streaks with `Math.min(playStreak, 2)` so two or more recent games beat zero or one recent game, then fall back to deterministic order.

- [ ] **Step 4: Run sit-out tests**

Run: `.\node_modules\.bin\vitest.CMD run src\sitouts.test.ts`

### Task 3: Persist `playStreak`

**Files:**
- Modify: `apps/web/src/server/sessions/scheduling.ts`

**Interfaces:**
- Consumes: `EngineState.playStreak`
- Produces: `FirestoreEngineState.playStreak?: Record<string, number>` backward-compatible with old documents.

- [ ] **Step 1: Add serializer field**

Add `playStreak: rec(state.playStreak)` to `serializeEngineState`.

- [ ] **Step 2: Add deserializer fallback**

Deserialize with `new Map(Object.entries(data.playStreak ?? {}))`. Missing values read as zero in engine logic.

- [ ] **Step 3: Rebuild state chronologically**

In `buildEngineStateFromAssignments`, apply matches and sit-outs in `roundNumber` order so a sit-out reset from an earlier round is not applied after a later match.

- [ ] **Step 4: Run web typecheck**

Run: `node_modules\.bin\tsc.cmd -p apps\web\tsconfig.json --noEmit`

### Task 4: Verification

**Files:**
- Test only

**Interfaces:**
- Produces: passing match-engine tests and web typecheck.

- [ ] **Step 1: Run focused engine tests**

Run from `packages/match-engine`: `.\node_modules\.bin\vitest.CMD run src\state.test.ts src\sitouts.test.ts src\continuous.test.ts`

- [ ] **Step 2: Run engine typecheck**

Run: `node_modules\.bin\tsc.cmd -p packages\match-engine\tsconfig.json --noEmit`

- [ ] **Step 3: Run web typecheck**

Run: `node_modules\.bin\tsc.cmd -p apps\web\tsconfig.json --noEmit`
