# Plan: Squads, Sessions, Scoring, Global Leaderboard (Next.js-backend track)

**Generated**: 2026-06-14
**Estimated Complexity**: High

## Overview

Deliver the 8 requested features on the **full-app track** (`apps/web/src/app/(app)/**`, `@picklebaddies/match-engine`, `@picklebaddies/domain`) — **but move the authoritative server tier out of Firebase Cloud Functions and into the Next.js backend** (server actions + route handlers using `firebase-admin`). Cloud Functions are kept only where they are architecturally required (scheduled jobs, triggers that cannot live in a request lifecycle). For the MVP scope below, nothing requires Functions, so the equivalent logic is re-homed in `apps/web/src/server/**`. **Each ported callable is deleted/disabled in the same sprint its Next.js replacement ships** (decided) — no dual-writer window.

Design priority per the request: **ease of use without losing UI/UX**. Every feature gets the shortest possible happy path (sport + scoring chosen once at the start, one-tap scoring by anyone, drop-out is one button that silently rebalances).

### Feature → approach map

| # | Feature | Approach | Net-new vs existing |
|---|---------|----------|---------------------|
| 1 | Create squad | Reuse `Group`, **simplified to 2 roles** (`owner`, `member`) | Simplify existing |
| 2 | Create / join session | Server-action create + invite/join code; sport picked up front | Port + UX |
| 3 | Score — anyone in squad | Relax `canEnterScore` to any member; one-tap server action | Permission + UX |
| 4 | Leaderboard | **Global, all players, cross-session/cross-squad** | Net-new data model |
| 5 | Automated rounds | `match-engine.generateSchedule` via server action | Port to Next.js |
| 6 | Drop out | One-tap status → `out`, triggers preserve-locked rebalance | Port + UX |
| 7 | Play with everyone | Already in engine (partner/opponent repeat penalties) — verify + surface | Verify + expose |
| 8 | Sport (badminton/pickleball) | Already on `Session.sport`; choose at session start; drives labels + default scoring | Wire UX |

### Architectural decision (must be ratified before Sprint 1)

This **overrides** the CLAUDE.md invariant *"Generation commits server-side only [via Cloud Functions]"* and the PRD §16 placement of authoritative logic in `functions`. New invariant:

> Authoritative mutations (generate / rebalance / score / squad / session lifecycle) run in **Next.js server-only modules** (`apps/web/src/server/**`) behind `verifySession()`. They are the only writers of matches/leaderboards. Clients never write matches directly. Cloud Functions are used only for work that cannot run in a request (scheduled/triggered).

The `match-engine` zero-I/O invariant (DELTA_SPEC D3) is **unchanged** — it stays pure and is imported by the Next.js server tier exactly as Functions imported it. `@picklebaddies/domain` stays the shared permission/scoring source of truth used by both UI and server.

## Prerequisites

- **Ratify the architectural decision above** and update `CLAUDE.md` + `DELTA_SPEC.md` (add a delta note; PRD §16/§29 reference). This is Task 0.1 and blocks everything.
- Firebase **Admin** service-account credentials available to the Next.js server (env: `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`), and emulator equivalents (`FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`) so it runs fully on emulators like M1.
- Node 20 runtime parity for the Next.js server (it now runs admin code).
- Existing assets to lean on: `functions/src/{generateSchedule,rebalanceSession,submitScore,join,groups}.ts` (reference implementations to port), `functions/src/lib/{mapping,validation,audit,rateLimit}.ts`, `@picklebaddies/domain` predicates (`canEnterScore`, `canGenerateSchedule`, `deriveWinner`), `match-engine` generate/rebalance.

---

## Sprint 0: Next.js server foundation (firebase-admin + auth DAL)

**Goal**: A protected server tier exists. A server action can verify the caller and read/write Firestore via admin, on emulators.
**Demo/Validation**:
- Sign in on the web app, call a `whoami` server action → returns the verified uid + email.
- Same action called unauthenticated → returns 401/`unauthorized()`.
- Runs against Auth + Firestore emulators with no real project.

### Task 0.1: Ratify + document the architecture change
- **Location**: `CLAUDE.md`, `DELTA_SPEC.md`
- **Description**: Add the new "authoritative mutations live in Next.js server tier" invariant; note Functions are frozen for MVP; cross-reference PRD §16/§29.
- **Dependencies**: none (blocks all)
- **Acceptance**: Docs state the new boundary; `match-engine` purity reaffirmed.
- **Validation**: Doc review.

