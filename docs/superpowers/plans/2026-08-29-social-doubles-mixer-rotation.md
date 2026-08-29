# Social Doubles Mixer Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve DuoRally social doubles scheduling so casual squads get roughly equal court time while seeing fewer repeated partners and more varied opponents.

**Architecture:** Keep the current continuous live rotation model: seed all active courts once, then refill only freed courts as matches complete. Strengthen the pure TypeScript match engine with a social freshness score, then surface player-facing copy and exact-capacity guidance in the web app. Preserve stored `sessionFormat: "social_rotation"` for compatibility while renaming the visible mode to Social Doubles Mixer.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, Next.js App Router, Firebase/Firestore server actions, `@picklebaddies/match-engine`, `@picklebaddies/domain`.

## Global Constraints

- Singles rotation is out of scope.
- Fixed Pair Round Robin remains separate and must not regress.
- Completed matches, scheduled visible matches, scores, and rankings must not be rewritten.
- The scheduler must prioritize court-time fairness and the no-back-to-back-sit-out shield before rating balance.
- Sit-out fairness and variety are close peers: early fairness leads; once repetition grows, variety may temporarily outrank strict sit-out rhythm when game-count spread stays acceptable.
- Avoid repeated partners wherever possible.
- Prefer different opponents; if a fully fresh opponent set is impossible, choose at least one opponent change where possible.
- Keep the engine pure TypeScript with no Firebase or I/O imports.
- Keep stored `sessionFormat` values as `"social_rotation"` and `"fixed_pair_round_robin"`.
- Do not hold courts empty by default for exact-capacity sessions.
- Use player-facing copy that describes outcomes, not algorithm weights.

---

## File Structure

- `packages/match-engine/src/penalty.ts`: Owns team split scoring. Extend `Weights`, add explicit social freshness terms, and keep `bestTeamSplit` / `foursomePenalty` as the public scoring functions used by `round.ts`.
- `packages/match-engine/src/penalty.test.ts`: New focused tests for repeated partner, last partner, opponent changes, repeated foursome, and rating balance ordering.
- `packages/match-engine/src/round.ts`: Keep `buildRound` as the single scheduling entry point. Use the stronger `foursomePenalty` for court candidates and update the seat-choice tie score so fairness ties choose fresher games.
- `packages/match-engine/src/round.test.ts`: Add behavioral tests for partner avoidance, opponent-change preference, deterministic tie breaking, and fairness relaxation limits.
- `packages/match-engine/src/continuous.test.ts`: Add multi-court continuous simulations that mimic ordinary social nights with 9-14 players.
- `apps/web/src/app/(app)/sessions/new/page.tsx`: Rename the visible social format option and add short benefit copy.
- `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`: Rename the live format label and show exact-capacity guidance for active social sessions.
- `docs/plans/2026-08-29-social-doubles-mixer-rotation-design.md`: Existing approved design reference. Do not edit unless product requirements change.

---

### Task 1: Strengthen Social Freshness Penalties

**Files:**
- Modify: `packages/match-engine/src/penalty.ts`
- Create: `packages/match-engine/src/penalty.test.ts`

**Interfaces:**
- Consumes: `EngineState`, `pairKey`, `balanceRatingFromSkill`, `FoursomePlayer`.
- Produces: `Weights` with fields `repeatPartner`, `sameLastPartner`, `repeatOpponent`, `recentOpponent`, `noOpponentChange`, `repeatedFoursome`, and `skillGap`.
- Produces: `bestTeamSplit(s: EngineState, four: FoursomePlayer[], w?: Weights): TeamSplit`.
- Produces: `foursomePenalty(s: EngineState, four: FoursomePlayer[], w?: Weights): number`.

- [ ] **Step 1: Write focused penalty tests**

