# Deploying PickleBaddies to Firebase

PickleBaddies deploys entirely on Firebase — **not Vercel**. The Next.js app is
served via Firebase Hosting's web-frameworks integration (SSR runs on Cloud
Functions/Cloud Run), backed by callable Cloud Functions, Firestore, and Auth.

## What gets deployed

| Target | Source | Notes |
|---|---|---|
| Hosting (Next.js SSR) | `apps/web` | `firebase.json → hosting.frameworksBackend`, region `europe-west2` |
| Cloud Functions | `functions` | Node 20 runtime, built by the `predeploy` hook |
| Firestore rules | `firestore.rules` | |
| Firestore indexes | `firestore.indexes.json` | currently empty |

## One-time setup

1. **Firebase project** — `.firebaserc` points at project id `picklebaddies`.
   Use `firebase use <project-id>` to target a different project.
2. **Enable web frameworks** — the Next.js adapter is still behind a CLI flag:
   ```bash
   export FIREBASE_CLI_EXPERIMENTS=webframeworks
   ```
3. **Web client config** — copy `apps/web/.env.example` to `apps/web/.env.local`
   and fill the `NEXT_PUBLIC_FIREBASE_*` values from the Firebase console
   (Project settings → Web app). These are public client keys, safe to embed.

## Build ordering (important)

The pure workspace packages `@picklebaddies/domain` and
`@picklebaddies/match-engine` are consumed via their compiled `dist/` output,
which is gitignored. They **must** be built before the web and functions builds.
This is wired up automatically:

- **Hosting**: `apps/web`'s `build` script runs `build:deps` first
  (`pnpm run build:deps && next build`).
- **Functions**: the `firebase.json` `predeploy` hook builds `domain` and
  `match-engine` before compiling `functions`.

So a clean checkout deploys correctly with no manual prebuild step.

## Deploy

```bash
export FIREBASE_CLI_EXPERIMENTS=webframeworks
firebase deploy --only hosting,functions,firestore --project picklebaddies
```

Or deploy individual targets, e.g. `firebase deploy --only firestore:rules`.

## CI/CD

- `.github/workflows/ci.yml` — runs typecheck, unit tests, rules tests, and
  emulator integration tests on every push/PR.
- `.github/workflows/deploy.yml` — deploys on push to `main` (or manual
  dispatch). Requires a `FIREBASE_SERVICE_ACCOUNT` secret and the
  `NEXT_PUBLIC_FIREBASE_*` repository variables.

## Local emulation

```bash
pnpm install
pnpm emulators        # auth, firestore, functions, hosting, UI
pnpm seed             # demo group/players/venue/session (separate terminal)
pnpm dev:web          # Next.js dev server against emulators (set NEXT_PUBLIC_USE_EMULATORS=true)
```
