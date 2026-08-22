# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PickleBaddies — a mobile-first PWA for running casual social badminton/pickleball sessions: create a session, add players, auto-generate fair doubles games, track scores, and rebalance future rounds without disturbing completed/in-progress matches. Source of truth for requirements is `PRD Social Session Chaos Killer.md`.

**`DELTA_SPEC.md` overrides the PRD wherever they conflict.** It resolves 7 internal inconsistencies found in review. Read it before implementing anything touching: scoring modes, courts, the generator, rebalance math, roles, the join flow, or player status. Do not "fix" code back toward the PRD on these points.

## Monorepo layout (pnpm workspaces)

- `packages/match-engine` — pure, deterministic doubles scheduler. **Zero Firebase / zero I/O imports — keep it that way (DELTA_SPEC D3).** Tracks partner/opponent history for fairness; exposes `fairnessScore` and `notes` in metadata.
- `packages/domain` — pure shared logic: role predicates, sport config (`badminton` / `pickleball`), scoring types, session-status helpers. Used by both `web` and `functions`.
- `apps/web` — Next.js 15 (App Router, React 19) + TypeScript, PWA. Firestore/Auth **client** access is confined to `src/lib/**`; authoritative server mutations live in `src/server/**` (see DELTA_SPEC D8).
- `apps/web/src/server/**` — **Next.js server-only modules** (server actions). These are the authoritative writers for all mutations. Every file here must carry `import "server-only"`. Auth via `verifySession()` reading the `__session` cookie.
  - `server/firebase/admin.ts` — lazy `getAdminDb/getAdminAuth` singleton (emulator-aware)
  - `server/auth/dal.ts` — `verifySession()` / `requireSession()`
  - `server/result.ts` — `ActionResult<T>` discriminated union + `ok()`/`err()` helpers
  - `server/squads/actions.ts` — `createSquad`, `rotateInviteCode`, `joinSquad`
  - `server/sessions/actions.ts` — `createSession`, `updateSessionStatus`
  - `server/sessions/generate.ts` — `generateSchedule` (F-H4 concurrency guard)
  - `server/sessions/rebalance.ts` — `rebalanceSession` (F-C3 transaction, D4 elapsed-round math)
  - `server/sessions/score.ts` — `submitScore` (F-H5, F-C2, edit-rescoring, global stat increment)
  - `server/sessions/players.ts` — `updatePlayerStatus`, `addLatePlayer`
  - `server/lib/mapping.ts` — `mapSessionToEngineInput` (session → engine input)
  - `server/players/actions.ts` — `ensureGlobalPlayer`, `createGuestPlayer`
- `apps/web/src/app/(app)/leaderboard/page.tsx` — global leaderboard server component (queries `players/` collection)
- `functions` — Firebase Cloud Functions, **frozen for MVP** (DELTA_SPEC D8). Not extended; new mutations go in `apps/web/src/server/**`. Existing callables are reference implementations only.
- `scripts/backfill-global-stats.ts` — one-shot idempotent script to populate `players/{uid}` from existing completed matches.
- `docs/superpowers/plans/` — per-milestone implementation plans. **A plan's folder is its status:** files directly in `plans/` are not yet implemented; files in `plans/processed/` are shipped and verified. When you finish a milestone (all tasks done, tests pass, acceptance met), `git mv` its plan into `plans/processed/` as the final commit. Never move a plan on partial completion. See `docs/superpowers/plans/README.md`.

## Architectural invariants (don't violate)

