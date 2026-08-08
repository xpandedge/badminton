# M6: Rebalancing + Mid-Session Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mid-session, an organiser can add a late player, remove/mark a player left/no-show, manually swap players or move a match, disable a court — then regenerate **future rounds only** while completed and in-progress matches stay untouched, with a human-readable rebalance summary and full audit trail.

**Architecture:** `rebalanceSession` (Cloud Function, PRD §16.2/§14.9) treats completed + in-progress matches as locked, recomputes player stats from those locked matches, deletes unlocked future matches, and calls the pure engine in `mode:"rebalance"` (round count from remaining time, DELTA_SPEC D4). Late players get `availableFromRound = currentRound + 1`; players marked `left|removed|no_show` are filtered out before the engine sees them (DELTA_SPEC D7). All of it runs in a batch/transaction and writes a `generationRun` + audit log; the summary is generated from the before/after diff.

**Tech Stack:** Cloud Functions, Firestore transactions, `@picklebaddies/match-engine`, `@picklebaddies/domain`, Next.js 15.

**Prerequisites:** M5 processed (live session, generate, score, lifecycle, mapping).

**PRD refs:** §12.10, §12.11, §13 rules, §14.9, §16.2/16.4, §23 (leave/late/court-unavailable/delay). **DELTA_SPEC:** D2 (disable court), D4 (remaining-time rounds), D7 (status filtering).

---

## File Structure

`packages/domain/src/rebalance-summary.ts` — pure `buildRebalanceSummary(before, after)` → string (PRD §12.11 example) + test.

`functions/src/`
- `lib/locked.ts` — `collectLockedMatches(sessionId)`, `recomputeStatsFromLocked(...)` (PRD §14.9 steps 1–4).
- `rebalanceSession.ts` — callable (PRD §16.2).
- `updatePlayerStatus.ts` — callable (PRD §16.4).
- `manualOverride.ts` — `swapPlayers`, `moveMatch` callables (PRD §12.10).
- `lib/mapping.ts` — **modify**: honor `availableFromRound` for late joiners + exclude non-schedulable.
- `index.ts` — **modify**: export new callables.

`apps/web/src/lib/sessions/`
- `rebalance.ts` — client callers for rebalance/status/override + `watchGenerationRuns`.

`apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx` — **modify**: add/remove player, mark status, manual swap/move, disable court, "Rebalance future rounds" with summary modal.

`apps/web/firestore.live.rules.test.ts` — **modify**: confirm status/override still function-only writes.

---

## Task 1: Rebalance summary (pure, TDD)

**Files:** Create `packages/domain/src/rebalance-summary.ts`, `rebalance-summary.test.ts`; modify `index.ts`.

- [ ] **Step 1: Failing test** mirrors PRD §12.11:
```typescript
import { describe, it, expect } from "vitest";
import { buildRebalanceSummary } from "./rebalance-summary.js";

describe("buildRebalanceSummary", () => {
  it("describes preserved matches and roster changes", () => {
    const s = buildRebalanceSummary({
      completedPreserved: 2, inProgressPreserved: 1,
      removed: ["Ravi"], addedFromRound: [{ name: "Anita", round: 4 }],
      minGames: 3, maxGames: 4,
    });
    expect(s).toContain("2 completed matches preserved");
    expect(s).toContain("1 current match preserved");
    expect(s).toContain("Ravi removed from future rounds");
    expect(s).toContain("Anita added from Round 4");
    expect(s).toContain("3–4");
  });
});
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `rebalance-summary.ts`:
```typescript
export interface RebalanceSummaryInput {
  completedPreserved: number; inProgressPreserved: number;
  removed: string[]; addedFromRound: Array<{ name: string; round: number }>;
  minGames: number; maxGames: number;
}
export function buildRebalanceSummary(i: RebalanceSummaryInput): string {
  const parts = ["Future rounds regenerated.",
    `${i.completedPreserved} completed matches preserved.`,
    `${i.inProgressPreserved} current match preserved.`];
  for (const r of i.removed) parts.push(`${r} removed from future rounds.`);
  for (const a of i.addedFromRound) parts.push(`${a.name} added from Round ${a.round}.`);
  parts.push(`Expected games per active player: ${i.minGames}–${i.maxGames}.`);
  return parts.join(" ");
}
```
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(domain): rebalance summary builder`.

