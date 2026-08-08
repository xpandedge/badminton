# Design — Dev Mode + Playwright Core-Flow Tests

> Status: approved 2026-06-23. Companion plan lives in
> `docs/superpowers/plans/2026-06-23-dev-mode-e2e-tests.md` once written.

## Goal

Let the app run on a local dev environment **without real authenticated users**, using a
fixed set of switchable dummy users, and add Playwright tests that exercise the core
"casual team" flows end to end: create team (squad) → create session → generate rounds →
edit/update rounds (score, late join, rebalance) during a live session.

## Key constraint discovered

### Squad membership model (verified in code)

Membership is **owner-adds-by-email**, not invite-code self-join. `addMemberToSquad(squadId,
email, role)` looks the target up via `auth.getUserByEmail` and requires them to already have
an account. The squad-detail page exposes this as a searchable member picker (`searchUsers`).
So the multi-user test flow is: seed all 4 dummy accounts + profiles up front (so they are
discoverable) → Alice creates squad → Alice adds bob/carol/dave by typing their name/email and
picking from the dropdown.

### Session player model (verified in code)

`createSession` is called with `players: []` (the new-session form sends no players). Session
players are added afterwards in the **live console** via an `addLatePlayer` picker (a `<select>`
of squad players + an add button). So "generate rounds" requires: open live console → add ≥4
players → Generate Schedule. The squad therefore needs ≥4 players (owner + 3 added members)
for a meaningful round.

### Firestore read gating

`firestore.rules` gate **all client reads** on `request.auth` (`signedIn()`, uid match,
group-member predicates). A pure server-side `verifySession()` bypass would therefore leave
the client unable to read Firestore (blank lists / dead live views). So dev mode must
authenticate the **client** as the chosen dummy user. We do this against the **Firebase Auth
emulator**, which keeps rules + server token verification working unchanged and makes the
Playwright tests faithful to production behaviour.

## Non-goals (YAGNI)

- No production auth changes; the dev path is hard-gated off in prod.
- No real Firebase project — emulators only.
- No CI wiring in this iteration.
- No visual-regression snapshots — behaviour assertions only.
- No pre-seeded teams/sessions — tests create them through the UI.

## 1. Dev auth mode (emulator-backed dummy users)

- Flag: `NEXT_PUBLIC_DEV_AUTH=true`. Honored **only** when `NEXT_PUBLIC_USE_EMULATORS=true`
  AND `process.env.NODE_ENV !== "production"`. A single helper `isDevAuthEnabled()` enforces
  the gate; everything else reads that helper, never the raw env.
- Dummy roster (fixed, defined in one module):

  | key   | email           | password  | displayName |
  |-------|-----------------|-----------|-------------|
  | alice | alice@dev.local | devpass1! | Alice Dev   |
  | bob   | bob@dev.local   | devpass1! | Bob Dev     |
  | carol | carol@dev.local | devpass1! | Carol Dev   |
  | dave  | dave@dev.local  | devpass1! | Dave Dev    |

  Each is a normal Auth-emulator user → real uid → Firestore rules apply unchanged.
- `DevUserSwitcher` — floating, dev-only client component, rendered in `layout.tsx` only when
  `isDevAuthEnabled()`. Shows current user + dropdown of the 4 + "Sign out".
  Selecting a user: `signInWithEmailAndPassword`; on `auth/user-not-found` (or
  invalid-credential), `createUserWithEmailAndPassword` then update displayName, then retry.
  This flows through the **existing** `AuthProvider` (`onIdTokenChanged` → `__session`
  cookie → `ensureUserProfile` + `ensureGlobalPlayer`). **No change to `verifySession()` or
  any server action.**
- Selected dummy key persisted in `localStorage` so reloads stay signed in.

## 2. Seeding

- `scripts/dev-seed.ts` — idempotent. Ensures the 4 Auth-emulator users exist (admin SDK
  `createUser`, ignore already-exists), plus their `users/{uid}` and `players/{uid}` docs.
  Run via `pnpm dev:seed` (needs emulator env vars). Optional — the switcher self-heals by
  creating a user on first sign-in — but seeding gives deterministic uids for debugging.

## 3. Tooling / scripts

