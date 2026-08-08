# M1: Authentication + Role Axes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user sign in with Google or email, get a persisted profile document, sign out, and gate every protected action through a single shared role-resolution layer.

**Architecture:** Pure role/permission logic lives in a new framework-free `packages/domain` so the **same** predicates run in the web UI (button gating) and later in Cloud Functions (server-side checks, PRD §19.9) — no duplication, no drift. The web app wraps Firebase Auth in a React context that, on sign-in, idempotently writes the `users/{uid}` profile doc (PRD §15.1). Protected pages live under a route group whose client layout redirects unauthenticated users to `/sign-in`.

**Tech Stack:** Next.js 15 (App Router, React 19), Firebase Auth + Firestore (modular SDK v11), Firebase Emulator Suite, Vitest, `@firebase/rules-unit-testing`.

**Prerequisite:** M0 is complete and committed (`016a05d`). A Firebase project must be reachable for live sign-in (or use the Auth emulator: set `NEXT_PUBLIC_USE_EMULATORS=true` in `apps/web/.env.local`).

**DELTA_SPEC mapping:** This plan implements **D5** (two role axes: group-membership role vs session participation type). It deliberately does *not* touch session participation beyond defining the `ParticipantType` enum — that is consumed in M3+.

---

## File Structure

**New package — `packages/domain`** (pure, zero dependencies):
- `packages/domain/package.json` — `@picklebaddies/domain`, ESM, vitest.
- `packages/domain/tsconfig.json` — extends base.
- `packages/domain/vitest.config.ts`
- `packages/domain/src/roles.ts` — role/participant types, `resolveGroupRole`, permission predicates.
- `packages/domain/src/roles.test.ts`
- `packages/domain/src/index.ts` — barrel export.

**Web — `apps/web`**:
- `apps/web/vitest.config.ts` — pure unit tests (node env).
- `apps/web/src/lib/auth/profile.ts` — `buildUserProfile` (pure) + `ensureUserProfile` (Firestore write).
- `apps/web/src/lib/auth/profile.test.ts` — pure test of `buildUserProfile`.
- `apps/web/src/lib/auth/sign-in.ts` — Google/email sign-in, register, sign-out.
- `apps/web/src/lib/auth/AuthProvider.tsx` — context + `onAuthStateChanged`.
- `apps/web/src/lib/auth/useAuth.ts` — consumer hook.
- `apps/web/src/lib/auth/types.ts` — `AuthState`.
- `apps/web/src/app/sign-in/page.tsx` — sign-in screen.
- `apps/web/src/app/(app)/layout.tsx` — protected route-group layout (redirects).
- `apps/web/src/app/(app)/dashboard/page.tsx` — minimal authed landing.
- `apps/web/src/app/layout.tsx` — **modify** to wrap children in `<AuthProvider>`.

**Rules tests**:
- `apps/web/firestore.users.rules.test.ts` — emulator test of `users/{uid}` rule.
- `apps/web/package.json` — **modify**: add `test`, `test:rules` scripts + dev deps.

**Root**:
- `package.json` — **modify**: ensure `pnpm -r test` picks up new packages (already wildcards).

---

## Task 1: Domain package skeleton + role types