---

## Task 2: Locked-match helpers (functions)

**Files:** Create `functions/src/lib/locked.ts`.

- [ ] **Step 1: Implement** (PRD §14.9 steps 1–4):
  - `collectLockedMatches(sessionId)` → all matches with `status in (completed, in_progress)` mapped to engine `LockedMatch` + the count split (completed vs in_progress).
  - `recomputeStatsFromLocked(lockedMatches, scoringMode)` → per-player `{ gamesPlayed, wins, losses, pointsFor, pointsAgainst }` derived **only** from completed matches (in-progress have no score yet); reuse `deriveWinner`/stat math from domain.
- [ ] **Step 2: Verify** `pnpm --filter @picklebaddies/functions build` → 0. **Step 3: Commit** `feat(functions): locked-match collection + stat recompute`.

---

## Task 3: `updatePlayerStatus` (PRD §16.4, D7)

**Files:** Create `functions/src/updatePlayerStatus.ts`; modify `index.ts`.

- [ ] **Step 1: Implement** callable:
  - `requireGroupRole(uid, groupId, canManageSessionPlayers)`;
  - set `sessions/{id}/players/{spId}.status` to one of `active|waiting|left|removed|no_show` (validate against `SessionPlayerStatus`); set `leftAt` when leaving;
  - **status is session-level, not per-round** (DELTA_SPEC D7);
  - audit `player`/`updated`;
  - return `{ rebalanceRecommended: session.status === "active" }` so the UI can prompt (PRD §16.4 "allow organiser to trigger rebalance").
- [ ] **Step 2: Export** + build → 0. **Step 3: Commit** `feat(functions): updatePlayerStatus (session-level, D7)`.

---

## Task 4: Add late player + `availableFromRound` mapping

**Files:** Modify `functions/src/lib/mapping.ts`; add `addLatePlayer` to `functions/src/updatePlayerStatus.ts` (or a small `roster.ts`).

- [ ] **Step 1: addLatePlayer** — organiser adds a group player (or approves a join request) into an **active** session: writes session-player with `status:"active"`, `joinedAt`, and records that they should enter from the next round. Late entry is represented to the engine via `availableFromRound = session.currentRoundNumber + 1` (PRD §23 "add to future rounds only").
- [ ] **Step 2: mapping.ts** — when building `EngineInput` for rebalance: include only `isSchedulable(status)` players (excludes `left|removed|no_show|waiting`, DELTA_SPEC D7); set each player's `availableFromRound` (1 for existing, `currentRound+1` for late joiners).
- [ ] **Step 3: Verify** build → 0. **Step 4: Commit** `feat(functions): late-player add + availableFromRound mapping`.

---

## Task 5: `rebalanceSession` (PRD §16.2 / §14.9)

**Files:** Create `functions/src/rebalanceSession.ts`; modify `index.ts`.

