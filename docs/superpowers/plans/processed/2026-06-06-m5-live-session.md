# M5: Live Session Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An organiser can generate the schedule via a Cloud Function, start the session, advance rounds, and enter scores (both scoring modes); scores lock matches and update the leaderboard atomically; players see their own current/next match live.

**Architecture:** All authoritative writes are Cloud Functions wrapping the pure `match-engine` and Firestore transactions — clients never write matches/leaderboard directly (DELTA_SPEC D3, PRD §19). `submitScore` accepts a **mode-specific payload** (DELTA_SPEC D1) and updates the session-player doc *and* the denormalised leaderboard doc in **one transaction** (single source of truth discipline, DELTA_SPEC minor). The live UI reads cheap denormalised docs (PRD §20.2) via realtime listeners; the player view derives current/next from the round/match docs (DELTA_SPEC D7 — nothing per-round stored on the player).

**Tech Stack:** Firebase Cloud Functions (callable), Firestore transactions/batches, `@picklebaddies/match-engine`, `@picklebaddies/domain`, Next.js 15.

**Prerequisites:** M3 processed (sessions, players, court snapshot, scoring mode, server role guard) **and** M4 processed (real engine).

**PRD refs:** §12.6–12.9, §12.12, §13, §16.1/16.3/16.5, §18, §20.3. **DELTA_SPEC:** D1 (scoring payload + tie-break), D3 (server-only commit), D7, minor (pause/resume, leaderboard double-write).

---

## File Structure

`packages/domain/src/scoring.ts` — **extend**: `deriveWinner(payload, mode)`, `applyScoreToStats(stats, payload, isWinner)`, `leaderboardCompare(a, b, mode)` (DELTA_SPEC D1). + tests.

`functions/src/`
- `lib/mapping.ts` — Firestore docs → `EngineInput` (filters to schedulable players, D7; reads court snapshot, D2).
- `generateSchedule.ts` — callable (PRD §16.1): role check → load → engine → batch write rounds/matches/sitOuts/generationRun/leaderboard init.
- `submitScore.ts` — callable (PRD §16.3, D1): validate → transaction (match → player stats → leaderboard → audit).
- `advanceRound.ts` — callable (PRD §16.5).
- `sessionLifecycle.ts` — `startSession`, `pauseSession`, `resumeSession`, `completeSession` (DELTA_SPEC minor).
- `lib/audit.ts` — `writeAudit(tx/batch, sessionId, entry)`.
- `index.ts` — **modify**: export all.

`apps/web/src/lib/sessions/`
- `live.ts` — client callers + `watchRounds`, `watchMatches`, `watchLeaderboard`, `watchPlayerMatches`.
- `scoring.ts` — thin caller for `submitScore`.

`apps/web/src/app/(app)/sessions/[sessionId]/`
- `live/page.tsx` — organiser live console (rounds, matches, score entry, advance).
- `player/page.tsx` — player self-view (current/next/waiting/results).

`firestore.rules` — **modify**: rounds/matches/leaderboard read for participants; all writes `if false` (functions only).
`apps/web/firestore.live.rules.test.ts` — rules tests.

---

## Task 1: Scoring logic in domain (TDD, D1)

**Files:** Extend `packages/domain/src/scoring.ts`; create/extend `scoring.test.ts`.