- Add `@playwright/test` to `apps/web` devDependencies.
- `playwright.config.ts` in `apps/web`:
  - `webServer`: boots `next dev` with `NEXT_PUBLIC_USE_EMULATORS=true
    NEXT_PUBLIC_DEV_AUTH=true` and the emulator host env vars; `reuseExistingServer` in dev.
  - `baseURL` `http://127.0.0.1:3000`; single chromium project, mobile viewport.
- Scripts:
  - root `pnpm dev:seed` → runs `scripts/dev-seed.ts`.
  - `apps/web` `test:e2e` → `playwright test` (assumes emulators already running; documented).
  - `apps/web` `test:e2e:full` → `firebase emulators:exec --only auth,firestore "<seed> && playwright test"`.
- `.env.local` / `.env.example`: document `NEXT_PUBLIC_DEV_AUTH`.

## 4. `data-testid` additions (targeted, no logic change)

Add stable test ids to core interactive elements only:

- Dev switcher: `dev-user-switcher`, `dev-user-option-<key>`.
- Squad list: `squad-name-input`, `squad-create-submit`, `squad-list-item`.
- Squad detail: `member-search-input`, `member-search-result` (per result),
  `member-add-submit`, `member-list-item` (per member).
- Session: `session-name-input`, `session-venue-input`, `session-courts-input`,
  `session-sport-<sport>`, `session-create-submit`, `session-list-item`.
- Live console: `add-player-select`, `add-player-submit`, `generate-schedule-btn`,
  `start-session-btn`, `round-card`, `match-card`, `match-player`, `sitout-list`,
  `fairness-chip`, `score-team-a-input`, `score-team-b-input`, `save-score-btn`,
  `advance-round-btn`, `rebalance-btn`, `complete-session-btn`.

Exact set finalized per-component during implementation; this is the intended surface.

## 5. Playwright suites (multi-user, casual-team story)

Location `apps/web/e2e/`. Shared fixtures:
- `e2e/fixtures/users.ts` — `signInAs(page, key)` drives the switcher; roster constants.
- `e2e/fixtures/setup.ts` — helpers `createSquad(page, name)` → returns invite code;
  `createSession(page, opts)`; `addGuests(page, names)`.

Suites:
1. **`squad.spec.ts`** — Alice creates a squad. Alice adds Bob via the member picker (search
   by name → pick → add). Bob appears in the member list. Switch to Bob → Bob sees the squad
   in his list. Permission assertion: as owner Alice sees an add-member control; (optional)
   member-only permission surface.
2. **`session.spec.ts`** — Alice creates a session in the squad (name, venue, court lines,
   sport); session appears in the sessions list with correct metadata.
3. **`rounds.spec.ts`** — In the live console, add 4 players (Alice + Bob + Carol + Dave),
   Generate Schedule → a round + match renders; the match has 4 distinct players; fairness
   chip present.
4. **`live-edit.spec.ts`** — Live session with ≥4 players and a generated schedule: start
   session, submit a score for the round-1 match, advance the round; add another player and
   rebalance → assert the scored/locked match is unchanged while future rounds regenerate.

Assertions favour visible behaviour (counts, locked state, membership, score display) over
internal data. Each suite is independent and creates its own squad/session.

## 6. Files touched / added (summary)

Added:
- `apps/web/src/lib/auth/dev-auth.ts` (roster + `isDevAuthEnabled()` + sign-in helper)
- `apps/web/src/components/DevUserSwitcher.tsx`
- `scripts/dev-seed.ts`
- `apps/web/playwright.config.ts`
- `apps/web/e2e/**` (fixtures + 4 specs)

Modified:
- `apps/web/src/app/layout.tsx` (mount switcher when dev-auth on)
- `apps/web/package.json` (deps + scripts), root `package.json` (`dev:seed`)
- `.env.example` / `.env.local` (document flag)
- ~20-25 `data-testid` attributes across existing squad/session/live components
- `.gitignore` (playwright artifacts: `test-results/`, `playwright-report/`)

## Acceptance

- `NEXT_PUBLIC_DEV_AUTH=true` + emulators running → app usable end-to-end with one-click
  user switching, no Google sign-in, no real Firebase project.
- `pnpm --filter @picklebaddies/web test:e2e:full` runs all 4 suites green from a clean
  emulator state.
- Dev path provably inert when `NODE_ENV=production` or emulators flag off.
- No changes to `verifySession()`, server actions, or `match-engine`.