### Task 0.2: Firebase Admin singleton
- **Location**: `apps/web/src/server/firebase/admin.ts` (add `import "server-only"`)
- **Description**: Lazy singleton `getAdminApp()/getAdminDb()/getAdminAuth()`; reads service-account env; honours emulator host vars; guards against double-init in dev/HMR via `getApps()`.
- **Dependencies**: 0.1
- **Acceptance**: Importing from a client component fails the build (`server-only`); admin reads a doc on the emulator.
- **Validation**: Unit/integration test hitting Firestore emulator; build fails if imported client-side.

### Task 0.3: Auth DAL — `verifySession()`
- **Location**: `apps/web/src/server/auth/dal.ts`
- **Description**: `verifySession()` reads the Firebase ID token (Authorization `Bearer` for route handlers; for server actions read it from a `__session` cookie set client-side after login), `adminAuth.verifyIdToken()`, returns `{ uid, email } | null`. Add `requireSession()` that throws/`unauthorized()`. Cache per request.
- **Dependencies**: 0.2
- **Acceptance**: Valid token → identity; expired/missing → null.
- **Validation**: Tests with emulator-minted tokens (valid, expired, none).

### Task 0.4: Client → server token plumbing
- **Location**: `apps/web/src/lib/auth/AuthProvider.tsx`, new `apps/web/src/lib/auth/session-cookie.ts`
- **Description**: **Decided: `__session` cookie (auto).** On `onIdTokenChanged`, write the current ID token to the `__session` cookie so server actions see it; refresh before the 1h expiry; clear on sign-out. Sensitive mutations call `verifyIdToken(token, /*checkRevoked*/ true)`.
- **Dependencies**: 0.3
- **Acceptance**: After sign-in, a server action sees the uid without manual header wiring.
- **Validation**: E2E: sign in → call `whoami` action → uid returned.

### Task 0.5: Shared server-action result + error contract
- **Location**: `apps/web/src/server/result.ts`
- **Description**: `ActionResult<T>` discriminated union (`ok`/`error` with code+message); helper to map domain/precondition errors (mirror the HttpsError codes the Functions used). Optional lightweight rate-limit util ported from `functions/src/lib/rateLimit.ts` keyed by uid.
- **Dependencies**: 0.3
- **Acceptance**: Actions return typed results UI can branch on.
- **Validation**: Unit tests for mappers.

---

## Sprint 1: Squads (simplified groups)

**Goal**: A user creates a squad, gets an invite link, friends join. Roles are just `owner` + `member`.
**Demo/Validation**: Create squad → copy invite link → second account opens link → joins → both see the squad and its members.

### Task 1.1: Simplify role model to `owner | member`
- **Location**: `packages/domain/src/**` (role type + predicates), `apps/web/src/lib/groups/types.ts`
- **Description**: Collapse `organiser` into `member` (or alias it). Update predicates: `canManageSquad` (owner only), `canEnterScore`/`canGenerateSchedule`/`canRebalance` → **any member** (supports feature 3). Keep both axes (DELTA_SPEC D5) intact — `participantType` unchanged.
- **Dependencies**: 0.1
- **Acceptance**: Domain tests green with 2 roles; no `organiser` references remain in active paths.
- **Validation**: `pnpm --filter @picklebaddies/domain test`.

### Task 1.2: Squad create server action
- **Location**: `apps/web/src/server/squads/actions.ts`, port from `functions/src/groups.ts`
- **Description**: `createSquad({ name, description })` → admin transaction: create group doc, set caller as `owner`, add membership. Returns squad id.
- **Dependencies**: 0.5, 1.1
- **Acceptance**: Doc created; caller is owner.
- **Validation**: Integration test on emulator.

### Task 1.3: Invite + join (link/code)
- **Location**: `apps/web/src/server/squads/actions.ts` (port `functions/src/groupInvite.ts`, `join.ts`), route/page `apps/web/src/app/join/group/[inviteCode]/page.tsx` (exists — rewire to action)
- **Description**: `rotateInviteCode`, `joinSquad(inviteCode)` adding caller as `member`; idempotent if already a member.
- **Dependencies**: 1.2
- **Acceptance**: Valid code joins; invalid/expired rejected; re-join is no-op.
- **Validation**: Integration tests (valid/invalid/duplicate).

