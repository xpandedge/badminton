# Local development & end-to-end tests

Run the whole app locally with **no real Firebase project and no real sign-in**, using
the Firebase emulators and a set of switchable dummy users.

## Prerequisites

- Node + pnpm (`pnpm install` at the repo root).
- **Java** (the Firestore/Auth emulators require a JRE). On macOS: `brew install openjdk`
  and ensure it's on your `PATH` (e.g. `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"`).

## Dev mode (dummy users, no Google sign-in)

Dev auth is gated by `NEXT_PUBLIC_DEV_AUTH=true` and only activates in non-production
**and** when emulators are enabled. In three terminals:

```bash
# 1. Emulators (Auth + Firestore + Functions)
pnpm emulators            # or: firebase emulators:start --only auth,firestore,functions

# 2. Seed the four dummy users (idempotent)
pnpm dev:seed             # creates alice/bob/carol/dave @dev.local + profiles

# 3. Dev server with the dummy-user switcher
pnpm --filter @picklebaddies/web dev:devauth
```

Open http://127.0.0.1:3000. A **DEV AUTH** panel appears top-right — click `alice`,
`bob`, `carol`, or `dave` to sign in instantly as that user (no Google popup); `out`
signs out. The selection persists across reloads.

Dummy users: `alice@dev.local` … `dave@dev.local`, password `devpass1!`, all pre-set to
the `pickleball` sport preference so the first-run picker doesn't block the UI.

### Notes / gotchas
- All projectIds must match the emulator's configured project (`picklebaddies-85732`,
  from `.firebaserc` + `firebase.json` `singleProjectMode: false`). The dev/test scripts
  pin this; if you wire your own, set `NEXT_PUBLIC_FIREBASE_PROJECT_ID` and
  `FIREBASE_ADMIN_PROJECT_ID` accordingly.
- The live console (generate/start/score/rebalance) runs via **Cloud Functions**, so the
  functions emulator must be running for those flows.
- The dev-auth path is inert in production (`NODE_ENV=production`) and whenever
  `NEXT_PUBLIC_USE_EMULATORS` is not `true`.

## End-to-end tests (Playwright)

The e2e suite drives the real UI as the dummy users and covers the casual-team core
flows: create squad → add members → create session → add players → generate rounds →
start → score → rebalance (locked matches preserved).

```bash
# One-shot: boots emulators, seeds, runs all specs, tears down
pnpm test:e2e:full
```

To iterate against already-running emulators (faster):

```bash
pnpm emulators            # in one terminal (auth,firestore,functions)
pnpm dev:seed             # once
pnpm --filter @picklebaddies/web test:e2e            # all specs
pnpm --filter @picklebaddies/web exec playwright test e2e/squad.spec.ts   # one spec
```

Specs live in `apps/web/e2e/`; shared helpers in `apps/web/e2e/fixtures/`. Playwright
boots the dev server itself (see `apps/web/playwright.config.ts`) with the dev-auth +
emulator env; emulators must already be running (or use `test:e2e:full`).