- **Generation commits server-side only (DELTA_SPEC D8).** The web app may *preview/estimate* rounds using `match-engine`, but a schedule is only persisted via `apps/web/src/server/**` server actions — never directly from the client and no longer via Cloud Functions (MVP).
- **Two independent role axes (DELTA_SPEC D5):** group-membership role (`owner | admin | member`, with legacy `organiser` treated as `admin`) drives *permissions*; session `participantType` (`registered_user | guest`) drives *visibility*. Never conflate them. Permission checks live in `@picklebaddies/domain` pure predicates so the same logic runs in UI and server actions.
- **Owners and admins run sessions; all members may score.** Session creation, player management, generation, and rebalance are admin-level. `canEnterScore` remains true for every group member. Only owners can appoint admins or change ownership.
- **Per-round play/sit-out is derived, never stored on the player.** `sessions/{id}/players.status` means session availability, not "playing this round" (DELTA_SPEC D7).
- **Rebalancing preserves locked matches.** Completed + in-progress matches are immutable; only future rounds regenerate. Round count uses *remaining* time (DELTA_SPEC D4). Stat reconciliation runs inside the same transaction (F-C3).
- **Global player stats are updated atomically with per-session stats.** `submitScore` reads `players/{id}` inside the same Firestore transaction and updates `totalGames/Wins/Losses/PointsFor/Against/Diff` + `lastPlayedAt`. Never update one without the other.
- **`players/{id}` is server-write-only.** Firestore rules deny all client writes to `players/`. `ensureGlobalPlayer` (server action) is the only creator; `submitScore`/`rebalanceSession` are the only updaters.
- **Firestore is denormalised on purpose** (PRD §20). Cached display names / skill / court names in session docs are intentional — don't normalise them away.
- **Keep migration-to-Postgres open** (PRD §29): stable IDs, business logic in service layers / `match-engine`, never inside React components.

## Commands

```bash
pnpm install                 # bootstrap workspace
pnpm -r test                 # run every package's tests
pnpm -r typecheck            # typecheck all packages
pnpm build                   # build all packages
pnpm dev:web                 # Next.js dev server (apps/web)
pnpm emulators               # firebase emulators (auth/firestore/functions/hosting)
```

Per-package (filter form works for any package):
```bash
pnpm --filter @picklebaddies/match-engine test          # vitest run
pnpm --filter @picklebaddies/match-engine test:watch    # watch mode
pnpm --filter @picklebaddies/match-engine build
pnpm --filter @picklebaddies/web build                  # Next production build (also typechecks)
```

Run a single test (vitest):
```bash
pnpm --filter @picklebaddies/match-engine exec vitest run src/rounds.test.ts
pnpm --filter @picklebaddies/match-engine exec vitest run -t "rebalance"   # by test name
```

Firestore rules tests run against the emulator (M1+):
```bash
pnpm --filter @picklebaddies/web test:rules    # wraps vitest in `firebase emulators:exec`
```

## Local dev / Firebase

- Web config comes from `apps/web/.env.local` (copy from `.env.example`). The `NEXT_PUBLIC_FIREBASE_*` keys are public client keys, safe to expose. Set `NEXT_PUBLIC_USE_EMULATORS=true` to point the client at local emulators.
- **Fully runnable on Auth + Firestore emulators with no real Firebase project.** Set `FIRESTORE_EMULATOR_HOST` + `FIREBASE_AUTH_EMULATOR_HOST` and the Admin SDK automatically skips credentials.
- `firestore.rules` has real per-collection rules for `users`, `groups`, `sessions` (sub-collections), `players`, and `_rateLimits`. Client writes to `players/` and all match/leaderboard sub-collections are denied — server tier only.
- Node 25 locally triggers a harmless pnpm "unsupported engine" warning for `functions` (which targets the node 20 Cloud Functions runtime) — ignore it.
- **Backfill:** after first deploy, run `ts-node scripts/backfill-global-stats.ts` (with `GOOGLE_APPLICATION_CREDENTIALS` or emulator env) to populate `players/{uid}` from existing session data.

## Conventions

- TDD for the engine, domain, and any pure logic: write the failing vitest first, then implement.
- New Firestore/Auth **client** access goes in `apps/web/src/lib/**`, not in components. **Server-side** Firestore mutations go in `apps/web/src/server/**` using firebase-admin.
- Commit messages end with the `Co-Authored-By: Claude Opus 4.8` trailer (see existing history). Don't push unless asked.
- Server env vars needed by `apps/web/src/server/**`: `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`. Set `FIRESTORE_EMULATOR_HOST` + `FIREBASE_AUTH_EMULATOR_HOST` for local emulator use (see `apps/web/.env.local`).