- [ ] **Step 1: Failing test**:
```typescript
import { describe, it, expect } from "vitest";
import { deriveWinner, leaderboardCompare } from "./scoring.js";

describe("deriveWinner (DELTA_SPEC D1)", () => {
  it("points mode: higher score wins, ties rejected", () => {
    expect(deriveWinner({ teamAScore: 21, teamBScore: 18 }, "points")).toBe("A");
    expect(() => deriveWinner({ teamAScore: 21, teamBScore: 21 }, "points")).toThrow();
  });
  it("winner_only mode: takes winnerTeam, rejects stray scores", () => {
    expect(deriveWinner({ winnerTeam: "B" }, "winner_only")).toBe("B");
    expect(() => deriveWinner({ teamAScore: 21, teamBScore: 18 }, "winner_only")).toThrow();
  });
});

describe("leaderboardCompare", () => {
  it("points mode: wins, then point diff, then games", () => {
    const a = { wins: 3, pointDifference: 5, gamesPlayed: 4, sitOutCount: 0 };
    const b = { wins: 3, pointDifference: 9, gamesPlayed: 4, sitOutCount: 0 };
    expect(leaderboardCompare(a, b, "points")).toBeGreaterThan(0); // b ranks first
  });
  it("winner_only mode: ignores point diff, uses wins, games, fewer sit-outs", () => {
    const a = { wins: 3, pointDifference: 0, gamesPlayed: 5, sitOutCount: 1 };
    const b = { wins: 3, pointDifference: 0, gamesPlayed: 4, sitOutCount: 0 };
    expect(leaderboardCompare(a, b, "winner_only")).toBeLessThan(0); // a ranks first (more games)
  });
});
```
- [ ] **Step 2: Run** `pnpm --filter @picklebaddies/domain test` → FAIL.
- [ ] **Step 3: Implement** in `scoring.ts`:
```typescript
export type ScorePayload = { teamAScore: number; teamBScore: number } | { winnerTeam: "A" | "B" };

export function deriveWinner(payload: ScorePayload, mode: ScoringMode): "A" | "B" {
  if (mode === "points") {
    if (!("teamAScore" in payload)) throw new Error("points mode requires scores");
    if (payload.teamAScore === payload.teamBScore) throw new Error("ties are not allowed");
    return payload.teamAScore > payload.teamBScore ? "A" : "B";
  }
  if (!("winnerTeam" in payload)) throw new Error("winner_only mode requires winnerTeam");
  return payload.winnerTeam;
}

export interface LeaderboardRow { wins: number; pointDifference: number; gamesPlayed: number; sitOutCount: number; }

/** Returns >0 if b ranks ahead of a (sort comparator semantics). */
export function leaderboardCompare(a: LeaderboardRow, b: LeaderboardRow, mode: ScoringMode): number {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (mode === "points" && b.pointDifference !== a.pointDifference) return b.pointDifference - a.pointDifference;
  if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
  return a.sitOutCount - b.sitOutCount; // fewer sit-outs ranks ahead
}
```
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(domain): scoring winner derivation + mode-aware leaderboard compare (D1)`.

---

## Task 2: Firestore→EngineInput mapping (functions)

**Files:** Create `functions/src/lib/mapping.ts`.

- [ ] **Step 1: Implement** — load session, session players, build `EngineInput`:
  - filter players to `isSchedulable(status)` (DELTA_SPEC D7) plus their `availableFromRound` (default 1; later rounds for late joiners from M6);
  - courts from `session.courts` filtered `isActive` (DELTA_SPEC D2);
  - `mode`, `elapsedRounds`, `lockedMatches` from existing rounds/matches (empty for initial);
  - map `durationMinutes`/`estimatedGameMinutes` straight through.
- [ ] **Step 2: Verify** `pnpm --filter @picklebaddies/functions build` → 0. **Step 3: Commit** `feat(functions): session→EngineInput mapping`.

---

## Task 3: `generateSchedule` Cloud Function (PRD §16.1)

**Files:** Create `functions/src/generateSchedule.ts`, `functions/src/lib/audit.ts`; modify `index.ts`.

- [ ] **Step 1: Implement** callable:
  - `requireGroupRole(uid, session.groupId, canGenerateSchedule)`;
  - reject if session not `draft`/`scheduled` (initial gen only — rebalance is M6);
  - call `generateSchedule(mapInput(...))`;
  - **batch write**: `rounds/{r}`, `rounds/{r}/matches/{m}` (status `scheduled`, `isLocked:false`, embedded team arrays with cached names — PRD §15.10), `sitOuts/{id}`, `generationRuns/{id}` (trigger `initial`, metadata), initialise `leaderboard/{playerId}` rows at zero (PRD §16.1);
  - write audit (`generation`/`created`);
  - return generation summary.
- [ ] **Step 2: Export** + `build` → 0. **Step 3: Commit** `feat(functions): generateSchedule (initial) with batch writes + audit`.

---

## Task 4: `submitScore` Cloud Function (PRD §16.3, D1)

**Files:** Create `functions/src/submitScore.ts`; modify `index.ts`.

- [ ] **Step 1: Implement** callable, **all in one transaction** (PRD §20.3, DELTA_SPEC minor):
  - `requireGroupRole(uid, groupId, canEnterScore)`;
  - load session (for `scoringMode`) + match; reject if match `cancelled`;
  - `winner = deriveWinner(payload, session.scoringMode)` (throws → `invalid-argument`);
  - if match already `completed` (edit path), reverse its prior contribution first, then re-apply, and audit `score_changed` (PRD §12.9 edit + audit);
  - update match (`teamAScore`/`teamBScore` or nulls in winner_only, `winnerTeam`, `status:"completed"`, `isLocked:true`, `completedAt`);
  - update **both** `sessions/{id}/players/{spId}` stats **and** `sessions/{id}/leaderboard/{playerId}` (gamesPlayed, wins/losses, pointsFor/Against, pointDifference) for all four players;
  - write audit (`score`/`score_changed`).
- [ ] **Step 2: Export** + `build` → 0. **Step 3: Commit** `feat(functions): submitScore transaction (D1) + leaderboard + audit`.

---

## Task 5: `advanceRound` + lifecycle functions

**Files:** Create `functions/src/advanceRound.ts`, `functions/src/sessionLifecycle.ts`; modify `index.ts`.

- [ ] **Step 1: startSession** — `requireGroupRole(..., canCreateSession)`; `draft|scheduled → active`; set `currentRoundNumber = 1`, mark round 1 `in_progress`; audit.
- [ ] **Step 2: advanceRound** (PRD §16.5) — `requireGroupRole(..., canAdvanceRound)`; if current round has matches still `scheduled`/`in_progress` without results, return a `needsConfirmation` warning unless `force` is passed; on force, set those matches `cancelled` (don't count, PRD §13); complete current round, set next round `in_progress`, bump `currentRoundNumber`; audit.
- [ ] **Step 3: pauseSession/resumeSession/completeSession** — `active↔paused`, `active→completed`; audit. (DELTA_SPEC minor — resolves orphaned `paused` status.)
- [ ] **Step 4: Export** + `build` → 0. **Step 5: Commit** `feat(functions): advanceRound + session lifecycle (start/pause/resume/complete)`.

---

## Task 6: Live client services + organiser console

**Files:** Create `apps/web/src/lib/sessions/live.ts`, `scoring.ts`; `app/(app)/sessions/[sessionId]/live/page.tsx`.

- [ ] **Step 1: Client callers** — `live.ts`: `httpsCallable` wrappers for generate/advance/lifecycle + watchers `watchRounds`, `watchMatches(roundId)`, `watchLeaderboard` (ordered client-side via `leaderboardCompare` using session `scoringMode`).
- [ ] **Step 2: Organiser console** — gated by `canGenerateSchedule`/`canEnterScore`: "Generate schedule" (draft), per-match score entry (numeric inputs in `points` mode, A/B winner buttons in `winner_only` mode — driven by `session.scoringMode`, DELTA_SPEC D1), "Advance round" (surfaces the confirmation warning), pause/resume/complete. Score entry calls `submitScore` with the mode-correct payload.
- [ ] **Step 3: Verify** `pnpm --filter @picklebaddies/web build` → 0. **Step 4: Commit** `feat(web): organiser live console + score entry (both modes)`.

---

## Task 7: Player self-view (PRD §12.8, D7)

**Files:** Create `apps/web/src/lib/sessions/player-view.ts` (pure helper + test), `app/(app)/sessions/[sessionId]/player/page.tsx`.

- [ ] **Step 1: Failing test** — pure `findPlayerMatch(matches, currentRoundNumber, playerId)` returns `{ current, next, waiting }`: current = a match in `currentRoundNumber` containing the player; next = earliest match in a later round; `waiting=true` when in the session but not in the current round (DELTA_SPEC D7 — derived, never stored).
- [ ] **Step 2: Run** `pnpm --filter @picklebaddies/web test` → FAIL → implement → PASS.
- [ ] **Step 3: Player page** — read-only (no organiser perms, PRD §12.8): shows current match (court, partner, opponents) or waiting, next match, and completed results; updates live via `watchMatches`. Uses the pure helper.
- [ ] **Step 4: Verify** build → 0. **Step 5: Commit** `feat(web): player self-view with derived current/next (D7)`.

---

## Task 8: Live rules + tests

**Files:** Modify `firestore.rules`; create `apps/web/firestore.live.rules.test.ts`.

- [ ] **Step 1: Rules** — under `sessions/{sessionId}`: `rounds/{r}` and `rounds/{r}/matches/{m}` and `leaderboard/{pid}` and `sitOuts/{id}` and `generationRuns/{id}` and `auditLogs/{id}` → `read: if isMember() || isSessionPlayer()`; **`write: if false`** (functions/Admin only — PRD §19.10, D3). Add `isSessionPlayer()` helper (`exists(.../players/$(request.auth.uid))` keyed appropriately, or membership-based read for MVP).
- [ ] **Step 2: Tests** — participant can read matches/leaderboard; **no client can write a match or leaderboard doc**; non-participant denied.
- [ ] **Step 3: Run** `pnpm --filter @picklebaddies/web test:rules` → PASS. **Step 4: Commit** `feat(rules): live read-only for participants, function-only writes`.

---

## Task 9: Verification + processed

- [ ] **Step 1:** `pnpm -r test` (domain scoring + web pure player-view + engine) → green.
- [ ] **Step 2:** `pnpm -r typecheck` → 0; `pnpm --filter @picklebaddies/functions build` → 0.
- [ ] **Step 3:** `pnpm --filter @picklebaddies/web test:rules` → PASS.
- [ ] **Step 4:** Manual (all emulators): from an M3 draft (8 players/2 courts/points) → Generate → Start → enter scores for round 1 → leaderboard updates live → open player view in another window, see current/next → edit a score, confirm leaderboard re-derives and an audit log exists → advance round → repeat. Then run a `winner_only` session and confirm A/B entry + tie-break.
- [ ] **Step 5: Commit** `chore(m5): verification pass`.
- [ ] **Step 6: Mark processed**:
```bash
git mv docs/superpowers/plans/2026-06-06-m5-live-session.md docs/superpowers/plans/processed/2026-06-06-m5-live-session.md
git commit -m "chore(plans): mark M5 processed"
```

---

## Self-Review (acceptance mapping)

- §12.6 generate matchups (server) → Tasks 2, 3. ✅
- §12.7 start session, round in_progress, scores, lock, next round → Tasks 4, 5, 6. ✅
- §12.8 player current/next/waiting/results, no perms, live → Task 7. ✅
- §12.9 score entry, winner calc, edit + audit, locks, leaderboard + stats → Tasks 1, 4. ✅
- §12.12 leaderboard fields + mode-aware sort → Tasks 1, 3, 6. ✅
- §16.1/16.3/16.5 functions → Tasks 3, 4, 5. ✅
- §18 realtime → watchers in Task 6/7 (polling fallback in M7). ✅
- §20.3 transactions for score/leaderboard → Task 4. ✅
- D1 dual payload + tie-break → Tasks 1, 4, 6. D3 function-only writes → Tasks 3,4,8. D7 derived view → Task 7. pause/resume → Task 5. ✅

**Deferred:** rebalance + add/remove player mid-session → M6; polling fallback + index tuning → M7.