Create `packages/match-engine/src/penalty.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bestTeamSplit, foursomePenalty } from "./penalty.js";
import { createInitialState, pairKey, recordMatch } from "./state.js";
import type { EnginePlayer } from "./types.js";

const players: EnginePlayer[] = ["a", "b", "c", "d"].map((id) => ({
  playerId: id,
  displayName: id,
  skillLevel: "unknown",
}));
const fp = (id: string) => ({ playerId: id, skillLevel: "unknown" as const });

describe("social freshness penalty", () => {
  it("avoids a repeated partner before using skill balance", () => {
    const state = createInitialState(players);
    state.partnerCount.set(pairKey("a", "b"), 2);
    state.lastPartner.set("a", "b");
    state.lastPartner.set("b", "a");

    const split = bestTeamSplit(state, [fp("a"), fp("b"), fp("c"), fp("d")]);

    expect(split.teamA.includes("a") && split.teamA.includes("b")).toBe(false);
    expect(split.teamB.includes("a") && split.teamB.includes("b")).toBe(false);
  });

  it("prefers at least one opponent change over repeating both opponents", () => {
    const state = createInitialState(players);
    state.lastOpponents.set("a", new Set(["c", "d"]));
    state.lastOpponents.set("b", new Set(["c", "d"]));
    state.lastOpponents.set("c", new Set(["a", "b"]));
    state.lastOpponents.set("d", new Set(["a", "b"]));
    state.opponentCount.set(pairKey("a", "c"), 3);
    state.opponentCount.set(pairKey("a", "d"), 3);
    state.opponentCount.set(pairKey("b", "c"), 3);
    state.opponentCount.set(pairKey("b", "d"), 3);

    const repeatedOpponents = bestTeamSplit(state, [fp("a"), fp("b"), fp("c"), fp("d")]);

    expect(repeatedOpponents.penalty).toBeGreaterThan(40);
  });

  it("charges a repeated foursome even when teams can be swapped", () => {
    const state = createInitialState(players);
    recordMatch(state, 1, ["a", "b"], ["c", "d"]);
    recordMatch(state, 2, ["a", "c"], ["b", "d"]);
    recordMatch(state, 3, ["a", "d"], ["b", "c"]);

    expect(foursomePenalty(state, [fp("a"), fp("b"), fp("c"), fp("d")])).toBeGreaterThan(30);
  });
});
```

- [ ] **Step 2: Run tests to verify the new suite fails before code changes**

Run: `pnpm --filter @picklebaddies/match-engine test -- src/penalty.test.ts`

Expected: FAIL because `sameLastPartner`, `noOpponentChange`, and `repeatedFoursome` behavior is not implemented yet.

- [ ] **Step 3: Extend `Weights` and defaults**

In `packages/match-engine/src/penalty.ts`, replace the `Weights` interface and `DEFAULT_WEIGHTS` with:

```ts
export interface Weights {
  repeatPartner: number;
  sameLastPartner: number;
  repeatOpponent: number;
  recentOpponent: number;
  noOpponentChange: number;
  repeatedFoursome: number;
  skillGap: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  repeatPartner: 50,
  sameLastPartner: 80,
  repeatOpponent: 6,
  recentOpponent: 8,
  noOpponentChange: 28,
  repeatedFoursome: 36,
  skillGap: 1,
};
```

- [ ] **Step 4: Add helper functions in `penalty.ts`**

Insert these helpers above `splitPenalty`:

```ts
function pairHistoryCount(s: EngineState, a: string, b: string): number {
  const key = pairKey(a, b);
  return (s.partnerCount.get(key) ?? 0) + (s.opponentCount.get(key) ?? 0);
}

function allPlayersHaveMet(s: EngineState, p: FoursomePlayer[]): boolean {
  for (let i = 0; i < p.length; i++) {
    for (let j = i + 1; j < p.length; j++) {
      if (pairHistoryCount(s, p[i]!.playerId, p[j]!.playerId) === 0) return false;
    }
  }
  return true;
}

function noOpponentChangePenalty(
  s: EngineState,
  player: FoursomePlayer,
  opponents: [FoursomePlayer, FoursomePlayer],
  w: Weights,
): number {
  const last = s.lastOpponents.get(player.playerId);
  if (!last || last.size === 0) return 0;
  return opponents.every((opponent) => last.has(opponent.playerId)) ? w.noOpponentChange : 0;
}
```

- [ ] **Step 5: Update `splitPenalty` to use the new terms**

Replace the existing partner/opponent body in `splitPenalty` with this scoring shape:

```ts
let pen = 0;

const partnerPairs: Array<[FoursomePlayer, FoursomePlayer]> = [[a1, a2], [b1, b2]];
for (const [x, y] of partnerPairs) {
  pen += w.repeatPartner * (s.partnerCount.get(pairKey(x.playerId, y.playerId)) ?? 0);
  if (s.lastPartner.get(x.playerId) === y.playerId) pen += w.sameLastPartner;
  if (s.lastPartner.get(y.playerId) === x.playerId) pen += w.sameLastPartner;
}

for (const a of [a1, a2]) {
  const opponents: [FoursomePlayer, FoursomePlayer] = [b1, b2];
  pen += noOpponentChangePenalty(s, a, opponents, w);
  for (const b of opponents) {
    pen += w.repeatOpponent * (s.opponentCount.get(pairKey(a.playerId, b.playerId)) ?? 0);
    if (s.lastOpponents.get(a.playerId)?.has(b.playerId)) pen += w.recentOpponent;
  }
}
for (const b of [b1, b2]) {
  pen += noOpponentChangePenalty(s, b, [a1, a2], w);
}

if (allPlayersHaveMet(s, p)) pen += w.repeatedFoursome;

const teamA = teamStrength(a1, a2);
const teamB = teamStrength(b1, b2);
pen += w.skillGap * (Math.abs(teamA - teamB) / 100);
```

- [ ] **Step 6: Run the focused penalty tests**

Run: `pnpm --filter @picklebaddies/match-engine test -- src/penalty.test.ts`

Expected: PASS.

- [ ] **Step 7: Run existing match-engine tests**

