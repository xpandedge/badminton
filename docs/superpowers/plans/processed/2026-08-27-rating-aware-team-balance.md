# Rating-Aware Team Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use squad ratings for members and admin-entered skill levels for guests to make doubles team splits more competitive without changing fair rotation rules.

**Architecture:** Keep `packages/match-engine` pure by adding an optional numeric `balanceRating` to engine players and split candidates. The web server scheduling mapper passes stored member `squadRating` when present; otherwise the engine falls back to a deterministic skill-to-rating conversion for guests and unrated players.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, pure match-engine package, Next.js server actions.

## Global Constraints

- Rotation fairness remains the hard rule: sit-outs, games played, and repeat player history are not replaced by ratings.
- Ratings are a soft team-balance signal used during doubles split scoring.
- Members use their per-squad `squadRating` when available.
- Guests use the admin-provided `beginner | intermediate | advanced | unknown` skill level converted internally to a temporary balance rating.
- `packages/match-engine` must remain pure with no Firebase or web imports.

---

### Task 1: Add Rating-Aware Split Tests

**Files:**
- Modify: `packages/match-engine/src/penalty.test.ts`

**Interfaces:**
- Consumes: `bestTeamSplit(state, four)`
- Produces: test coverage proving `balanceRating` outranks coarse skill balance only inside the existing split penalty model.

- [ ] **Step 1: Write the failing test**

```ts
it("uses numeric balance ratings when present", () => {
  const players: EnginePlayer[] = ["strongA", "strongB", "guestA", "guestB"].map((id) => ({
    playerId: id,
    displayName: id,
    skillLevel: "intermediate",
    availableFromRound: 1,
  }));
  const s = createInitialState(players);

  const split = bestTeamSplit(s, [
    { playerId: "strongA", skillLevel: "intermediate", balanceRating: 1200 },
    { playerId: "strongB", skillLevel: "intermediate", balanceRating: 1180 },
    { playerId: "guestA", skillLevel: "intermediate", balanceRating: 1000 },
    { playerId: "guestB", skillLevel: "intermediate", balanceRating: 980 },
  ]);

  const strongTogether = (
    split.teamA.includes("strongA") && split.teamA.includes("strongB")
  ) || (
    split.teamB.includes("strongA") && split.teamB.includes("strongB")
  );
  expect(strongTogether).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @picklebaddies/match-engine exec vitest run src/penalty.test.ts`
Expected: FAIL because `balanceRating` is not part of `FoursomePlayer`.

- [ ] **Step 3: Implement minimal code**

Add `balanceRating?: number` to `EnginePlayer` and `FoursomePlayer`, calculate team strength from numeric ratings when valid, and pass `balanceRating` from `round.ts` into penalty candidates.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @picklebaddies/match-engine exec vitest run src/penalty.test.ts`
Expected: PASS.

### Task 2: Add Guest Skill Rating Fallback

**Files:**
- Modify: `packages/match-engine/src/types.ts`
- Modify: `packages/match-engine/src/penalty.test.ts`

**Interfaces:**
- Produces: `balanceRatingFromSkill(skillLevel: SkillLevel): number`

- [ ] **Step 1: Write the failing test**

```ts
it("converts admin skill levels to temporary balance ratings", () => {
  expect(balanceRatingFromSkill("beginner")).toBe(900);
  expect(balanceRatingFromSkill("intermediate")).toBe(1000);
  expect(balanceRatingFromSkill("advanced")).toBe(1120);
  expect(balanceRatingFromSkill("unknown")).toBe(1000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @picklebaddies/match-engine exec vitest run src/penalty.test.ts`
Expected: FAIL because `balanceRatingFromSkill` does not exist.

- [ ] **Step 3: Implement minimal code**

Export `SKILL_BALANCE_RATING` and `balanceRatingFromSkill` from `types.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @picklebaddies/match-engine exec vitest run src/penalty.test.ts`
Expected: PASS.

### Task 3: Pass Ratings From Web Scheduling

**Files:**
- Modify: `apps/web/src/server/sessions/scheduling.ts`
- Modify: `apps/web/src/server/sessions/actions.ts`
- Modify: `apps/web/src/server/sessions/players.ts`
- Modify: `apps/web/src/server/sessions/rsvp-public.ts`
- Modify: `apps/web/src/server/sessions/rsvp-session-players.ts`
- Modify: `apps/web/src/server/sessions/rsvp-session-players.test.ts`

**Interfaces:**
- Consumes: session player fields `{ squadRating?: number; skillLevel?: string }`
- Produces: `EnginePlayer.balanceRating` for valid positive `squadRating`; otherwise undefined so the engine uses skill fallback.

- [ ] **Step 1: Update mapper input type**

Allow `toEnginePlayers` to read `squadRating?: number | string`.

- [ ] **Step 2: Implement rating coercion**

Use a small local helper:

```ts
function validBalanceRating(value: unknown): number | undefined {
  const rating = Number(value);
  return Number.isFinite(rating) && rating > 0 ? rating : undefined;
}
```

- [ ] **Step 3: Pass the rating into engine players**

Set `balanceRating: validBalanceRating(p.squadRating)`.

- [ ] **Step 4: Copy member ratings into session players**

When registered squad players are materialized into `sessions/{sessionId}/players`, copy a valid positive `groups/{groupId}/players/{playerId}.squadRating` into the session player document. Public/session guests do not receive a stored squad rating and continue to use skill fallback.

- [ ] **Step 5: Run focused verification**

Run:
- `pnpm --filter @picklebaddies/match-engine test`
- `pnpm --filter @picklebaddies/match-engine build`
- `pnpm --filter @picklebaddies/web typecheck`
- `pnpm --filter @picklebaddies/web exec vitest run src/server/sessions/rsvp-session-players.test.ts`

Expected: all pass, or any environment limitation is reported separately from source behavior.
