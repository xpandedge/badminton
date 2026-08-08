# M7: Hardening + Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the MVP production-ready: realtime resilience with a polling fallback, a full security-rules sweep with tests, error/empty/loading states, mobile + accessibility QA, analytics events, seed/demo data, and a first deploy — satisfying PRD §27 MVP acceptance.

**Architecture:** A realtime abstraction wraps Firestore listeners and degrades to interval polling on listener error (PRD §18). A consolidated security-rules pass closes every collection per PRD §19, verified by an emulator rules suite that runs in CI. Analytics events (PRD §22) are emitted from the service layer so they fire once per logical action. Seed data lets anyone demo a full session without manual setup (PRD §30/§31).

**Tech Stack:** Firestore listeners, Firebase Analytics, Firebase Hosting (web framework) + Functions, emulator-based rules tests, Vitest.

**Prerequisites:** M6 processed (full session lifecycle incl. rebalance).

**PRD refs:** §18, §19, §22, §24 (NFRs), §26.2 (integration), §27 (MVP acceptance), §30 (DoD). **DELTA_SPEC:** all invariants must still hold under the final rules.

---

## File Structure

`apps/web/src/lib/realtime/`
- `watchWithFallback.ts` — `watchWithFallback(subscribe, poll, intervalMs)` (PRD §18) + test.

`apps/web/src/lib/analytics/`
- `events.ts` — typed `logEvent(name, params)` wrapper + the PRD §22 event-name union.

`apps/web/src/lib/sessions/*` — **modify**: route watchers through `watchWithFallback`; emit analytics at each action.

`apps/web/src/components/` — `ErrorState.tsx`, `EmptyState.tsx`, `LoadingState.tsx`, `StatusBadge.tsx` (icon + text, not colour-only — PRD §24.5).

`firestore.rules` — **finalize**: every collection from PRD §19; remove any lingering permissive matches.
`apps/web/firestore.full.rules.test.ts` — consolidated rules suite (all collections).

`scripts/seed.ts` — emulator seed (group, players, venue/courts, ready-to-generate session) — PRD §30.

`functions/src/lib/validation.ts` — shared server-side input validation (PRD §24.3) applied across callables.

`.github/workflows/ci.yml` — typecheck + unit tests + rules tests (emulator) on push.

`apps/web/public/icons/` — real 192/512 PNGs (replace M0 placeholder).

---

## Task 1: Realtime with polling fallback (TDD, PRD §18)

**Files:** Create `apps/web/src/lib/realtime/watchWithFallback.ts`, `watchWithFallback.test.ts`.

- [ ] **Step 1: Failing test** — when `subscribe` invokes its error callback, the helper starts polling at the interval and stops both on unsubscribe; when `subscribe` succeeds it never polls. Use fake timers.
```typescript
import { describe, it, expect, vi } from "vitest";
import { watchWithFallback } from "./watchWithFallback.js";

describe("watchWithFallback", () => {
  it("falls back to polling when the listener errors", () => {
    vi.useFakeTimers();
    const poll = vi.fn();
    const unsub = watchWithFallback(
      (_onData, onError) => { onError(new Error("listener failed")); return () => {}; },
      poll, 10000,
    );
    vi.advanceTimersByTime(25000);
    expect(poll).toHaveBeenCalledTimes(2);
    unsub();
    vi.advanceTimersByTime(20000);
    expect(poll).toHaveBeenCalledTimes(2); // stopped after unsub
    vi.useRealTimers();
  });
});
```
- [ ] **Step 2: Run** `pnpm --filter @picklebaddies/web test` → FAIL.
- [ ] **Step 3: Implement** `watchWithFallback.ts`:
```typescript
export function watchWithFallback(
  subscribe: (onData: (v: unknown) => void, onError: (e: unknown) => void) => () => void,
  poll: () => void,
  intervalMs = 12000,
): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const startPolling = () => { if (timer === null) { poll(); timer = setInterval(poll, intervalMs); } };
  const stopPolling = () => { if (timer !== null) { clearInterval(timer); timer = null; } };
  const unsub = subscribe((v) => { /* listener healthy */ void v; }, () => startPolling());
  return () => { stopPolling(); unsub(); };
}
```
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(web): realtime listener with polling fallback (§18)`.

---

## Task 2: Analytics events (PRD §22)

**Files:** Create `apps/web/src/lib/analytics/events.ts`; wire into service modules.

- [ ] **Step 1: Implement** typed wrapper:
```typescript
import { getAnalytics, logEvent as fbLogEvent, isSupported } from "firebase/analytics";
import { getFirebaseApp } from "@/lib/firebase/client";