Run: `pnpm --filter @picklebaddies/match-engine test`

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add packages/match-engine/src/penalty.ts packages/match-engine/src/penalty.test.ts
git commit -m "Tune social doubles freshness scoring"
```

---

### Task 2: Use Freshness Scoring For Seat Choice And Court Groups

**Files:**
- Modify: `packages/match-engine/src/round.ts`
- Modify: `packages/match-engine/src/round.test.ts`

**Interfaces:**
- Consumes: `foursomePenalty(s, four, w)` from `penalty.ts`.
- Keeps: `buildRound(state, players, courts, roundNumber, order?): RoundResult`.
- Keeps: `pickCourtFoursomes(state, pool, byId, order, groupCount): Foursome[]` private function.
- Keeps: `chooseWhoPlays(state, available, courtCount, order, roundNumber, w?): SitOutResult` private function.

- [ ] **Step 1: Add a test that a fresh partner beats a stale seeded choice**

Append to `packages/match-engine/src/round.test.ts`:

```ts
it("breaks sit-out ties by avoiding a repeated partner", () => {
  const six: EnginePlayer[] = ["a", "b", "c", "d", "e", "f"].map((id) => ({
    playerId: id,
    displayName: id,
    skillLevel: "unknown",
  }));
  const state = createInitialState(six);
  const oneCourt: EngineCourt[] = [{ courtId: "c1", name: "Court 1", courtNumber: 1 }];

  for (const id of ["a", "b", "c", "d", "e", "f"]) {
    state.gamesPlayed.set(id, 4);
    state.sitOuts.set(id, 0);
    state.playStreak.set(id, 0);
  }
  recordMatch(state, 1, ["a", "b"], ["c", "d"]);
  recordMatch(state, 2, ["a", "b"], ["c", "e"]);
  recordMatch(state, 3, ["a", "b"], ["d", "e"]);

  const result = buildRound(state, six, oneCourt, 4);
  const match = result.matches[0]!;
  const teamWithA = match.teamA.includes("a") ? match.teamA : match.teamB;

  expect(teamWithA).not.toContain("b");
});
```

- [ ] **Step 2: Add a test for at least one opponent change**

Append to `packages/match-engine/src/round.test.ts`:

```ts
it("prefers a lineup where at least one opponent changes", () => {
  const six: EnginePlayer[] = ["a", "b", "c", "d", "e", "f"].map((id) => ({
    playerId: id,
    displayName: id,
    skillLevel: "unknown",
  }));
  const state = createInitialState(six);
  const oneCourt: EngineCourt[] = [{ courtId: "c1", name: "Court 1", courtNumber: 1 }];

  for (const id of ["a", "b", "c", "d", "e", "f"]) {
    state.gamesPlayed.set(id, 5);
    state.sitOuts.set(id, 0);
    state.playStreak.set(id, 0);
  }
  recordMatch(state, 1, ["a", "b"], ["c", "d"]);
  recordMatch(state, 2, ["a", "b"], ["c", "d"]);
  recordMatch(state, 3, ["a", "e"], ["b", "f"]);

  const result = buildRound(state, six, oneCourt, 4);
  const onCourt = new Set([...result.matches[0]!.teamA, ...result.matches[0]!.teamB]);

  expect(onCourt.has("e") || onCourt.has("f")).toBe(true);
});
```

- [ ] **Step 3: Run the new tests to verify current behavior**

Run: `pnpm --filter @picklebaddies/match-engine test -- src/round.test.ts`

Expected: PASS after Task 1. If either test already passes before Task 2 edits, keep it as regression coverage and continue with the cleanup below.

- [ ] **Step 4: Replace pair-only `groupFamiliarity` with split-aware scoring for four-player groups**

In `packages/match-engine/src/round.ts`, replace `groupFamiliarity` with:

```ts
function groupFamiliarity(s: EngineState, ids: string[], byId: Map<string, EnginePlayer>, w: Weights): number {
  if (ids.length === PLAYERS_PER_MATCH) {
    return foursomePenalty(s, ids.map((id) => toFoursomePlayer(id, byId)), w);
  }

  let total = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const key = pairKey(ids[i]!, ids[j]!);
      total += w.repeatPartner * (s.partnerCount.get(key) ?? 0)
             + w.repeatOpponent * (s.opponentCount.get(key) ?? 0);
    }
  }
  return total;
}
```

- [ ] **Step 5: Pass `byId` into the seat-choice scorer**

Change the `scoreSitters` body in `chooseWhoPlays` to:

```ts
const scoreSitters = (sitters: string[]) => {
  const sittingSet = new Set(sitters);
  const lineup = available.filter((id) => !sittingSet.has(id));
  return groupFamiliarity(state, lineup, byId, w) + groupFamiliarity(state, sitters, byId, w);
};
```

Update the `chooseWhoPlays` signature to receive `byId`:

```ts
function chooseWhoPlays(
  state: EngineState,
  available: string[],
  courtCount: number,
  order: Map<string, number>,
  roundNumber: number,
  byId: Map<string, EnginePlayer>,
  w: Weights = DEFAULT_WEIGHTS,
): SitOutResult {
```

Update the `buildRound` call site:

```ts
const { playing, sitting } = chooseWhoPlays(
  state,
  players.map((p) => p.playerId),
  courts.length,
  order,
  roundNumber,
  byId,
);
```

- [ ] **Step 6: Keep fairness relaxation expensive**

In the relaxed sit-out block in `chooseWhoPlays`, keep this threshold:

```ts
if (relaxedBest && strict.score - relaxedBest.score >= w.repeatPartner) {
  if (!best || relaxedBest.score < best.score) best = relaxedBest;
}
```

This keeps the existing rule: spend one sit-out only when freshness improves by at least one full repeated-partner penalty.

- [ ] **Step 7: Run focused round tests**

Run: `pnpm --filter @picklebaddies/match-engine test -- src/round.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add packages/match-engine/src/round.ts packages/match-engine/src/round.test.ts
git commit -m "Use social freshness in rotation choices"
```

---

### Task 3: Add Continuous Social-Night Simulations

**Files:**
- Modify: `packages/match-engine/src/continuous.test.ts`

**Interfaces:**
- Consumes: `buildRound(state, idlePlayers, freedCourts, cycle, order)`.
- Consumes: `createInitialState(players)`.
- Produces: regression coverage for 9-player/2-court and 14-player/3-court social rotation behavior.

- [ ] **Step 1: Add helper functions for partner and opponent counts**

Append these helpers near the existing `ids` and `byId` helpers in `packages/match-engine/src/continuous.test.ts`:

```ts
function partnerKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function countPartnerRepeats(matches: Array<{ teamA: [string, string]; teamB: [string, string] }>): number {
  const counts = new Map<string, number>();
  for (const match of matches) {
    for (const team of [match.teamA, match.teamB]) {
      const key = partnerKey(team[0], team[1]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
}

function playersIn(match: { teamA: [string, string]; teamB: [string, string] }): [string, string, string, string] {
  return [...match.teamA, ...match.teamB] as [string, string, string, string];
}
```

- [ ] **Step 2: Add a 10-player two-court simulation test**

Append this test inside `describe("continuous per-court scheduling", () => { ... })`:

```ts
it("keeps partner repeats low during an ordinary 10-player two-court social night", () => {
  const all = players(10);
  const map = byId(all);
  const cs = courts(2);
  const state = createInitialState(all);
  const order = seededOrder(ids(all), 11);
  const played: Array<{ teamA: [string, string]; teamB: [string, string] }> = [];

  let cycle = 1;
  const seed = buildRound(state, all, cs, cycle, order);
  for (const match of seed.matches) played.push({ teamA: match.teamA, teamB: match.teamB });

  const onCourt: Record<string, [string, string, string, string]> = {};
  for (const match of seed.matches) onCourt[match.courtId] = playersIn(match);
  let waiting = seed.sitOuts.map((s) => s.playerId);

  for (let i = 0; i < 16; i++) {
    const court = cs[i % cs.length]!;
    const idleIds = [...onCourt[court.courtId]!, ...waiting];
    cycle += 1;
    const next = buildRound(state, idleIds.map((id) => map.get(id)!), [court], cycle, order);
    for (const match of next.matches) played.push({ teamA: match.teamA, teamB: match.teamB });
    onCourt[court.courtId] = playersIn(next.matches[0]!);
    waiting = next.sitOuts.map((s) => s.playerId);
  }

  const sitCounts = ids(all).map((id) => state.sitOuts.get(id) ?? 0);
  expect(Math.max(...sitCounts) - Math.min(...sitCounts)).toBeLessThanOrEqual(1);
  expect(countPartnerRepeats(played)).toBeLessThanOrEqual(played.length / 3);
});
```

- [ ] **Step 3: Add a 14-player three-court simulation test**

Append:

```ts
it("keeps sit-outs bounded while mixing a 14-player three-court session", () => {
  const all = players(14);
  const map = byId(all);
  const cs = courts(3);
  const state = createInitialState(all);
  const order = seededOrder(ids(all), 19);

  let cycle = 1;
  const seed = buildRound(state, all, cs, cycle, order);
  const onCourt: Record<string, [string, string, string, string]> = {};
  for (const match of seed.matches) onCourt[match.courtId] = playersIn(match);
  let waiting = seed.sitOuts.map((s) => s.playerId);

  for (let i = 0; i < 24; i++) {
    const court = cs[i % cs.length]!;
    const idleIds = [...onCourt[court.courtId]!, ...waiting];
    cycle += 1;
    const next = buildRound(state, idleIds.map((id) => map.get(id)!), [court], cycle, order);
    expect(next.matches.length).toBe(1);
    onCourt[court.courtId] = playersIn(next.matches[0]!);
    waiting = next.sitOuts.map((s) => s.playerId);
  }

  const sitCounts = ids(all).map((id) => state.sitOuts.get(id) ?? 0);
  const gameCounts = ids(all).map((id) => state.gamesPlayed.get(id) ?? 0);
  expect(Math.max(...sitCounts) - Math.min(...sitCounts)).toBeLessThanOrEqual(1);
  expect(Math.max(...gameCounts) - Math.min(...gameCounts)).toBeLessThanOrEqual(2);
});
```

- [ ] **Step 4: Run continuous tests**

Run: `pnpm --filter @picklebaddies/match-engine test -- src/continuous.test.ts`

Expected: PASS.

- [ ] **Step 5: Run full match-engine test and build**

Run: `pnpm --filter @picklebaddies/match-engine test`

Expected: PASS.

Run: `pnpm --filter @picklebaddies/match-engine build`

Expected: PASS and `packages/match-engine/dist` is refreshed.

- [ ] **Step 6: Commit Task 3**

```bash
git add packages/match-engine/src/continuous.test.ts packages/match-engine/dist
git commit -m "Cover continuous social mixer fairness"
```

---

### Task 4: Rename Social Rotation In The UI And Explain Exact Capacity

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/new/page.tsx`
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`

**Interfaces:**
- Consumes: existing `sessionFormat` state values `"social_rotation" | "fixed_pair_round_robin"`.
- Produces: visible social format label `Social Doubles Mixer`.
- Produces: exact-capacity organizer guidance only for non-round-robin sessions.

- [ ] **Step 1: Update session setup option copy**

In `apps/web/src/app/(app)/sessions/new/page.tsx`, replace the social format option:

```tsx
{ value: "social_rotation", label: "Social Doubles Mixer", hint: "Mix partners, share court time" },
```

Keep the round-robin option:

```tsx
{ value: "fixed_pair_round_robin", label: "Round robin", hint: "Fixed teams, every matchup" },
```

- [ ] **Step 2: Update the setup hero suffix**

Change the hero suffix for social sessions to:

```tsx
{sessionFormat === "fixed_pair_round_robin" ? " · round robin" : " · mixer"}
```

- [ ] **Step 3: Update the live format label**

In `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`, replace:

```ts
const sessionFormatLabel = isRoundRobinSession ? "round robin" : "social rotation";
```

with:

```ts
const sessionFormatLabel = isRoundRobinSession ? "round robin" : "Social Doubles Mixer";
```

- [ ] **Step 4: Add exact-capacity detection in the live page**

Near the existing derived values around `activeCourts` and `activePlayers`, add:

```ts
const socialCourtCapacity = activeCourts.length * 4;
const isExactSocialCapacity =
  !isRoundRobinSession &&
  activeCourts.length > 0 &&
  activePlayers.length === socialCourtCapacity;
const isNearSocialCapacity =
  !isRoundRobinSession &&
  activeCourts.length > 0 &&
  activePlayers.length > 4 &&
  Math.abs(activePlayers.length - socialCourtCapacity) <= 1;
```

- [ ] **Step 5: Render short organizer guidance**

Place this near the live console status summary where active players and courts are already visible:

```tsx
{canManageLive && (isExactSocialCapacity || isNearSocialCapacity) && (
  <div style={{
    border: "1px solid var(--border)",
    borderRadius: "var(--r-lg)",
    background: "var(--surface-sunken)",
    padding: "0.75rem 0.875rem",
    color: "var(--text-2)",
    fontSize: "0.8125rem",
    lineHeight: 1.45,
  }}>
    {isExactSocialCapacity
      ? "Everyone will get maximum court time, but groups may repeat. Add a spare player or use fewer courts if you want more mixing."
      : "This player-to-court mix is tight. DuoRally will still share court time fairly, with variety improving when a spare player or court gap appears."}
  </div>
)}
```

- [ ] **Step 6: Run web typecheck**

Run: `pnpm --filter @picklebaddies/web typecheck`

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add "apps/web/src/app/(app)/sessions/new/page.tsx" "apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx"
git commit -m "Rename social mixer session format"
```

---

### Task 5: Final Verification And Release Candidate Commit

**Files:**
- No new source files beyond Tasks 1-4.
- Verify: `packages/match-engine/src/penalty.ts`
- Verify: `packages/match-engine/src/round.ts`
- Verify: `packages/match-engine/src/continuous.test.ts`
- Verify: `apps/web/src/app/(app)/sessions/new/page.tsx`
- Verify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`

**Interfaces:**
- Confirms: engine package builds before web checks.
- Confirms: social session format storage remains `"social_rotation"`.
- Confirms: Fixed Pair Round Robin tests still pass.

- [ ] **Step 1: Run match-engine tests**

Run: `pnpm --filter @picklebaddies/match-engine test`

Expected: PASS.

- [ ] **Step 2: Build match-engine**

Run: `pnpm --filter @picklebaddies/match-engine build`

Expected: PASS.

- [ ] **Step 3: Run domain tests for round robin**

Run: `pnpm --filter @picklebaddies/domain test -- src/round-robin.test.ts`

Expected: PASS.

- [ ] **Step 4: Build domain after public API checks**

Run: `pnpm --filter @picklebaddies/domain build`

Expected: PASS.

- [ ] **Step 5: Run web typecheck**

Run: `pnpm --filter @picklebaddies/web typecheck`

Expected: PASS.

- [ ] **Step 6: Inspect changed files**

Run: `git diff --stat`

Expected: Only the files listed in this plan have source changes.

Run: `git status --short`

Expected: No unrelated unstaged source changes are staged for this feature.

- [ ] **Step 7: Create a final checkpoint commit if Tasks 1-4 were batched**

Use this only if the executor batched multiple tasks without committing each task:

```bash
git add packages/match-engine/src/penalty.ts packages/match-engine/src/penalty.test.ts packages/match-engine/src/round.ts packages/match-engine/src/round.test.ts packages/match-engine/src/continuous.test.ts "apps/web/src/app/(app)/sessions/new/page.tsx" "apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx"
git commit -m "Improve social doubles mixer rotation"
```

---

## Self-Review

- Spec coverage: The plan covers continuous live rotation, partner-repeat avoidance, opponent-change preference, fair sit-outs, no back-to-back sit-outs, skill balance after social fairness, exact-capacity explanation, visible Social Doubles Mixer naming, and Fixed Pair Round Robin protection.
- Deferred-marker scan: no blank markers, vague implementation requests, or unspecified file targets remain.
- Type consistency: The only public engine entry point remains `buildRound`; `Weights`, `bestTeamSplit`, and `foursomePenalty` stay in `penalty.ts`; UI storage keeps `"social_rotation"` and `"fixed_pair_round_robin"`.
- Risk notes: The numeric penalty weights should be adjusted only through failing or flaky Vitest evidence. If simulation thresholds are too strict for deterministic continuous play, first inspect the generated match sequence before loosening an assertion.