**Files:**
- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/vitest.config.ts`
- Create: `packages/domain/src/roles.ts`
- Create: `packages/domain/src/index.ts`

- [ ] **Step 1: Create the package manifest**

`packages/domain/package.json`:
```json
{
  "name": "@picklebaddies/domain",
  "version": "0.1.0",
  "description": "Pure shared domain logic (roles, permissions, enums). Zero runtime deps.",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create tsconfig and vitest config**

`packages/domain/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

`packages/domain/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 3: Define role types and the member shape**

`packages/domain/src/roles.ts`:
```typescript
// DELTA_SPEC D5 — two independent role axes.

/** Axis A: controls group + session management permissions (PRD §11, §15.3). */
export type GroupRole = "owner" | "organiser" | "member";

/** Axis B: how a person participates in a session (PRD §11, §15.8). NOT a permission. */
export type ParticipantType = "registered_user" | "guest";

/** One membership record from groups/{groupId}/members. */
export interface GroupMember {
  userId: string;
  role: GroupRole;
}
```

- [ ] **Step 4: Create the barrel export**

`packages/domain/src/index.ts`:
```typescript
export * from "./roles.js";
```

- [ ] **Step 5: Verify it builds**

Run: `pnpm --filter @picklebaddies/domain build`
Expected: exits 0, creates `packages/domain/dist/index.js`.

- [ ] **Step 6: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): scaffold shared pure domain package with role types"
```

---

## Task 2: `resolveGroupRole` (TDD)

**Files:**
- Modify: `packages/domain/src/roles.ts`
- Test: `packages/domain/src/roles.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/domain/src/roles.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { resolveGroupRole, type GroupMember } from "./roles.js";

const members: GroupMember[] = [
  { userId: "u-owner", role: "owner" },
  { userId: "u-org", role: "organiser" },
  { userId: "u-mem", role: "member" },
];

