# Live Score Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make live scoring resistant to accidental double taps and keep current court assignments stable while future games continue to use the scheduling algorithm.

**Architecture:** The live organiser page owns per-match pending score UI state. Server rebalance preserves currently scheduled matches so background roster/court updates do not reshuffle visible unscored cards; next-game creation continues through the existing score transaction auto-fill.

**Tech Stack:** Next.js App Router, React state, TypeScript, Firebase server actions, Playwright for live-flow coverage.

## Global Constraints

- Preserve completed and current visible unscored matches; do not disturb a court card before its score is entered.
- Manual dropdown swaps apply only to the visible unscored card and must not trigger an immediate algorithmic shuffle.
- Future assignments after score entry must be created by the existing fair scheduling algorithm.
- Keep internal statuses such as `scheduled` unchanged; only adjust user-facing live-page labels.
- Remove the primary "Shuffle Next Games" live control from routine organiser workflow.
- Do not rename `/groups`, Firestore collections, or server action identifiers.

---

### Task 1: Score Submission Pending State

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`
- Test: `apps/web/e2e/live-edit.spec.ts`

**Interfaces:**
- Consumes: existing `submitWinner(matchId: string, winnerTeam: "A" | "B")`.
- Produces: local `submittingScoreByMatchId: Record<string, true>` and `isSubmittingScore`.

- [ ] **Step 1: Add the failing Playwright expectation**

Update the live-edit spec to click a score button and assert that the same card's controls are disabled while submission is in flight. Use an existing `match-card` locator and the `score-winner-a` or `save-score-btn` test id.

- [ ] **Step 2: Run the focused test**

Run: `pnpm --filter @picklebaddies/web exec playwright test apps/web/e2e/live-edit.spec.ts`

Expected: FAIL because buttons do not currently expose a pending disabled state.

- [ ] **Step 3: Implement pending state**

In `live/page.tsx`, add:

```tsx
const [submittingScoreByMatchId, setSubmittingScoreByMatchId] = useState<Record<string, true>>({});
```

In `submitWinner`, return early when the match id is already pending, set the match id before awaiting `enterScore`, and clear it in `finally`.

- [ ] **Step 4: Disable controls and show saving copy**

Inside `renderMatchCard`, compute:

```tsx
const isSubmittingScore = submittingScoreByMatchId[m.id] === true;
```

Disable point inputs and score buttons for that match. Use labels such as `Saving...`, `A Wins`, and `B Wins`.

- [ ] **Step 5: Verify**

Run the focused Playwright test again. If the local emulator is unavailable, run the closest TypeScript check and record the emulator blocker.

### Task 2: Current Assignment Label And Background Rebalance

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`
- Modify: `apps/web/src/server/sessions/rebalance.ts`

**Interfaces:**
- Consumes: existing `handleRebalance(trigger?: string)` and `rebalanceSession(sessionId, trigger)`.
- Produces: background roster/court rebalance with no confirmation modal and server preservation of visible scheduled matches.

- [ ] **Step 1: Change the live-card label**

In `renderMatchCard`, show `Ready to score` for unscored `scheduled` matches. Keep completed/cancelled labels unchanged.

- [ ] **Step 2: Remove roster/court shuffle confirmation prompts**

In `handlePlayerStatus`, `handleAddSessionGuest`, and `handleDisableCourt`, when `rebalanceRecommended` is true, call `await handleRebalance(...)` directly. Do not show a second confirmation modal.

- [ ] **Step 3: Remove the manual shuffle control**

Remove the `rebalance-btn` button from the live session primary controls. Keep the underlying `handleRebalance` helper for background use.

- [ ] **Step 4: Preserve visible scheduled matches during rebalance**

In `apps/web/src/server/sessions/rebalance.ts`, stop cancelling all `scheduled` matches. Treat current scheduled matches as protected when computing busy player ids and occupied court ids, then generate only for idle players and idle active courts. Keep completed stats recomputation unchanged.

- [ ] **Step 5: Keep summary honest**

Set cancelled count to `0` for the protected-current path and keep `regenerated` equal to the number of new future/current-fill matches created.

- [ ] **Step 6: Verify**

Run `pnpm --filter @picklebaddies/web build` or the local TypeScript binary. Manually inspect that manual `swapPlayers` remains separate and does not call rebalance.

## Self-Review

- Spec coverage: pending score lock, clearer label, no manual shuffle prompt, manual swap preservation, and future algorithmic scheduling are all covered.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: the plan uses existing `submitWinner`, `handleRebalance`, and `rebalanceSession` names.