- [ ] **Step 1: Implement** callable, transactional (PRD §14.9 full sequence):
  1. `requireGroupRole(uid, groupId, canGenerateSchedule)`; reject unless session `active|paused`.
  2. `collectLockedMatches` → locked set + preserved counts.
  3. `recomputeStatsFromLocked` → write corrected `players` + `leaderboard` (so a mid-session edit can't drift).
  4. delete unlocked **future** matches (rounds > currentRound that are `scheduled`); keep `generationRuns` + `auditLogs` (PRD §20.4).
  5. `generateSchedule(mapInput(mode:"rebalance", elapsedRounds:currentRound, lockedMatches))` — round count from remaining time (D4).
  6. write new future rounds/matches/sitOuts.
  7. write `generationRuns` (trigger `manual_rebalance|player_added|player_removed|settings_changed`).
  8. write audit `generation`/`rebalanced`.
  9. build + return `buildRebalanceSummary(before/after diff)`.
- [ ] **Step 2: Export** + build → 0. **Step 3: Commit** `feat(functions): rebalanceSession preserving locked, future-only regen (D4/D7)`.

---

## Task 6: Manual override — swap players / move match / disable court

**Files:** Create `functions/src/manualOverride.ts`; modify `index.ts`.

- [ ] **Step 1: swapPlayers(sessionId, matchId, outPlayerId, inPlayerId)** — only on a **future** (`scheduled`, not locked) match (PRD §12.10 "completed matches cannot be changed unless explicitly unlocked"); swap within the embedded team array, update cached name/skill, audit `match`/`updated`.
- [ ] **Step 2: moveMatch(sessionId, matchId, courtId)** — reassign `courtId`/`courtName` on a future match; reject if target court not in `session.courts` or inactive (D2); audit.
- [ ] **Step 3: disableCourt(sessionId, courtId)** — set that entry `isActive:false` in `session.courts` (D2); return `{ rebalanceRecommended: true }`.
- [ ] **Step 4: Export** + build → 0. **Step 5: Commit** `feat(functions): manual override (swap/move/disable court) on future matches`.

---

## Task 7: Live console UI — roster + rebalance

**Files:** Create `apps/web/src/lib/sessions/rebalance.ts`; modify `app/(app)/sessions/[sessionId]/live/page.tsx`.

- [ ] **Step 1: Client callers** — `rebalance.ts` wraps `rebalanceSession`, `updatePlayerStatus`, `addLatePlayer`, `swapPlayers`, `moveMatch`, `disableCourt`; `watchGenerationRuns`.
- [ ] **Step 2: UI (organiser-gated)** — add player mid-session, mark player left/no-show/waiting, swap players in a future match, move a match's court, disable a court. After any of these, if `rebalanceRecommended`, show "Rebalance future rounds" → calls `rebalanceSession` → shows the returned **summary in a modal** (PRD §12.11). Completed/in-progress matches render locked (no edit affordance).
- [ ] **Step 3: Verify** `pnpm --filter @picklebaddies/web build` → 0. **Step 4: Commit** `feat(web): mid-session roster controls + rebalance summary modal`.

---

## Task 8: Verification + processed

- [ ] **Step 1:** `pnpm -r test` (domain summary + others) → green.
- [ ] **Step 2:** `pnpm -r typecheck` → 0; functions `build` → 0.
- [ ] **Step 3:** `pnpm --filter @picklebaddies/web test:rules` → PASS.
- [ ] **Step 4:** Manual (PRD §26.3 scenario 4): 16 players / 4 courts → Generate → Start → score round 1 → remove 1 player → Rebalance → confirm round 1 unchanged, future rounds exclude the removed player, summary reads correctly. Then add a late player → Rebalance → they appear only from the next round. Disable a court → Rebalance → matches fit remaining courts.
- [ ] **Step 5: Commit** `chore(m6): verification pass`.
- [ ] **Step 6: Mark processed**:
```bash
git mv docs/superpowers/plans/2026-06-06-m6-rebalancing.md docs/superpowers/plans/processed/2026-06-06-m6-rebalancing.md
git commit -m "chore(plans): mark M6 processed"
```

---

## Self-Review (acceptance mapping)

- §12.10 swap players, move court, mark unavailable, completed immutable, logged → Tasks 3, 6. ✅
- §12.11 completed/in-progress preserved, future regen, late included from next round, removed excluded, balanced, summary → Tasks 1, 4, 5. ✅
- §13 rules (left/removed/no_show excluded) → Task 4 mapping. ✅
- §14.9 regeneration sequence → Task 5. ✅
- §16.2/16.4 functions → Tasks 5, 3. ✅
- §23 leave / late / court-unavailable → Tasks 3, 4, 6. ✅
- D2 disable court → Task 6. D4 remaining-time rounds → Task 5. D7 status filtering + session-level status → Tasks 3, 4. ✅

**Deferred to M7:** stale-listener polling fallback, security-rule hardening sweep, seed/demo data, deploy. **Phase 2 (not now):** unlock-completed-match workflow, player-submitted scores for approval.