describe("resolveGroupRole", () => {
  it("returns the role for a known member", () => {
    expect(resolveGroupRole(members, "u-owner")).toBe("owner");
    expect(resolveGroupRole(members, "u-org")).toBe("organiser");
    expect(resolveGroupRole(members, "u-mem")).toBe("member");
  });

  it("returns null for a non-member", () => {
    expect(resolveGroupRole(members, "stranger")).toBeNull();
  });

  it("returns null for an empty member list", () => {
    expect(resolveGroupRole([], "u-owner")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @picklebaddies/domain test`
Expected: FAIL — `resolveGroupRole is not a function` / not exported.

- [ ] **Step 3: Implement `resolveGroupRole`**

Append to `packages/domain/src/roles.ts`:
```typescript
/** Find a user's role within a group, or null if they are not a member. */
export function resolveGroupRole(
  members: GroupMember[],
  userId: string,
): GroupRole | null {
  const match = members.find((m) => m.userId === userId);
  return match ? match.role : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @picklebaddies/domain test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/roles.ts packages/domain/src/roles.test.ts
git commit -m "feat(domain): resolveGroupRole with tests"
```

---

## Task 3: Permission predicates (TDD)

Maps PRD §11 capability matrix to pure boolean checks. Every protected action calls one of these — UI now, Cloud Functions in M5/M6.

**Files:**
- Modify: `packages/domain/src/roles.ts`
- Modify: `packages/domain/src/roles.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/domain/src/roles.test.ts`:
```typescript
import {
  canManageGroup,
  canManageOrganisers,
  canCreateSession,
  canDeleteSession,
  canGenerateSchedule,
  canEnterScore,
  canManageSessionPlayers,
  canAdvanceRound,
} from "./roles.js";

describe("permission predicates (PRD §11)", () => {
  it("owner-only capabilities", () => {
    for (const fn of [canManageGroup, canManageOrganisers, canDeleteSession]) {
      expect(fn("owner")).toBe(true);
      expect(fn("organiser")).toBe(false);
      expect(fn("member")).toBe(false);
      expect(fn(null)).toBe(false);
    }
  });

  it("owner+organiser capabilities", () => {
    for (const fn of [
      canCreateSession,
      canGenerateSchedule,
      canEnterScore,
      canManageSessionPlayers,
      canAdvanceRound,
    ]) {
      expect(fn("owner")).toBe(true);
      expect(fn("organiser")).toBe(true);
      expect(fn("member")).toBe(false);
      expect(fn(null)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @picklebaddies/domain test`
Expected: FAIL — predicates not exported.

- [ ] **Step 3: Implement the predicates**

Append to `packages/domain/src/roles.ts`:
```typescript
function isOwner(role: GroupRole | null): boolean {
  return role === "owner";
}
function isOrganiserOrAbove(role: GroupRole | null): boolean {
  return role === "owner" || role === "organiser";
}

// Owner-only (PRD §11 "Owner").
export const canManageGroup = isOwner;
export const canManageOrganisers = isOwner;
export const canDeleteSession = isOwner;

// Owner + Organiser (PRD §11 "Organiser").
export const canCreateSession = isOrganiserOrAbove;
export const canGenerateSchedule = isOrganiserOrAbove;
export const canEnterScore = isOrganiserOrAbove;
export const canManageSessionPlayers = isOrganiserOrAbove;
export const canAdvanceRound = isOrganiserOrAbove;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @picklebaddies/domain test`
Expected: PASS (5 tests total in file).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/roles.ts packages/domain/src/roles.test.ts
git commit -m "feat(domain): role permission predicates mapping PRD §11"
```

---

## Task 4: Wire `@picklebaddies/domain` into web + functions

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.mjs`
- Modify: `functions/package.json`

- [ ] **Step 1: Add the dependency to web**

In `apps/web/package.json`, under `"dependencies"`, add (keep alphabetical-ish next to the engine line):
```json
    "@picklebaddies/domain": "workspace:*",
```

- [ ] **Step 2: Transpile the package in Next**

In `apps/web/next.config.mjs`, extend `transpilePackages`:
```javascript
  transpilePackages: ["@picklebaddies/match-engine", "@picklebaddies/domain"],
```

- [ ] **Step 3: Add the dependency to functions**

In `functions/package.json`, under `"dependencies"`, add:
```json
    "@picklebaddies/domain": "workspace:*",
```

- [ ] **Step 4: Install and verify resolution**

Run: `pnpm install`
Expected: completes; `apps/web/node_modules/@picklebaddies/domain` symlink exists.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/next.config.mjs functions/package.json pnpm-lock.yaml
git commit -m "chore: depend on @picklebaddies/domain from web and functions"
```

---

## Task 5: `buildUserProfile` pure helper (TDD)

Separates the *shape* of the profile doc (pure, testable) from the *write* (Firestore).

**Files:**
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/lib/auth/profile.ts`
- Test: `apps/web/src/lib/auth/profile.test.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add Vitest to web**

In `apps/web/package.json`, add to `"scripts"`:
```json
    "test": "vitest run",
    "test:watch": "vitest",
```
and to `"devDependencies"`:
```json
    "vitest": "^2.1.8",
```
Then run: `pnpm install`

- [ ] **Step 2: Create the vitest config (node env, pure tests only)**

`apps/web/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Pure unit tests only. Emulator-backed *.rules.test.ts run via a separate script.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["**/*.rules.test.ts", "node_modules/**"],
  },
});
```

- [ ] **Step 3: Write the failing test**

`apps/web/src/lib/auth/profile.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { buildUserProfile } from "./profile.js";

describe("buildUserProfile", () => {
  it("maps a populated Firebase user to a profile doc", () => {
    const profile = buildUserProfile({
      displayName: "Ravi Kumar",
      email: "ravi@example.com",
      photoURL: "https://img/ravi.png",
    });
    expect(profile).toEqual({
      displayName: "Ravi Kumar",
      email: "ravi@example.com",
      photoURL: "https://img/ravi.png",
    });
  });

  it("coerces missing fields to null / empty display name", () => {
    const profile = buildUserProfile({
      displayName: null,
      email: null,
      photoURL: null,
    });
    expect(profile).toEqual({ displayName: "", email: null, photoURL: null });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @picklebaddies/web test`
Expected: FAIL — `buildUserProfile` not found.

- [ ] **Step 5: Implement the pure helper (write function stubbed alongside)**

`apps/web/src/lib/auth/profile.ts`:
```typescript
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import type { User } from "firebase/auth";

/** The subset of Firebase User this module needs (keeps the pure helper testable). */
export interface ProfileSource {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface UserProfileFields {
  displayName: string;
  email: string | null;
  photoURL: string | null;
}

/** Pure: map a Firebase user to the stored profile fields (PRD §15.1, minus timestamps). */
export function buildUserProfile(source: ProfileSource): UserProfileFields {
  return {
    displayName: source.displayName ?? "",
    email: source.email ?? null,
    photoURL: source.photoURL ?? null,
  };
}

/** Idempotently create users/{uid} on first sign-in. Never overwrites existing data. */
export async function ensureUserProfile(db: Firestore, user: User): Promise<void> {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    ...buildUserProfile(user),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @picklebaddies/web test`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/src/lib/auth/profile.ts apps/web/src/lib/auth/profile.test.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): buildUserProfile (tested) + ensureUserProfile writer"
```

---

## Task 6: Sign-in / sign-out service functions

Thin wrappers over the Firebase Auth SDK. Kept in the service layer (PRD §17) so components never import `firebase/auth` directly.

**Files:**
- Create: `apps/web/src/lib/auth/sign-in.ts`

- [ ] **Step 1: Implement the auth service**

`apps/web/src/lib/auth/sign-in.ts`:
```typescript
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type UserCredential,
} from "firebase/auth";
import { getFirebaseServices } from "@/lib/firebase/client";

export async function signInWithGoogle(): Promise<UserCredential> {
  const { auth } = getFirebaseServices();
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<UserCredential> {
  const { auth } = getFirebaseServices();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmail(
  email: string,
  password: string,
): Promise<UserCredential> {
  const { auth } = getFirebaseServices();
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function signOutUser(): Promise<void> {
  const { auth } = getFirebaseServices();
  await signOut(auth);
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @picklebaddies/web typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/auth/sign-in.ts
git commit -m "feat(web): auth sign-in/out service wrappers"
```

---

## Task 7: AuthProvider + useAuth

Single source of auth truth. On every sign-in transition it calls `ensureUserProfile`.

**Files:**
- Create: `apps/web/src/lib/auth/types.ts`
- Create: `apps/web/src/lib/auth/AuthProvider.tsx`
- Create: `apps/web/src/lib/auth/useAuth.ts`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Define the auth state type**

`apps/web/src/lib/auth/types.ts`:
```typescript
import type { User } from "firebase/auth";

export interface AuthState {
  user: User | null;
  /** true until the first onAuthStateChanged callback fires. */
  loading: boolean;
}
```

- [ ] **Step 2: Implement the provider**

`apps/web/src/lib/auth/AuthProvider.tsx`:
```typescript
"use client";

import { createContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseServices } from "@/lib/firebase/client";
import { ensureUserProfile } from "@/lib/auth/profile";
import type { AuthState } from "@/lib/auth/types";

export const AuthContext = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    const { auth, db } = getFirebaseServices();
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          await ensureUserProfile(db, user);
        } catch (err) {
          console.error("ensureUserProfile failed", err);
        }
      }
      setState({ user, loading: false });
    });
    return unsub;
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
```

- [ ] **Step 3: Implement the hook**

`apps/web/src/lib/auth/useAuth.ts`:
```typescript
"use client";

import { useContext } from "react";
import { AuthContext } from "@/lib/auth/AuthProvider";

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 4: Wrap the app in the provider**

Modify `apps/web/src/app/layout.tsx` — import the provider and wrap `{children}`:
```typescript
import { AuthProvider } from "@/lib/auth/AuthProvider";
```
Change the body line from `<body>{children}</body>` to:
```typescript
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
```

- [ ] **Step 5: Verify build**

Run: `pnpm --filter @picklebaddies/web build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/auth/types.ts apps/web/src/lib/auth/AuthProvider.tsx apps/web/src/lib/auth/useAuth.ts apps/web/src/app/layout.tsx
git commit -m "feat(web): AuthProvider + useAuth, profile bootstrap on sign-in"
```

---

## Task 8: Sign-in page

**Files:**
- Create: `apps/web/src/app/sign-in/page.tsx`

- [ ] **Step 1: Implement the sign-in screen**

`apps/web/src/app/sign-in/page.tsx`:
```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithGoogle,
  signInWithEmail,
  registerWithEmail,
} from "@/lib/auth/sign-in";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <h1>Sign in</h1>
      <button disabled={busy} onClick={() => run(signInWithGoogle)}>
        Continue with Google
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() =>
            mode === "signin"
              ? signInWithEmail(email, password)
              : registerWithEmail(email, password),
          );
        }}
      >
        <input
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={busy}>
          {mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
      <button
        className="link"
        onClick={() => setMode(mode === "signin" ? "register" : "signin")}
      >
        {mode === "signin" ? "Need an account? Register" : "Have an account? Sign in"}
      </button>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm --filter @picklebaddies/web build`
Expected: route `/sign-in` listed, compiled successfully.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/sign-in/page.tsx
git commit -m "feat(web): sign-in page (Google + email/register)"
```

---

## Task 9: Protected route group

Pages needing auth live under `(app)/`. Its client layout redirects to `/sign-in` when there is no user (PRD §12.1: "Unauthenticated users cannot create groups or sessions").

**Files:**
- Create: `apps/web/src/app/(app)/layout.tsx`
- Create: `apps/web/src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Implement the protected layout**

`apps/web/src/app/(app)/layout.tsx`:
```typescript
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/sign-in");
  }, [loading, user, router]);

  if (loading) return <main className="shell"><p>Loading…</p></main>;
  if (!user) return null; // redirecting
  return <>{children}</>;
}
```

- [ ] **Step 2: Implement a minimal authed dashboard**

`apps/web/src/app/(app)/dashboard/page.tsx`:
```typescript
"use client";

import { useAuth } from "@/lib/auth/useAuth";
import { signOutUser } from "@/lib/auth/sign-in";

export default function DashboardPage() {
  const { user } = useAuth();
  return (
    <main className="shell">
      <span className="badge">M1 · authenticated</span>
      <h1>Dashboard</h1>
      <p>Signed in as {user?.email ?? user?.displayName ?? "unknown"}.</p>
      <button onClick={() => signOutUser()}>Sign out</button>
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm --filter @picklebaddies/web build`
Expected: route `/dashboard` listed (dynamic, client), compiled successfully.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(app)"
git commit -m "feat(web): protected route group with redirect + dashboard"
```

---

## Task 10: Firestore rules test for `users/{uid}` (emulator)

Locks in PRD §19.1 with an automated test against the emulator, establishing the rules-testing harness for later milestones.

**Files:**
- Create: `apps/web/firestore.users.rules.test.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add the rules-testing dependency + script**

In `apps/web/package.json` add to `"devDependencies"`:
```json
    "@firebase/rules-unit-testing": "^4.0.1",
```
and to `"scripts"`:
```json
    "test:rules": "firebase emulators:exec --only firestore --project picklebaddies \"vitest run --config vitest.rules.config.ts\"",
```
Then run: `pnpm install`

- [ ] **Step 2: Create the rules vitest config**

`apps/web/vitest.rules.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.rules.test.ts"],
    testTimeout: 15000,
  },
});
```

- [ ] **Step 3: Write the rules test**

`apps/web/firestore.users.rules.test.ts`:
```typescript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "picklebaddies",
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe("users/{uid} rules (PRD §19.1)", () => {
  it("owner can write and read their own profile", async () => {
    const db = env.authenticatedContext("u1").firestore();
    await assertSucceeds(setDoc(doc(db, "users/u1"), { displayName: "A" }));
    await assertSucceeds(getDoc(doc(db, "users/u1")));
  });

  it("a user cannot read another user's profile", async () => {
    const db = env.authenticatedContext("u2").firestore();
    await assertFails(getDoc(doc(db, "users/u1")));
  });

  it("an unauthenticated user cannot read any profile", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "users/u1")));
  });
});
```

- [ ] **Step 4: Run the rules test (starts the emulator automatically)**

Run: `pnpm --filter @picklebaddies/web test:rules`
Expected: emulator boots, PASS (3 tests), emulator shuts down. (Requires the Firebase CLI on PATH — already installed, v15.5.1.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/firestore.users.rules.test.ts apps/web/vitest.rules.config.ts apps/web/package.json pnpm-lock.yaml
git commit -m "test(rules): users/{uid} access rules against firestore emulator"
```

---

## Task 11: Full-suite verification + manual auth smoke test

**Files:** none (verification only).

- [ ] **Step 1: Run every unit suite**

Run: `pnpm -r test`
Expected: `match-engine` (6), `domain` (5), `web` pure (2) all PASS.

- [ ] **Step 2: Typecheck the whole workspace**

Run: `pnpm -r typecheck`
Expected: exits 0 for web, functions, domain, match-engine.

- [ ] **Step 3: Manual auth smoke test against emulators**

In `apps/web/.env.local` set `NEXT_PUBLIC_USE_EMULATORS=true` (and the `NEXT_PUBLIC_FIREBASE_*` vars — any non-empty placeholder values work with the Auth emulator).

Terminal A: `firebase emulators:start --only auth,firestore`
Terminal B: `pnpm --filter @picklebaddies/web dev`

Verify in the browser:
- Visiting `/dashboard` while signed out redirects to `/sign-in`.
- Register with email → lands on `/dashboard` showing the email.
- Refresh `/dashboard` → stays signed in (no redirect).
- Emulator UI (http://127.0.0.1:4000) → Firestore shows a `users/{uid}` doc with `createdAt`.
- Click "Sign out" → next `/dashboard` visit redirects to `/sign-in`.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore(m1): verification pass — auth + roles complete"
```

- [ ] **Step 5: Mark the plan processed** (only after Steps 1–4 pass)

```bash
git mv docs/superpowers/plans/2026-06-06-m1-auth-roles.md docs/superpowers/plans/processed/2026-06-06-m1-auth-roles.md
git commit -m "chore(plans): mark M1 processed"
```

---

## Self-Review

**Spec coverage (PRD §12.1 acceptance criteria):**
- "Sign in with Google" → Task 6 + 8. ✅
- "Sign in with email" → Task 6 + 8 (sign in *and* register). ✅
- "User has a profile document" → Task 5 (`ensureUserProfile`) + Task 7 (called on sign-in). ✅
- "User can sign out" → Task 9 dashboard button + Task 6 `signOutUser`. ✅
- "Unauthenticated users cannot create groups or sessions" → Task 9 protected route group enforces auth before any authed page; Task 10 rules deny cross-user/anon reads. ✅
- Invite-link-before-sign-in / guest flow → **out of scope for M1**, lands in M3/M6 (DELTA_SPEC D6). Noted, not a gap.

**DELTA_SPEC D5 coverage:** `GroupRole` + `ParticipantType` defined as separate axes (Task 1); permissions derive only from `GroupRole` (Tasks 2–3). ✅

**Placeholder scan:** no TBD/TODO/"handle edge cases" — every code step is complete. ✅

**Type consistency:** `GroupMember`, `GroupRole`, `resolveGroupRole` (Tasks 1–2) reused unchanged in Task 3; `buildUserProfile`/`ensureUserProfile`/`ProfileSource` (Task 5) reused in Task 7; `AuthState` (Task 7) consumed by `useAuth` (Task 7) and `ProtectedLayout` (Task 9). ✅

**Known follow-ups (not M1):** `useGroupRole(groupId)` live reader + its rules are deferred to M2 (groups don't exist yet); the permission predicates are unit-tested now and wired to UI when groups land.
```
