# Dev Mode + Playwright Core-Flow Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the app locally with no real auth — a switchable set of dummy users backed by the Firebase Auth emulator — and add Playwright tests covering the casual-team core flows (create squad, add members, create session, add players + generate rounds, score/advance/rebalance live).

**Architecture:** A dev-only `NEXT_PUBLIC_DEV_AUTH` flag (hard-gated to non-prod + emulators) mounts a floating user-switcher that signs the client into the Auth emulator as a fixed dummy user. This flows through the existing `AuthProvider` → `__session` cookie → server `verifySession()` unchanged, so Firestore rules and server actions stay faithful. An idempotent seed script pre-creates the dummy accounts/profiles so the owner can add them by email. Playwright drives the real UI via added `data-testid` hooks.

**Tech Stack:** Next.js 15 / React 19, firebase (client) + firebase-admin (seed), Firebase Auth+Firestore emulators, Playwright, Vitest (gate unit test).

**Reference docs:** spec at `docs/superpowers/specs/2026-06-23-dev-mode-e2e-tests-design.md`. Emulator ports (from `firebase.json`): auth `9099`, firestore `8080`.

**Conventions to honor:** client Firebase access lives in `apps/web/src/lib/**`; never change `verifySession()` or any `apps/web/src/server/**` action; `match-engine` untouched. Commit messages end with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

## Phase 1 — Dev auth core (gate + roster + sign-in helper)

### Task 1: Dev-auth gate + roster module (TDD)

**Files:**
- Create: `apps/web/src/lib/auth/dev-auth.ts`
- Test: `apps/web/src/lib/auth/dev-auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/auth/dev-auth.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { DEV_USERS, isDevAuthEnabled } from "./dev-auth";

const orig = { ...process.env };
afterEach(() => { process.env = { ...orig }; });

describe("DEV_USERS roster", () => {
  it("has 4 dummy users with unique emails and dev.local domain", () => {
    expect(DEV_USERS).toHaveLength(4);
    const emails = DEV_USERS.map((u) => u.email);
    expect(new Set(emails).size).toBe(4);
    expect(emails.every((e) => e.endsWith("@dev.local"))).toBe(true);
    expect(DEV_USERS.map((u) => u.key)).toEqual(["alice", "bob", "carol", "dave"]);
  });
});

describe("isDevAuthEnabled gate", () => {
  it("true only when flag + emulators on and not production", () => {
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_DEV_AUTH = "true";
    process.env.NEXT_PUBLIC_USE_EMULATORS = "true";
    expect(isDevAuthEnabled()).toBe(true);
  });
  it("false in production even if flags on", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_DEV_AUTH = "true";
    process.env.NEXT_PUBLIC_USE_EMULATORS = "true";
    expect(isDevAuthEnabled()).toBe(false);
  });
  it("false when emulators flag missing", () => {
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_DEV_AUTH = "true";
    delete process.env.NEXT_PUBLIC_USE_EMULATORS;
    expect(isDevAuthEnabled()).toBe(false);
  });
  it("false when dev-auth flag missing", () => {
    process.env.NODE_ENV = "development";
    delete process.env.NEXT_PUBLIC_DEV_AUTH;
    process.env.NEXT_PUBLIC_USE_EMULATORS = "true";
    expect(isDevAuthEnabled()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @picklebaddies/web exec vitest run src/lib/auth/dev-auth.test.ts`
Expected: FAIL — cannot resolve `./dev-auth`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/auth/dev-auth.ts
"use client";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, type Auth } from "firebase/auth";

export interface DevUser { key: string; email: string; password: string; displayName: string; }

export const DEV_USERS: DevUser[] = [
  { key: "alice", email: "alice@dev.local", password: "devpass1!", displayName: "Alice Dev" },
  { key: "bob",   email: "bob@dev.local",   password: "devpass1!", displayName: "Bob Dev" },
  { key: "carol", email: "carol@dev.local", password: "devpass1!", displayName: "Carol Dev" },
  { key: "dave",  email: "dave@dev.local",  password: "devpass1!", displayName: "Dave Dev" },
];

export const DEV_USER_STORAGE_KEY = "pb.devUser";

/** Dev-only auth switcher is active ONLY in non-prod with emulators + the explicit flag. */
export function isDevAuthEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_AUTH === "true" &&
    process.env.NEXT_PUBLIC_USE_EMULATORS === "true"
  );
}