### Task 1.4: Squad UI — create + member list + invite
- **Location**: `apps/web/src/app/(app)/groups/page.tsx`, `apps/web/src/app/(app)/groups/[groupId]/page.tsx`
- **Description**: "Create squad" form; squad page lists members with role badges; one-tap "Copy invite link". Match the warm orange visual system used in `/quick` (`O` palette) for consistency.
- **Dependencies**: 1.3
- **Acceptance**: Full create→invite→join loop works in UI.
- **Validation**: Manual + Playwright smoke.

### Task 1.5: Firestore rules for squads
- **Location**: `firestore.rules`, `apps/web/src/**/*.rules.test.ts`
- **Description**: Members read their squads; only owner mutates squad meta; **all writes that matter still go through the server tier** (rules are defense-in-depth: clients may read, never write matches/leaderboards). Deny client writes to `matches`, `leaderboard`, global `players`.
- **Dependencies**: 1.1
- **Acceptance**: Rules tests pass; client cannot write protected collections.
- **Validation**: `pnpm --filter @picklebaddies/web test:rules`.

---

## Sprint 2: Create / join a session with sport up front (feature 2, 8)

**Goal**: From a squad, create a session — pick **sport** and players in one short form — and generate round 1 automatically.
**Demo/Validation**: Create session in a squad, choose badminton, pick 6 players, 2 courts → schedule appears with sport-correct labels and default scoring.

### Task 2.1: Sport config (labels + score defaults)
- **Location**: `packages/domain/src/sport.ts`
- **Description**: `SPORTS = { badminton: { label, defaultScoringMode, defaultTargetScore: 21, terms:{game,court} }, pickleball: { …, defaultTargetScore: 11 } }`. Sport only affects labels + default scoring mode/target (no engine change — per decision). `Session.sport` already exists.
- **Dependencies**: 0.1
- **Acceptance**: Helper returns correct defaults per sport.
- **Validation**: Unit tests.

### Task 2.2: Create-session server action
- **Location**: `apps/web/src/server/sessions/actions.ts` (port from `functions/src/sessionLifecycle.ts` + create path)
- **Description**: `createSession({ squadId, name, sport, courts, players, durationMinutes })` → validates membership (any member), snapshots courts (DELTA_SPEC D2), sets `scoringMode` from sport default (overridable), `status: draft`, generates `joinCode`/`scoreCode`.
- **Dependencies**: 1.1, 2.1
- **Acceptance**: Session doc + player docs created with sport + scoring defaults.
- **Validation**: Integration test.

### Task 2.3: Generate schedule server action (port)
- **Location**: `apps/web/src/server/sessions/generate.ts`, reuse `functions/src/lib/mapping.ts` (move to a shared server lib or import)
- **Description**: Port `generateSchedule`: one-shot transactional claim (`scheduleGeneratedAt`), load players/rounds/matches, `mapSessionToEngineInput(..., "initial")`, call `match-engine.generateSchedule`, batch-write rounds/matches + **initialize per-session leaderboard rows**. Preserve the F-H4 concurrency guard.
- **Dependencies**: 2.2, 0.2
- **Acceptance**: Calling twice does not double-generate; rounds/matches/leaderboard written.
- **Validation**: Integration test incl. concurrent-call guard.

### Task 2.4: Session create + join UI with sport selector
- **Location**: `apps/web/src/app/(app)/sessions/new/page.tsx`, `apps/web/src/app/(app)/sessions/[sessionId]/page.tsx`, `apps/web/src/app/join/[code]/page.tsx`
- **Description**: Single-screen create: sport toggle (badminton/pickleball) **first**, then name/courts/players; "Generate" calls 2.3. Join-by-code page adds caller as a session player. Labels/terms come from sport config.
- **Dependencies**: 2.3
- **Acceptance**: Sport choice visibly changes labels + default target score; schedule renders.
- **Validation**: Manual + Playwright.

---

## Sprint 3: Scoring — anyone in the squad (feature 3)

**Goal**: Any squad member opens the live session and records a result in one tap; winner is derived and stats update.
**Demo/Validation**: Two different member accounts both score different courts in the same round; leaderboard + player stats reflect both.