export type AnalyticsEvent =
  | "user_signed_up" | "group_created" | "player_added" | "session_created"
  | "join_link_opened" | "player_joined_session" | "schedule_generated"
  | "session_started" | "score_entered" | "match_completed" | "round_advanced"
  | "rebalance_triggered" | "session_completed" | "leaderboard_viewed";

export async function logEvent(name: AnalyticsEvent, params?: Record<string, unknown>): Promise<void> {
  if (!(await isSupported())) return;
  fbLogEvent(getAnalytics(getFirebaseApp()), name, params);
}
```
- [ ] **Step 2: Wire** — call from the matching service action (e.g. `createSession` → `session_created`, `submitScore` caller → `score_entered`, rebalance caller → `rebalance_triggered`). One emit per logical action.
- [ ] **Step 3: Verify** `pnpm --filter @picklebaddies/web build` → 0. **Step 4: Commit** `feat(web): analytics event wrapper + wiring (§22)`.

---

## Task 3: UI states + accessible status badges (PRD §24.5)

**Files:** Create `ErrorState.tsx`, `EmptyState.tsx`, `LoadingState.tsx`, `StatusBadge.tsx`; apply across pages.

- [ ] **Step 1:** Build the four components. `StatusBadge` pairs an icon/text with colour (never colour alone — PRD §24.5). Loading is lightweight (PRD §24.1 player page).
- [ ] **Step 2:** Replace ad-hoc "Loading…"/empty placeholders in groups, sessions, live, player pages; add error boundaries around callable invocations with retry.
- [ ] **Step 3:** Verify build → 0. **Step 4: Commit** `feat(web): shared loading/empty/error states + accessible status badges`.

---

## Task 4: Server-side input validation (PRD §24.3)

**Files:** Create `functions/src/lib/validation.ts`; apply to each callable.

- [ ] **Step 1:** Implement small validators (`assertString`, `assertInt`, `assertEnum`, `assertScorePayload`) throwing `HttpsError("invalid-argument", ...)`. Apply at the top of every callable so no callable trusts client shape.
- [ ] **Step 2:** Verify `pnpm --filter @picklebaddies/functions build` → 0. **Step 3: Commit** `feat(functions): shared input validation across callables (§24.3)`.

---

## Task 5: Security-rules finalization + full suite (PRD §19)

**Files:** Finalize `firestore.rules`; create `apps/web/firestore.full.rules.test.ts`.

- [ ] **Step 1:** Audit `firestore.rules` against PRD §19 points 1–10 and DELTA_SPEC D6: every session subcollection (`players`, `rounds`, `matches`, `sitOuts`, `leaderboard`, `generationRuns`, `auditLogs`, `joinRequests`) is read-scoped to members/participants and **write-denied to clients** (functions only); confirm **no** lingering `allow read, write: if true` and the final catch-all denies.
- [ ] **Step 2:** Write `firestore.full.rules.test.ts` consolidating the per-milestone suites + the §19 checklist as explicit cases (one `it` per rule). This is the regression gate.
- [ ] **Step 3:** Run `pnpm --filter @picklebaddies/web test:rules` → PASS. **Step 4: Commit** `test(rules): consolidated §19 security-rules suite`.

---

## Task 6: Integration tests (PRD §26.2)

**Files:** Create `functions/src/__tests__/integration.test.ts` (run against the emulator via `firebase emulators:exec`).

- [ ] **Step 1:** Add a functions test script: `"test:int": "firebase emulators:exec --only firestore,auth,functions \"vitest run --config vitest.int.config.ts\""` and the config.
- [ ] **Step 2:** Implement the PRD §26.2 flows against emulated callables: create session→add players→generate; start→score→leaderboard updates; remove player→rebalance→completed unchanged; add late player→rebalance→appears only future; organiser-vs-player permission denial; score update writes audit log.
- [ ] **Step 3:** Run `pnpm --filter @picklebaddies/functions test:int` → PASS. **Step 4: Commit** `test(functions): emulator integration suite (§26.2)`.

---

## Task 7: Seed/demo data (PRD §30/§31)

**Files:** Create `scripts/seed.ts`; add root script `"seed": "tsx scripts/seed.ts"`.

- [ ] **Step 1:** Implement a script (Admin SDK pointed at emulators) that creates: a user, a group with the user as owner, 12 players with varied skill, a venue with 3 courts, and a draft session ready to generate. Idempotent (fixed ids).
- [ ] **Step 2:** Document in README: `pnpm emulators` then `pnpm seed`. **Step 3:** Run it once to confirm. **Step 4: Commit** `feat(scripts): emulator seed/demo data`.

---

## Task 8: CI + mobile/a11y QA + deploy

**Files:** Create `.github/workflows/ci.yml`; add real PWA icons.

- [ ] **Step 1: CI** — workflow: `pnpm install` → `pnpm -r typecheck` → `pnpm -r test` → `pnpm --filter @picklebaddies/web test:rules` → `pnpm --filter @picklebaddies/functions test:int`. (Firebase CLI is available on the GitHub runner via `npm i -g firebase-tools` or the setup action.)
- [ ] **Step 2: Mobile/a11y QA** — manual checklist (PRD §24.4/§24.5): test on a phone-sized viewport; tap targets ≥ 44px; status conveyed by icon+text; readable contrast; player page loads fast. Record results in the PR.
- [ ] **Step 3: PWA icons** — add real `icon-192.png` / `icon-512.png`, verify installability (manifest + service worker if added).
- [ ] **Step 4: Deploy** — create/point the Firebase project (`firebase use`), `firebase deploy` (hosting web framework + functions + rules). Confirm a real session runs end-to-end on the deployed URL (PRD §27 #14, §30).
- [ ] **Step 5: Commit** `chore(m7): CI workflow, PWA icons, deploy config`.

---

## Task 9: MVP acceptance pass (PRD §27) + processed

- [ ] **Step 1:** Walk the PRD §27 18-point acceptance list end-to-end on the deployed app (or full emulator stack): sign in, create group, add 8+ players, create 2+ court session, generate, score, leaderboard, player next-match, remove + add mid-session, rebalance, completed preserved, mobile, realtime/polling, persistence, rules block unauthorised writes, audits. Record pass/fail per item.
- [ ] **Step 2:** `pnpm -r test` + `test:rules` + `test:int` all green; `pnpm -r typecheck` → 0.
- [ ] **Step 3: Commit** `chore(m7): MVP acceptance verified`.
- [ ] **Step 4: Mark processed**:
```bash
git mv docs/superpowers/plans/2026-06-06-m7-hardening.md docs/superpowers/plans/processed/2026-06-06-m7-hardening.md
git commit -m "chore(plans): mark M7 processed — MVP complete"
```

---

## Self-Review (acceptance mapping)

- §18 realtime + polling fallback → Tasks 1, 2-wiring. ✅
- §19 full security rules + server validation → Tasks 4, 5. ✅
- §22 analytics events → Task 2. ✅
- §24 NFRs (perf checked in M4; reliability via transactions M5/M6; a11y/privacy) → Tasks 3, 8. ✅
- §26.2 integration tests → Task 6. ✅
- §27 MVP acceptance → Task 9. ✅
- §30 DoD (mobile/desktop, persistence, error states, permissions, locked-match safety, tests, seed/demo, deploy) → Tasks 3, 5, 6, 7, 8, 9. ✅

**Out of scope (Phase 2+ per PRD §28):** round-robin/KotC modes, recurring sessions, AI features, ratings, payments, native wrapper, Postgres migration.