/** Sign into the Auth emulator as a dummy user; create the account on first use. */
export async function signInAsDevUser(auth: Auth, user: DevUser): Promise<void> {
  try {
    await signInWithEmailAndPassword(auth, user.email, user.password);
  } catch {
    const cred = await createUserWithEmailAndPassword(auth, user.email, user.password);
    await updateProfile(cred.user, { displayName: user.displayName });
  }
}

export async function signOutDevUser(auth: Auth): Promise<void> {
  await signOut(auth);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @picklebaddies/web exec vitest run src/lib/auth/dev-auth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/auth/dev-auth.ts apps/web/src/lib/auth/dev-auth.test.ts
git commit -m "feat(dev-auth): gate + dummy-user roster + emulator sign-in helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: DevUserSwitcher component

**Files:**
- Create: `apps/web/src/components/DevUserSwitcher.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/DevUserSwitcher.tsx
"use client";
import { useEffect, useState } from "react";
import { getFirebaseServices } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/useAuth";
import {
  DEV_USERS, DEV_USER_STORAGE_KEY, isDevAuthEnabled, signInAsDevUser, signOutDevUser,
} from "@/lib/auth/dev-auth";

export function DevUserSwitcher() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const enabled = isDevAuthEnabled();

  // Auto sign-in to the last selected dummy user on first load.
  useEffect(() => {
    if (!enabled || user) return;
    const lastKey = typeof window !== "undefined" ? localStorage.getItem(DEV_USER_STORAGE_KEY) : null;
    const target = DEV_USERS.find((u) => u.key === lastKey);
    if (target) void switchTo(target.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user]);

  if (!enabled) return null;

  async function switchTo(key: string) {
    const target = DEV_USERS.find((u) => u.key === key);
    if (!target) return;
    setBusy(true);
    try {
      const { auth } = getFirebaseServices();
      localStorage.setItem(DEV_USER_STORAGE_KEY, key);
      await signInAsDevUser(auth, target);
    } finally { setBusy(false); }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      const { auth } = getFirebaseServices();
      localStorage.removeItem(DEV_USER_STORAGE_KEY);
      await signOutDevUser(auth);
    } finally { setBusy(false); }
  }

  return (
    <div
      data-testid="dev-user-switcher"
      style={{
        position: "fixed", bottom: 12, right: 12, zIndex: 9999,
        background: "#16241C", color: "#C6F135", border: "2px solid #C6F135",
        borderRadius: 12, padding: "8px 10px", fontFamily: "monospace", fontSize: 12,
        display: "flex", flexDirection: "column", gap: 6, boxShadow: "0 4px 16px rgba(0,0,0,.4)",
      }}
    >
      <strong style={{ letterSpacing: ".08em" }}>DEV AUTH</strong>
      <span data-testid="dev-current-user">{user?.displayName ?? user?.email ?? "signed out"}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {DEV_USERS.map((u) => (
          <button
            key={u.key}
            data-testid={`dev-user-option-${u.key}`}
            disabled={busy}
            onClick={() => switchTo(u.key)}
            style={{ cursor: "pointer", borderRadius: 8, border: "1px solid #C6F135", background: "transparent", color: "#C6F135", padding: "2px 6px" }}
          >
            {u.key}
          </button>
        ))}
        <button
          data-testid="dev-sign-out"
          disabled={busy}
          onClick={handleSignOut}
          style={{ cursor: "pointer", borderRadius: 8, border: "1px solid #F03E3E", background: "transparent", color: "#F03E3E", padding: "2px 6px" }}
        >
          out
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @picklebaddies/web exec tsc --noEmit`
Expected: PASS (no new errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/DevUserSwitcher.tsx
git commit -m "feat(dev-auth): floating DevUserSwitcher component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Mount the switcher in the root layout

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Edit layout to render the switcher inside AuthProvider**

Replace the `<body>` block:

```tsx
      <body>
        <AuthProvider>
          {children}
          <DevUserSwitcher />
        </AuthProvider>
      </body>
```

And add the import near the top, after the AuthProvider import:

```tsx
import { DevUserSwitcher } from "@/components/DevUserSwitcher";
```

(`DevUserSwitcher` self-hides via `isDevAuthEnabled()`, so it is inert in prod.)

- [ ] **Step 2: Verify build/typecheck**

Run: `pnpm --filter @picklebaddies/web exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat(dev-auth): mount DevUserSwitcher in root layout (dev-gated)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 2 — Seed script + env wiring

### Task 4: Dummy-user seed script

**Files:**
- Create: `scripts/dev-seed.ts`
- Modify: `package.json` (root) — add `dev:seed` script

- [ ] **Step 1: Write the seed script**

```ts
// scripts/dev-seed.ts
// Idempotent: ensure the 4 dummy Auth-emulator users + their users/{uid} and
// players/{uid} docs exist, so the owner can add them by email and the leaderboard works.
// Requires emulator env: FIREBASE_AUTH_EMULATOR_HOST + FIRESTORE_EMULATOR_HOST.
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const DEV_USERS = [
  { email: "alice@dev.local", password: "devpass1!", displayName: "Alice Dev" },
  { email: "bob@dev.local",   password: "devpass1!", displayName: "Bob Dev" },
  { email: "carol@dev.local", password: "devpass1!", displayName: "Carol Dev" },
  { email: "dave@dev.local",  password: "devpass1!", displayName: "Dave Dev" },
];

async function main() {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Set FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST before seeding.");
  }
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "picklebaddies";
  if (getApps().length === 0) initializeApp({ projectId });
  const auth = getAuth();
  const db = getFirestore();

  for (const u of DEV_USERS) {
    let uid: string;
    try {
      const existing = await auth.getUserByEmail(u.email);
      uid = existing.uid;
    } catch {
      const created = await auth.createUser({ email: u.email, password: u.password, displayName: u.displayName, emailVerified: true });
      uid = created.uid;
    }
    await db.doc(`users/${uid}`).set({
      uid, email: u.email, displayName: u.displayName,
      displayNameLower: u.displayName.toLowerCase(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await db.doc(`players/${uid}`).set({
      uid, displayName: u.displayName, isGuest: false,
      totalGames: 0, totalWins: 0, totalLosses: 0,
      totalPointsFor: 0, totalPointsAgainst: 0, totalPointDiff: 0,
      totalSitOuts: 0, totalSessions: 0, lastPlayedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`seeded ${u.email} -> ${uid}`);
  }
  console.log("dev-seed complete");
}
main().catch((e) => { console.error(e); process.exit(1); });
```

> NOTE on `users/{uid}` fields: confirm the field used by `searchUsers` (in
> `apps/web/src/server/users/actions.ts`). If it searches `displayNameLower`, the doc above
> matches; if it searches a different field, mirror that field name here so seeded users are
> discoverable in the member picker. Open that file and align before running.

- [ ] **Step 2: Add the root script**

In root `package.json` `"scripts"`, add:

```json
    "dev:seed": "FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 tsx scripts/dev-seed.ts"
```

If `tsx` is not already a dev dependency at the root, add it: `pnpm add -Dw tsx`.

- [ ] **Step 3: Run it against a running emulator to verify**

Run (in one terminal): `pnpm emulators`
Run (in another): `pnpm dev:seed`
Expected: prints `seeded alice@dev.local -> <uid>` for all 4, then `dev-seed complete`. Run it twice — second run must succeed identically (idempotent).

- [ ] **Step 4: Commit**

```bash
git add scripts/dev-seed.ts package.json
git commit -m "feat(dev-auth): idempotent dummy-user seed script + dev:seed

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Env + dev script wiring

**Files:**
- Modify: `apps/web/.env.example`
- Modify: `apps/web/package.json` (add a dev:e2e-friendly dev script)
- Modify: root `package.json` if `dev:web` needs the flag (see step)

- [ ] **Step 1: Document the flag in `.env.example`**

Append:

```bash
# Dev-only: enable the in-app dummy-user switcher (NON-PROD + emulators only).
NEXT_PUBLIC_DEV_AUTH=false
```

- [ ] **Step 2: Add a dev-auth dev script in `apps/web/package.json`**

In `"scripts"`, add:

```json
    "dev:devauth": "NEXT_PUBLIC_USE_EMULATORS=true NEXT_PUBLIC_DEV_AUTH=true next dev"
```

- [ ] **Step 3: Manual smoke (human-in-the-loop)**

With `pnpm emulators` running and `pnpm dev:seed` done, run `pnpm --filter @picklebaddies/web dev:devauth`, open `http://127.0.0.1:3000`, confirm the DEV AUTH box appears bottom-right, click `alice`, and confirm you land authenticated (squad list loads, no Google sign-in). Click `bob` and confirm the identity switches.

- [ ] **Step 4: Commit**

```bash
git add apps/web/.env.example apps/web/package.json
git commit -m "chore(dev-auth): document flag + add dev:devauth script

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 3 — `data-testid` hooks on core flows

> Each task only ADDS `data-testid` attributes to existing JSX — no logic/style changes.
> After each, run `pnpm --filter @picklebaddies/web exec tsc --noEmit` (expect PASS) and commit.

### Task 6: Squad list + create testids

**Files:**
- Modify: `apps/web/src/app/(app)/groups/page.tsx`

- [ ] **Step 1: Add testids**

- On the squad-name `<input>` (bound to `name`): add `data-testid="squad-name-input"`.
- On the create submit `<button>` (the one in the create-group form): add `data-testid="squad-create-submit"`.
- On each rendered group link/card in the `groups.map(...)`: add `data-testid="squad-list-item"`.

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @picklebaddies/web exec tsc --noEmit
git add "apps/web/src/app/(app)/groups/page.tsx"
git commit -m "test(e2e): add data-testid to squad list/create

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 7: Squad detail (member picker + member list) testids

**Files:**
- Modify: `apps/web/src/app/(app)/groups/[groupId]/page.tsx`

- [ ] **Step 1: Add testids**

- Member search `<input>` (bound to `searchQuery`): `data-testid="member-search-input"`.
- Each dropdown result row in `searchResults.map(...)`: `data-testid="member-search-result"`.
- Add-member submit `<button>` (in the form using `handleAddMember`): `data-testid="member-add-submit"`.
- Each member row in `players.map(...)` (the members list): `data-testid="member-list-item"`.

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @picklebaddies/web exec tsc --noEmit
git add "apps/web/src/app/(app)/groups/[groupId]/page.tsx"
git commit -m "test(e2e): add data-testid to squad member picker/list

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 8: Session creation testids

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/new/page.tsx`

- [ ] **Step 1: Add testids**

- Session-name `<input>` (bound to `name`): `data-testid="session-name-input"`.
- Venue `<input>` (bound to `venueName`): `data-testid="session-venue-input"`.
- Courts `<textarea>` (bound to `courtsText`): `data-testid="session-courts-input"`.
- Each sport `<button>` in the sport map: `data-testid={`session-sport-${s}`}`.
- Final create submit `<button type="submit">`: `data-testid="session-create-submit"`.

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @picklebaddies/web exec tsc --noEmit
git add "apps/web/src/app/(app)/sessions/new/page.tsx"
git commit -m "test(e2e): add data-testid to session creation form

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 9: Sessions list testid

**Files:**
- Modify: the page that lists sessions for a squad — likely `apps/web/src/app/(app)/groups/[groupId]/page.tsx` (the `sessions` tab) and/or `apps/web/src/app/(app)/dashboard/page.tsx`.

- [ ] **Step 1: Locate the session list render**

Run: `grep -rn "session" "apps/web/src/app/(app)/groups/[groupId]/page.tsx" | grep -i "map\|Link\|href"` to find where sessions render. Add `data-testid="session-list-item"` to each rendered session link/card. If the dashboard also lists sessions, add it there too.

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @picklebaddies/web exec tsc --noEmit
git add -A
git commit -m "test(e2e): add data-testid to session list items

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 10: Live console testids

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`

- [ ] **Step 1: Add testids to these elements (match by their existing text/handler)**

- Add-player `<select>` (bound to `selectedGroupPlayerId`): `data-testid="add-player-select"`.
- Add-player `<button onClick={handleAddLatePlayer}>`: `data-testid="add-player-submit"`.
- `<button onClick={handleGenerate}>` ("Generate Schedule"): `data-testid="generate-schedule-btn"`.
- `<button onClick={handleStart}>` ("Start Session"): `data-testid="start-session-btn"`.
- `<button onClick={handleAdvance}>` ("Advance Round"): `data-testid="advance-round-btn"`.
- Rebalance `<button onClick={() => handleRebalance("manual_rebalance")}>` ("Rebalance Future Rounds"): `data-testid="rebalance-btn"`.
- Complete-session `<button onClick={() => completeSession(...)}>`: `data-testid="complete-session-btn"`.
- Each round container in the rounds render: `data-testid="round-card"` and add a `data-round={roundNumber}` attribute for assertions.
- Each match container in the matches render: `data-testid="match-card"` and add `data-match-id={m.id}` and `data-locked={m.status === "completed" || m.status === "in_progress"}`.
- Each player name element inside a match: `data-testid="match-player"`.
- Points-mode score form inputs: the `name="teamA"` input → also `data-testid="score-team-a-input"`; `name="teamB"` input → `data-testid="score-team-b-input"`; the `<button type="submit">` ("Save Score") → `data-testid="save-score-btn"`.
- The fairness chip element (from `generationRuns` metadata in the header): `data-testid="fairness-chip"`.
- The sit-out list container: `data-testid="sitout-list"`.

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @picklebaddies/web exec tsc --noEmit
git add "apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx"
git commit -m "test(e2e): add data-testid to live console controls

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 4 — Playwright setup + fixtures

### Task 11: Install Playwright + config

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/playwright.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Install**

Run: `pnpm --filter @picklebaddies/web add -D @playwright/test` then `pnpm --filter @picklebaddies/web exec playwright install chromium`.

- [ ] **Step 2: Write the config**

```ts
// apps/web/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // shared emulator state; keep serial
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    ...devices["Pixel 5"], // mobile-first PWA
  },
  webServer: {
    command: "NEXT_PUBLIC_USE_EMULATORS=true NEXT_PUBLIC_DEV_AUTH=true next dev",
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_USE_EMULATORS: "true",
      NEXT_PUBLIC_DEV_AUTH: "true",
    },
  },
});
```

- [ ] **Step 3: Add scripts to `apps/web/package.json`**

```json
    "test:e2e": "playwright test",
    "test:e2e:full": "firebase emulators:exec --only auth,firestore --project picklebaddies-85732 \"pnpm dev:seed && pnpm --filter @picklebaddies/web test:e2e\""
```

> `dev:seed` is a root script; `firebase emulators:exec` runs from repo root, so invoke as
> shown. If running `test:e2e:full` from `apps/web`, prefix paths accordingly. Keep the
> canonical `test:e2e:full` runnable from the repo root.

- [ ] **Step 4: Ignore Playwright artifacts**

Append to `.gitignore`:

```
# Playwright
apps/web/test-results/
apps/web/playwright-report/
apps/web/.playwright/
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/playwright.config.ts .gitignore pnpm-lock.yaml
git commit -m "test(e2e): add Playwright config + scripts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Shared fixtures (user switching + setup helpers)

**Files:**
- Create: `apps/web/e2e/fixtures/users.ts`
- Create: `apps/web/e2e/fixtures/setup.ts`

- [ ] **Step 1: User-switching helper**

```ts
// apps/web/e2e/fixtures/users.ts
import { type Page, expect } from "@playwright/test";

export const DEV_KEYS = ["alice", "bob", "carol", "dave"] as const;
export type DevKey = (typeof DEV_KEYS)[number];
export const DEV_NAME: Record<DevKey, string> = {
  alice: "Alice Dev", bob: "Bob Dev", carol: "Carol Dev", dave: "Dave Dev",
};
export const DEV_EMAIL: Record<DevKey, string> = {
  alice: "alice@dev.local", bob: "bob@dev.local", carol: "carol@dev.local", dave: "dave@dev.local",
};

/** Switch the app to a given dummy user via the dev switcher, wait until signed in. */
export async function signInAs(page: Page, key: DevKey): Promise<void> {
  await expect(page.getByTestId("dev-user-switcher")).toBeVisible();
  await page.getByTestId(`dev-user-option-${key}`).click();
  await expect(page.getByTestId("dev-current-user")).toHaveText(DEV_NAME[key], { timeout: 15_000 });
}
```

- [ ] **Step 2: Squad/session setup helpers**

```ts
// apps/web/e2e/fixtures/setup.ts
import { type Page, expect } from "@playwright/test";

/** Create a squad from the groups page; returns the squad id from the resulting URL. */
export async function createSquad(page: Page, name: string): Promise<string> {
  await page.goto("/groups");
  await page.getByTestId("squad-name-input").fill(name);
  await page.getByTestId("squad-create-submit").click();
  await page.waitForURL(/\/groups\/[^/]+$/, { timeout: 15_000 });
  const m = page.url().match(/\/groups\/([^/?#]+)/);
  if (!m) throw new Error("squad id not found in URL: " + page.url());
  return m[1];
}

/** On a squad detail page, add a member by typing their name and picking the dropdown result. */
export async function addMemberByName(page: Page, displayName: string): Promise<void> {
  await page.getByTestId("member-search-input").fill(displayName);
  const result = page.getByTestId("member-search-result").filter({ hasText: displayName }).first();
  await expect(result).toBeVisible({ timeout: 10_000 });
  await result.click();
  await page.getByTestId("member-add-submit").click();
  await expect(page.getByTestId("member-list-item").filter({ hasText: displayName })).toBeVisible({ timeout: 10_000 });
}

/** Create a session in a squad; returns the session id from the resulting URL. */
export async function createSession(
  page: Page, squadId: string, opts: { name: string; venue: string; courts: string[]; sport?: "badminton" | "pickleball" },
): Promise<string> {
  await page.goto(`/sessions/new?groupId=${squadId}`);
  await page.getByTestId("session-name-input").fill(opts.name);
  await page.getByTestId("session-venue-input").fill(opts.venue);
  await page.getByTestId("session-courts-input").fill(opts.courts.join("\n"));
  if (opts.sport) await page.getByTestId(`session-sport-${opts.sport}`).click();
  await page.getByTestId("session-create-submit").click();
  await page.waitForURL(/\/sessions\/[^/]+/, { timeout: 15_000 });
  const m = page.url().match(/\/sessions\/([^/?#]+)/);
  if (!m) throw new Error("session id not found in URL: " + page.url());
  return m[1];
}

/** On the live console, add a squad player by display name via the add-player select. */
export async function addLivePlayer(page: Page, displayName: string): Promise<void> {
  await page.getByTestId("add-player-select").selectOption({ label: displayName });
  await page.getByTestId("add-player-submit").click();
  await expect(page.getByTestId("match-player").filter({ hasText: displayName }).first()
    .or(page.getByText(displayName).first())).toBeVisible({ timeout: 10_000 });
}
```

> NOTE: confirm the new-session route accepts `?groupId=` preselection (the page has a
> `groupId` select bound to state). If it does not read the query param, instead select the
> squad in the `<select>` (add a `data-testid="session-group-select"` in Task 8 and use
> `selectOption`). Verify when wiring `session.spec.ts`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @picklebaddies/web exec tsc --noEmit` (Playwright types should resolve; if `e2e/` is excluded from the app tsconfig that's fine — Playwright compiles its own).

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/fixtures
git commit -m "test(e2e): shared fixtures for user switching + squad/session setup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 5 — Playwright specs (run each against live emulators)

> Before each spec task: ensure emulators are running and `pnpm dev:seed` has run.
> Run a spec with `pnpm --filter @picklebaddies/web exec playwright test e2e/<file>`.
> Because UI selectors can drift, EXPECT to adjust testids/locators while getting each spec
> green — that adjustment IS the task, not a placeholder.

### Task 13: squad.spec.ts (create squad + add member multi-user)

**Files:**
- Create: `apps/web/e2e/squad.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// apps/web/e2e/squad.spec.ts
import { test, expect } from "@playwright/test";
import { signInAs, DEV_NAME } from "./fixtures/users";
import { createSquad, addMemberByName } from "./fixtures/setup";

test.describe("squad creation + membership", () => {
  test("owner creates a squad and adds a member; member sees the squad", async ({ page }) => {
    await page.goto("/");
    await signInAs(page, "alice");

    const squadName = `Smashers ${Date.now()}`;
    const squadId = await createSquad(page, squadName);
    expect(squadId).toBeTruthy();

    // Alice (owner) adds Bob by name via the picker.
    await addMemberByName(page, DEV_NAME.bob);
    await expect(page.getByTestId("member-list-item").filter({ hasText: DEV_NAME.bob })).toBeVisible();

    // Switch to Bob: he should see the squad in his groups list.
    await signInAs(page, "bob");
    await page.goto("/groups");
    await expect(page.getByTestId("squad-list-item").filter({ hasText: squadName })).toBeVisible({ timeout: 15_000 });
  });
});
```

- [ ] **Step 2: Run + make green**

Run: `pnpm --filter @picklebaddies/web exec playwright test e2e/squad.spec.ts`
Expected: PASS. Adjust locators/testids if the picker dropdown or list markup differs from assumptions; re-run until green.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/squad.spec.ts
git commit -m "test(e2e): squad creation + member add multi-user flow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 14: session.spec.ts (create session)

**Files:**
- Create: `apps/web/e2e/session.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// apps/web/e2e/session.spec.ts
import { test, expect } from "@playwright/test";
import { signInAs } from "./fixtures/users";
import { createSquad, createSession } from "./fixtures/setup";

test.describe("session creation", () => {
  test("owner creates a session in a squad", async ({ page }) => {
    await page.goto("/");
    await signInAs(page, "alice");

    const squadId = await createSquad(page, `Sesh ${Date.now()}`);
    const sessionName = `Friday Night ${Date.now()}`;
    const sessionId = await createSession(page, squadId, {
      name: sessionName, venue: "Community Hall", courts: ["Court 1", "Court 2"], sport: "pickleball",
    });
    expect(sessionId).toBeTruthy();

    // The session should be reachable and show its name.
    await expect(page.getByText(sessionName)).toBeVisible({ timeout: 15_000 });
  });
});
```

- [ ] **Step 2: Run + make green**

Run: `pnpm --filter @picklebaddies/web exec playwright test e2e/session.spec.ts`
Expected: PASS. If `?groupId=` preselection is not supported, switch the helper to select the squad in the dropdown (see NOTE in Task 12) and re-run.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/session.spec.ts
git commit -m "test(e2e): session creation flow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 15: rounds.spec.ts (add players + generate)

**Files:**
- Create: `apps/web/e2e/rounds.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// apps/web/e2e/rounds.spec.ts
import { test, expect } from "@playwright/test";
import { signInAs, DEV_NAME } from "./fixtures/users";
import { createSquad, addMemberByName, createSession, addLivePlayer } from "./fixtures/setup";

test.describe("round generation", () => {
  test("add four players and generate a fair round", async ({ page }) => {
    await page.goto("/");
    await signInAs(page, "alice");

    const squadId = await createSquad(page, `Gen ${Date.now()}`);
    // Build a 4-player squad: Alice (owner) + Bob + Carol + Dave.
    await addMemberByName(page, DEV_NAME.bob);
    await addMemberByName(page, DEV_NAME.carol);
    await addMemberByName(page, DEV_NAME.dave);

    const sessionId = await createSession(page, squadId, {
      name: `Round Test ${Date.now()}`, venue: "Hall", courts: ["Court 1"], sport: "badminton",
    });

    // Open the live console and add the four players.
    await page.goto(`/sessions/${sessionId}/live`);
    for (const name of [DEV_NAME.alice, DEV_NAME.bob, DEV_NAME.carol, DEV_NAME.dave]) {
      await addLivePlayer(page, name);
    }

    // Generate the schedule.
    await page.getByTestId("generate-schedule-btn").click();

    // One round, one match, four distinct players.
    await expect(page.getByTestId("round-card").first()).toBeVisible({ timeout: 15_000 });
    const match = page.getByTestId("match-card").first();
    await expect(match).toBeVisible();
    await expect(match.getByTestId("match-player")).toHaveCount(4);
    await expect(page.getByTestId("fairness-chip")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run + make green**

Run: `pnpm --filter @picklebaddies/web exec playwright test e2e/rounds.spec.ts`
Expected: PASS. If players are auto-included some other way, or the add-player select labels differ, adjust `addLivePlayer` and re-run. If generate is disabled until session has ≥4 players, ensure all four were added first.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/rounds.spec.ts
git commit -m "test(e2e): add players + generate round

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 16: live-edit.spec.ts (score, advance, rebalance preserves locked)

**Files:**
- Create: `apps/web/e2e/live-edit.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// apps/web/e2e/live-edit.spec.ts
import { test, expect } from "@playwright/test";
import { signInAs, DEV_NAME } from "./fixtures/users";
import { createSquad, addMemberByName, createSession, addLivePlayer } from "./fixtures/setup";

test.describe("live session editing", () => {
  test("score a match, advance, then rebalance preserves the locked match", async ({ page }) => {
    await page.goto("/");
    await signInAs(page, "alice");

    const squadId = await createSquad(page, `Live ${Date.now()}`);
    await addMemberByName(page, DEV_NAME.bob);
    await addMemberByName(page, DEV_NAME.carol);
    await addMemberByName(page, DEV_NAME.dave);

    const sessionId = await createSession(page, squadId, {
      name: `Live Test ${Date.now()}`, venue: "Hall", courts: ["Court 1"], sport: "pickleball",
    });

    await page.goto(`/sessions/${sessionId}/live`);
    for (const name of [DEV_NAME.alice, DEV_NAME.bob, DEV_NAME.carol, DEV_NAME.dave]) {
      await addLivePlayer(page, name);
    }
    await page.getByTestId("generate-schedule-btn").click();
    await expect(page.getByTestId("match-card").first()).toBeVisible({ timeout: 15_000 });

    // Start the session, then score round 1's match (points mode).
    await page.getByTestId("start-session-btn").click();
    const match = page.getByTestId("match-card").first();
    const matchId = await match.getAttribute("data-match-id");
    await match.getByTestId("score-team-a-input").fill("21");
    await match.getByTestId("score-team-b-input").fill("15");
    await match.getByTestId("save-score-btn").click();

    // The scored match becomes locked.
    await expect(page.locator(`[data-match-id="${matchId}"][data-locked="true"]`)).toBeVisible({ timeout: 15_000 });

    // Rebalance future rounds; accept the confirm dialog if shown.
    page.on("dialog", (d) => d.accept());
    await page.getByTestId("rebalance-btn").click();

    // The locked match must still be present and still locked (history preserved).
    await expect(page.locator(`[data-match-id="${matchId}"][data-locked="true"]`)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`[data-match-id="${matchId}"]`).getByText("21")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run + make green**

Run: `pnpm --filter @picklebaddies/web exec playwright test e2e/live-edit.spec.ts`
Expected: PASS. If scoring mode for pickleball defaults to winner_only in this build, switch to the winner-only buttons ("A Wins"/"B Wins" — add testids `score-winner-a`/`score-winner-b` in Task 10 if needed) and assert the locked state instead of the "21" text. Adjust and re-run until green.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/live-edit.spec.ts
git commit -m "test(e2e): live scoring + rebalance preserves locked match

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 6 — Full-suite green + docs

### Task 17: Run the whole suite from clean state

- [ ] **Step 1: Clean-state full run**

Run: `pnpm --filter @picklebaddies/web test:e2e:full`
Expected: emulators boot, seed runs, all 4 specs PASS. If a spec fails only due to leftover state from a prior run, confirm each spec uses unique names (they use `Date.now()`), and that `emulators:exec` starts from a clean emulator.

- [ ] **Step 2: Confirm unit tests + typecheck still green**

Run: `pnpm -r test` (expect domain 28, match-engine 51, web 38 [+1 dev-auth gate file = 5 new tests, so web 37→42]) and `pnpm -r typecheck`.
Expected: all PASS.

### Task 18: Document dev mode + e2e in README/DEPLOY

**Files:**
- Modify: `docs/DEPLOY.md` (or create `docs/DEV.md` if DEPLOY is deploy-only)

- [ ] **Step 1: Add a "Local dev without real auth" section**

Document: set `NEXT_PUBLIC_USE_EMULATORS=true` + `NEXT_PUBLIC_DEV_AUTH=true`; run `pnpm emulators`, `pnpm dev:seed`, `pnpm --filter @picklebaddies/web dev:devauth`; use the bottom-right DEV AUTH switcher (alice/bob/carol/dave). For tests: `pnpm --filter @picklebaddies/web test:e2e:full`. Note the prod hard-gate.

- [ ] **Step 2: Commit**

```bash
git add docs/
git commit -m "docs: local dev-auth mode + e2e test instructions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 19: Mark plan processed

- [ ] **Step 1: Move the plan once all tasks done + suite green**

```bash
git mv docs/superpowers/plans/2026-06-23-dev-mode-e2e-tests.md docs/superpowers/plans/processed/2026-06-23-dev-mode-e2e-tests.md
git commit -m "chore(plans): mark dev-mode-e2e-tests processed

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review notes (coverage map)

- Spec §1 dev auth mode → Tasks 1–3, 5.
- Spec §2 seeding → Task 4.
- Spec §3 tooling/scripts → Tasks 5, 11.
- Spec §4 testids → Tasks 6–10.
- Spec §5 four suites → Tasks 13–16.
- Spec acceptance (prod-inert gate) → Task 1 tests; (clean-state suite green) → Task 17; (no server/engine changes) → enforced by task scope (testid-only edits, no `server/**` touch).

**Known adaptation points (call out, not placeholders):** new-session `?groupId=` preselection (Task 12 NOTE), `searchUsers` field name (Task 4 NOTE), pickleball default scoring mode for the score assertion (Task 16 Step 2). Each has a concrete fallback in-line.