### Task 3.1: Submit-score server action (port)
- **Location**: `apps/web/src/server/sessions/score.ts` (port `functions/src/submitScore.ts`)
- **Description**: Transaction: `requireSession`, membership check via `canEnterScore` (now any member), F-H5 guards (session active/paused, not a future round, match not cancelled), `assertScorePayload` by `scoringMode`, `deriveWinner`, write match result, increment **per-session leaderboard + per-session player stats + (Sprint 5) global player stats** atomically.
- **Dependencies**: 1.1, 2.3, 0.5
- **Acceptance**: Valid score updates all aggregates once; invalid/future/cancelled rejected; idempotent re-submit handled (overwrite with delta correction or lock).
- **Validation**: Integration tests (valid, future round, cancelled match, re-score).

### Task 3.2: One-tap live scoring UI
- **Location**: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`
- **Description**: Per-court score entry with sport-aware target presets; optimistic update; clear winner highlight (reuse the quick-portal winner visuals). Realtime via existing `watchWithFallback`.
- **Dependencies**: 3.1
- **Acceptance**: Any member can score any active court; UI updates live for all viewers.
- **Validation**: Manual multi-client + Playwright.

---

## Sprint 4: Automated rounds, drop-out, play-with-everyone (features 5, 6, 7)

**Goal**: A player drops out with one tap; future rounds silently rebalance while completed/in-progress matches stay locked; the schedule maximises new partners/opponents.
**Demo/Validation**: Mid-session, mark a player `out` → only future rounds change, locked matches untouched, round count uses remaining time (DELTA_SPEC D4), and repeated pairings are minimised.

### Task 4.1: Rebalance server action (port, preserve locked)
- **Location**: `apps/web/src/server/sessions/rebalance.ts` (port `functions/src/rebalanceSession.ts`)
- **Description**: Load locked (done + in-progress) matches, compute `targetFutureRounds` from **remaining** time (DELTA_SPEC D4), `mapSessionToEngineInput(..., "rebalance")`, `match-engine` rebalance, replace only future rounds in a batch. Never mutate locked matches/leaderboards already counted.
- **Dependencies**: 2.3, 0.2
- **Acceptance**: Locked matches byte-identical post-rebalance; future rounds regenerated; round math uses remaining time.
- **Validation**: Integration tests asserting locked-match immutability.

### Task 4.2: Drop-out / availability action + UI
- **Location**: `apps/web/src/server/sessions/players.ts` (port `functions/src/updatePlayerStatus.ts`), `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`
- **Description**: `setPlayerStatus(sessionId, playerId, 'out'|'available')` → updates session-availability status (NOT per-round; DELTA_SPEC D7) and **auto-triggers 4.1**. One-tap "Drop out" / "I'm back". Add player mid-session reuses same path + rebalance.
- **Dependencies**: 4.1
- **Acceptance**: Drop-out removes player from future rounds only; rejoin re-includes; current/locked rounds unchanged.
- **Validation**: Integration + manual.

### Task 4.3: Verify & surface "play with everyone" (feature 7)
- **Location**: `packages/match-engine/src/{penalty,fairness}.ts` (+ tests), live UI
- **Description**: Confirm partner-repeat and opponent-repeat penalties are weighted to spread pairings; add/adjust a fairness test asserting low duplication over N rounds with M players. Surface a subtle "new partners" indicator in the schedule UI. **No new algorithm** unless tests show duplication is high — then tune weights only.
- **Dependencies**: 4.1
- **Acceptance**: Over a representative session, repeated exact partnerships are near-minimal; test encodes the bound.
- **Validation**: `pnpm --filter @picklebaddies/match-engine test` (new fairness assertion).

---

## Sprint 5: Global leaderboard — all players (feature 4)

**Goal**: A persistent global leaderboard ranks **every player across all squads and sessions** (wins, games, win-rate, point diff).
**Demo/Validation**: After several sessions in two squads, the global leaderboard shows all players ranked, updating as new scores land.

### Task 5.1: Global player identity + stats model
- **Location**: `apps/web/src/server/players/model.ts`, `firestore.rules`
- **Description**: Top-level `players/{playerId}` doc holding cumulative `{ displayName, isGuest, gamesPlayed, wins, losses, pointsFor, pointsAgainst, pointDifference, lastPlayedAt }`. Stable `playerId` shared across squads/sessions: registered users keyed by uid; **guests get a durable persisted id (decided: guests DO rank globally)**, stored on the session player so the same guest reuses their id across sessions. Add an optional `mergeGuestIntoUser` admin path for later. Denormalised display name (PRD §20).
- **Dependencies**: 0.2
- **Acceptance**: One player playing in two squads maps to one global doc.
- **Validation**: Integration test: same uid across squads → single aggregate.

### Task 5.2: Atomic global-stat increments on score
- **Location**: `apps/web/src/server/sessions/score.ts` (extend 3.1)
- **Description**: In the same score transaction, increment the global `players/{playerId}` aggregate alongside session leaderboard/stats. Drop-out/rebalance must NOT double-count (only completed matches count — they already do). Guard against re-score double counting (delta or locked-match check).
- **Dependencies**: 3.1, 5.1
- **Acceptance**: Global totals equal sum of completed matches across all sessions; no double counts on rebalance/re-score.
- **Validation**: Integration test summing matches vs aggregate.

### Task 5.3: Global leaderboard query + UI
- **Location**: `apps/web/src/app/(app)/leaderboard/page.tsx`, `apps/web/src/server/players/query.ts`, `firestore.indexes.json`
- **Description**: Server-rendered ranked list (sort by wins, tiebreak win-rate then point diff), pagination, search. Add composite index. Sport filter optional (if stats segmented by sport later). Reachable from main nav.
- **Dependencies**: 5.2
- **Acceptance**: All players visible, correctly ranked, updates after new sessions.
- **Validation**: Manual + a query unit test for ordering/tiebreaks.

### Task 5.4: Backfill existing data (if any)
- **Location**: one-off script `apps/web/scripts/backfill-global-players.ts`
- **Description**: If sessions already exist, aggregate their completed matches into `players/{playerId}`. Idempotent.
- **Dependencies**: 5.1
- **Acceptance**: Re-running yields identical totals.
- **Validation**: Run on emulator seed; compare.

---

## Testing Strategy

- **Engine / domain (pure)**: TDD with vitest (per CLAUDE.md). New fairness bound (4.3), sport config (2.1), 2-role predicates (1.1).
- **Server tier**: integration tests against Firestore/Auth emulators for every action (mirror `functions/src/__tests__/integration.test.ts`). Focus cases: concurrent generate (F-H4), score guards (F-H5), locked-match immutability on rebalance (D4/D7), global-stat no-double-count.
- **Rules**: `test:rules` — clients can read squads but cannot write matches/leaderboard/global players.
- **E2E (Playwright)**: squad create→invite→join; create session w/ sport; two members scoring; drop-out→rebalance; leaderboard reflects results.
- Gate each sprint on `pnpm -r typecheck` + `pnpm -r test` + the sprint's demo checklist before moving on.

## Potential Risks & Gotchas

- **Architecture-invariant conflict** — the plan contradicts CLAUDE.md/PRD on Functions placement. Mitigation: Task 0.1 ratifies it explicitly *before* code; `match-engine` purity stays untouched.
- **ID-token-in-cookie auth** (decided) — server actions don't get an Authorization header automatically; the `__session` cookie must refresh tokens (1h expiry) and clear on logout. Mitigation: refresh-on-`onIdTokenChanged`; `verifyIdToken(checkRevoked)` on sensitive mutations.
- **Double-counting global stats** — rebalance/re-score must never re-add completed-match points. Mitigation: only completed matches count; transactional delta or locked-match invariant; 5.2 test sums matches vs aggregate.
- **Functions removed per-port** (decided) — replacement must be fully verified before the old callable is deleted in the same sprint, else a gap. Mitigation: port+test+ship+delete as one sprint's closing step; client stops calling the callable first.
- **Durable guest identity** (decided: guests rank globally) — guests have no uid; risk of fragmented or name-colliding global rows. Mitigation: persist a durable guest id on the session player and reuse it; tolerate name collisions; optional `mergeGuestIntoUser` tool later.
- **Rules as defense-in-depth only** — since clients can read but all writes go server-side, ensure no client code path still writes matches/leaderboards (grep + rules deny).
- **Emulator parity** — admin SDK must honour `*_EMULATOR_HOST` so M1-style local dev keeps working; verify in 0.2.

## Rollback Plan

- Each sprint is independently revertable; server-tier files live under new paths (`apps/web/src/server/**`) and the old Functions remain deployable until explicitly removed — so reverting a sprint can re-point the client at the original callable as a stopgap.
- Global leaderboard (Sprint 5) is additive (new collection + page); drop the page/index and stop incrementing to disable without affecting sessions.
- Keep the architecture-doc change (0.1) in its own commit so the decision can be reversed in isolation if the team rejects the Functions→Next.js move.
```
