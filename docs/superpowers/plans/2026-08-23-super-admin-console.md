# Founder Support Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the DuoRally founder one private, secure place to understand app adoption, inspect users/squads/sessions, answer support questions, and apply a small set of audited data fixes without opening Firebase Console.

**Architecture:** Ship the console as a server-rendered `/admin` area guarded only by Firebase Auth custom claims. A Firebase Admin SDK service account is the only authority that can grant or revoke app-admin claims; `sharma.sanjeev.au@gmail.com` is the one-time bootstrap owner for implementation, not a hardcoded permanent admin. The app-admin registry supports ownership transfer: add another owner first, then remove the original owner when needed. Read-only support views use bounded Admin SDK reads and Firestore aggregation counts; write tools use shared server-side service functions with mandatory founder audit entries so score, leaderboard, squad, and player-stat invariants stay intact. The dashboard is founder-first: it answers who is using DuoRally, which squads are active, which sessions are being completed, and where support intervention is needed.

**Tech Stack:** TypeScript, Next.js 15 App Router, React 19 server components/server actions, Firebase Admin SDK, Firebase Auth custom claims, Firestore rules/tests, Firestore aggregation queries, Vitest, pnpm workspaces.

## Global Constraints

- Use DuoRally product language: "DuoRally", "Founder Support", "Squads", "Sessions", "Players"; avoid legacy brand or team-management wording in new UI copy.
- Phase 0 is a security hotfix and ships before the rest of the console.
- App-admin authority comes only from Firebase Auth custom claims: `request.auth.token.superAdmin == true`, `request.auth.token.appAdminRole in ["owner", "admin"]`, `SessionUser.superAdmin === true`, and `SessionUser.appAdminRole`.
- `sharma.sanjeev.au@gmail.com` is only the bootstrap owner used during implementation; it must not be hardcoded in app runtime authorization logic.
- Claim grants/revokes are performed only through Firebase Admin SDK credentials from the service account; no client path may set app-admin access.
- App owners can add other trusted people as DuoRally app admins after launch. App admins can support the app; only app owners can manage app-admin access.
- The console must prevent removing or demoting the final active app owner, but it must allow the bootstrap owner to be removed after another owner exists.
- Remove `SUPER_ADMIN_EMAILS`, `isSuperAdminEmail`, `canManageTeamOwners`, `isSuperAdminToken`, and `isSuperAdminProfile` from active code.
- A signed-in user must not be able to alter privileged profile fields on `users/{uid}`: `email`, `emailLower`, `role`, `superAdmin`, or `appAdminRole`.
- The admin console must not use the client Firestore SDK, `onSnapshot`, or unbounded reads.
- Every list view must paginate with a default `limit(25)` and a maximum `limit(50)`.
- Every support mutation must require a non-empty founder reason and must write one `_adminAuditLogs/{id}` entry.
- Support fixes must use shared server-side domain/service logic, not raw writes to `players/`, session `matches/`, or session `leaderboard/`.
- Score fixes must preserve the existing invariant: session player stats, session leaderboard stats, and global `players/{uid}` stats update together.
- Existing live-session safety remains intact: do not shuffle visible unscored court cards as a side effect of support tooling.
- Do not modify `functions/**`, do not add a scheduled job, do not add a third-party search/analytics service, and do not add `firestore.indexes.json` entries unless a task explicitly revises this plan first.
- Keep this plan in `docs/superpowers/plans/` until every task is implemented, verified, and accepted.

---

## Founder Outcomes

The console should answer these founder questions quickly:

- Who is signing up, and when did they last use DuoRally?
- Which squads exist, who owns them, and which squads are active or stalled?
- Where squads are being adopted by suburb/city/region, based on saved squad venues and session venues.
- Which sessions were created, started, completed, abandoned, or left unscored?
- What happened inside a support case: who changed the roster, generated games, scored matches, edited scores, paused, resumed, or rebalanced?
- Which support fixes were applied, by whom, why, and what changed?

The console should also keep the founder from doing unsafe manual edits in Firebase Console by making the safest repair path the easiest path.

## File Structure

- `packages/domain/src/roles.ts` - group role predicates plus `isSuperAdminClaim`.
- `packages/domain/src/roles.test.ts` - claim predicate and removed email allowlist coverage.
- `packages/domain/src/admin-metrics.ts` - pure founder metric shape and derived rates.
- `packages/domain/src/admin-metrics.test.ts` - rate helpers and zero-denominator tests.
- `scripts/grant-super-admin.ts` - one-off custom-claim grant/revoke helper.
- `apps/web/src/server/auth/dal.ts` - `SessionUser.superAdmin`, `SessionUser.appAdminRole`, `requireSuperAdmin`, and `requireAppOwner`.
- `apps/web/src/server/admin/guard.ts` - server-only admin route/action guard.
- `apps/web/src/server/admin/app-admins.ts` - service-account-backed app admin owner/admin grant/revoke/list actions.
- `apps/web/src/server/admin/audit.ts` - `_adminAuditLogs` writer and mutation wrapper.
- `apps/web/src/server/admin/search.ts` - bounded support search.
- `apps/web/src/server/admin/inspect.ts` - user, squad, and session inspectors.
- `apps/web/src/server/admin/metrics.ts` - cached on-demand founder dashboard metrics.
- `apps/web/src/server/admin/geography.ts` - free, deterministic squad geography extraction from saved venue/session text.
- `apps/web/src/server/admin/fixes.ts` - founder repair actions.
- `apps/web/src/server/sessions/score-service.ts` - shared score transaction used by normal scoring and founder correction.
- `apps/web/src/server/sessions/status-service.ts` - shared status recovery transitions.
- `apps/web/src/server/squads/ownership-service.ts` - shared ownership transfer/recovery transaction.
- `apps/web/src/server/players/recompute-service.ts` - one-player global-stat recompute service.
- `apps/web/src/app/(admin)/admin/**` - founder support UI.
- `apps/web/src/app/(admin)/admin/app-admins/page.tsx` - founder-controlled app admin access screen.
- `apps/web/src/lib/groups/groups.ts` - remove legacy whole-app client admin helpers.
- `apps/web/src/app/(app)/admin/page.tsx` - delete legacy client admin page.
- `apps/web/src/app/(app)/dashboard/page.tsx` - link to `/admin` only when the verified session has `superAdmin`.
- `firestore.rules` - claim-only super-admin rules and locked user profile fields.
- `apps/web/firestore.full.rules.test.ts`, `apps/web/firestore.groups.rules.test.ts` - security regression coverage.

---

## Phase 0 - Security Hotfix

This phase is independent of the founder console. It closes the current privilege-escalation hole first.

### Task 1: Move Super Admin Authority to a Firebase Custom Claim

**Files:**
- Modify: `packages/domain/src/roles.ts`
- Modify: `packages/domain/src/roles.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `apps/web/src/server/auth/dal.ts`
- Create: `scripts/grant-super-admin.ts`

**Interfaces:**
- Produces: `export type AppAdminRole = "owner" | "admin"`
- Produces: `export interface SuperAdminClaims { superAdmin?: unknown; appAdminRole?: unknown }`
- Produces: `export function isSuperAdminClaim(claims: SuperAdminClaims | null | undefined): boolean`
- Produces: `export function getAppAdminRole(claims: SuperAdminClaims | null | undefined): AppAdminRole | null`
- Produces: `SessionUser { uid: string; email: string | null; superAdmin: boolean; appAdminRole: AppAdminRole | null }`
- Produces: `export async function requireSuperAdmin(): Promise<SessionUser>`
- Produces: `export async function requireAppOwner(): Promise<SessionUser>`
- Produces bootstrap seed target: `sharma.sanjeev.au@gmail.com`, documented only in release instructions
- Produces script command: `corepack pnpm@9.15.9 exec ts-node scripts/grant-super-admin.ts <email> --role owner|admin [--revoke]`

- [ ] **Step 1: Add failing domain tests for claim-only super admin**

  Add cases to `packages/domain/src/roles.test.ts`:

  ```ts
  describe("super admin claims", () => {
    it("accepts only the literal boolean true claim", () => {
      expect(isSuperAdminClaim({ superAdmin: true })).toBe(true);
      expect(isSuperAdminClaim({ superAdmin: false })).toBe(false);
      expect(isSuperAdminClaim({ superAdmin: "true" })).toBe(false);
      expect(isSuperAdminClaim({ superAdmin: 1 })).toBe(false);
      expect(isSuperAdminClaim({})).toBe(false);
      expect(isSuperAdminClaim(null)).toBe(false);
      expect(isSuperAdminClaim(undefined)).toBe(false);
    });

    it("returns only supported app admin roles", () => {
      expect(getAppAdminRole({ superAdmin: true, appAdminRole: "owner" })).toBe("owner");
      expect(getAppAdminRole({ superAdmin: true, appAdminRole: "admin" })).toBe("admin");
      expect(getAppAdminRole({ superAdmin: true, appAdminRole: "support" })).toBe(null);
      expect(getAppAdminRole({ superAdmin: false, appAdminRole: "owner" })).toBe(null);
    });
  });
  ```

- [ ] **Step 2: Run the focused test and confirm failure**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/domain test -- src/roles.test.ts`

  Expected: fail because `isSuperAdminClaim` is not exported yet.

- [ ] **Step 3: Replace email allowlist exports with claim predicate**

  In `packages/domain/src/roles.ts`, remove `SUPER_ADMIN_EMAILS`, `isSuperAdminEmail`, and `canManageTeamOwners`. Add:

  ```ts
  export type AppAdminRole = "owner" | "admin";

  export interface SuperAdminClaims {
    superAdmin?: unknown;
    appAdminRole?: unknown;
  }

  export function isSuperAdminClaim(claims: SuperAdminClaims | null | undefined): boolean {
    return claims?.superAdmin === true;
  }

  export function getAppAdminRole(claims: SuperAdminClaims | null | undefined): AppAdminRole | null {
    if (!isSuperAdminClaim(claims)) return null;
    return claims?.appAdminRole === "owner" || claims?.appAdminRole === "admin"
      ? claims.appAdminRole
      : null;
  }
  ```

- [ ] **Step 4: Add `superAdmin` and `appAdminRole` to verified server sessions**

  In `apps/web/src/server/auth/dal.ts`, import `isSuperAdminClaim` and `getAppAdminRole`, include `superAdmin` and `appAdminRole` in `SessionUser`, and return:

  ```ts
  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    superAdmin: isSuperAdminClaim(decoded),
    appAdminRole: getAppAdminRole(decoded),
  };
  ```

  Add:

  ```ts
  export async function requireSuperAdmin(): Promise<SessionUser> {
    const session = await requireSession();
    if (!session.superAdmin) {
      throw new ServerAuthError("Forbidden");
    }
    return session;
  }

  export async function requireAppOwner(): Promise<SessionUser> {
    const session = await requireSuperAdmin();
    if (session.appAdminRole !== "owner") {
      throw new ServerAuthError("Forbidden");
    }
    return session;
  }
  ```

- [ ] **Step 5: Create the claim grant/revoke script**

  `scripts/grant-super-admin.ts` must use the Firebase Admin SDK service-account credentials and must not be imported by client code. It sets both Auth custom claims and the server-only registry doc `_appAdmins/{uid}`:

  ```ts
  import { FieldValue } from "firebase-admin/firestore";
  import { getAdminAuth } from "../apps/web/src/server/firebase/admin";
  import { getAdminDb } from "../apps/web/src/server/firebase/admin";

  async function main() {
    const email = process.argv[2]?.trim().toLowerCase();
    const roleArg = process.argv.includes("--role")
      ? process.argv[process.argv.indexOf("--role") + 1]
      : "admin";
    const role = roleArg === "owner" ? "owner" : roleArg === "admin" ? "admin" : null;
    const revoke = process.argv.includes("--revoke");
    if (!email || (!revoke && !role)) {
      throw new Error("Usage: ts-node scripts/grant-super-admin.ts <email> --role owner|admin [--revoke]");
    }

    const auth = getAdminAuth();
    const db = getAdminDb();
    const user = await auth.getUserByEmail(email);
    const current = user.customClaims ?? {};
    const next = revoke
      ? { ...current, superAdmin: false, appAdminRole: null }
      : { ...current, superAdmin: true, appAdminRole: role };
    await auth.setCustomUserClaims(user.uid, next);

    const ref = db.doc(`_appAdmins/${user.uid}`);
    if (revoke) {
      await ref.set({ uid: user.uid, email, disabled: true, revokedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else {
      await ref.set({
        uid: user.uid,
        email,
        role,
        disabled: false,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    console.log(`${revoke ? "Revoked" : `Granted ${role}`} app-admin access for ${email}. User must sign out and back in.`);
  }

  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
  ```

- [ ] **Step 6: Document the bootstrap command for the founder account**

  The implementation release notes must include this one-time command, run with Firebase Admin SDK service-account credentials for the production project:

  ```bash
  corepack pnpm@9.15.9 exec ts-node scripts/grant-super-admin.ts sharma.sanjeev.au@gmail.com --role owner
  ```

  The email must not appear in runtime authorization checks. The command must preserve existing custom claims, create `_appAdmins/{uid}`, and print that the founder must sign out and back in before the `/admin` link appears. Later ownership transfer is done by granting another user `--role owner`, confirming they can access `/admin/app-admins`, then revoking or demoting this bootstrap owner.

- [ ] **Step 7: Run domain tests and repo typecheck**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/domain test`

  Run: `corepack pnpm@9.15.9 -r typecheck`

### Task 2: Harden Firestore Rules Against Profile Spoofing

**Files:**
- Modify: `firestore.rules`
- Modify: `apps/web/firestore.full.rules.test.ts`
- Modify: `apps/web/firestore.groups.rules.test.ts`

**Interfaces:**
- Consumes: Firebase custom claim `superAdmin: true`
- Produces: `isSuperAdmin()` in rules checks only `request.auth.token.superAdmin == true`
- Produces: `_adminAuditLogs/{docId}` client deny rule
- Produces: `_appAdmins/{uid}` client deny rule

- [ ] **Step 1: Add a failing rules regression test for profile spoofing**

  In `apps/web/firestore.full.rules.test.ts`, add a test that creates an unrelated group as admin test data, then uses a normal user context to write their own `users/{uid}.emailLower` to an old founder email and read the unrelated group.

  Expected assertion:

  ```ts
  await assertFails(getDoc(doc(spoofedUserDb, "groups/g1")));
  ```

  This must fail against the current rules before the implementation step.

- [ ] **Step 2: Run rules tests and confirm the regression is real**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web test:rules`

  Expected: fail on the new spoofing test.

- [ ] **Step 3: Replace the rules super-admin functions**

  In `firestore.rules`, replace the existing token/profile/email functions with:

  ```js
  function isSuperAdmin() {
    return signedIn() && request.auth.token.superAdmin == true;
  }
  ```

- [ ] **Step 4: Lock privileged profile fields**

  In `match /users/{userId}`, replace self-write access with field-diff protection:

  ```js
  allow create: if signedIn()
    && request.auth.uid == userId
    && !request.resource.data.keys().hasAny(["role", "superAdmin"]);

  allow update: if signedIn()
    && request.auth.uid == userId
    && !request.resource.data.diff(resource.data).affectedKeys().hasAny([
      "email",
      "emailLower",
      "role",
      "superAdmin",
      "appAdminRole"
    ]);
  ```

- [ ] **Step 5: Deny client access to founder audit logs**

  Add:

  ```js
  match /_adminAuditLogs/{docId} {
    allow read, write: if false;
  }

  match /_appAdmins/{docId} {
    allow read, write: if false;
  }
  ```

- [ ] **Step 6: Update super-admin rules tests to mint the claim**

  Replace contexts like:

  ```ts
  env.authenticatedContext("superAdmin", { email: "pankaj4bharat@gmail.com" })
  ```

  with:

  ```ts
  env.authenticatedContext("superAdmin", { superAdmin: true })
  ```

- [ ] **Step 7: Run the full rules suite**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web test:rules`

### Task 3: Remove the Legacy Client Admin Surface

**Files:**
- Modify: `apps/web/src/lib/groups/groups.ts`
- Delete: `apps/web/src/app/(app)/admin/page.tsx`
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Removes: `watchAllGroups`
- Removes: `createTeam`
- Removes: `addTeamOwnerByEmail`
- Consumes: `SessionUser.superAdmin` through a server-verified admin entry check

- [ ] **Step 1: Remove old client helpers**

  Delete `watchAllGroups`, `createTeam`, and `addTeamOwnerByEmail` from `apps/web/src/lib/groups/groups.ts`.

- [ ] **Step 2: Delete the old client admin page**

  Delete `apps/web/src/app/(app)/admin/page.tsx`.

- [ ] **Step 3: Replace dashboard email gating**

  Remove `isSuperAdminEmail(user?.email)` from `apps/web/src/app/(app)/dashboard/page.tsx`. The dashboard must either hide the founder link until a server action says the session has `superAdmin`, or move the founder link into a server-rendered component that calls `verifySession()`.

- [ ] **Step 4: Run focused search checks**

  Run: `rg -n "watchAllGroups|createTeam|addTeamOwnerByEmail|isSuperAdminEmail|SUPER_ADMIN_EMAILS|canManageTeamOwners" apps packages firestore.rules`

  Expected: no active-code matches.

- [ ] **Step 5: Build the web app**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web build`

---

## Phase 1 - Founder Visibility, Read-Only

This phase gives the founder useful visibility before adding any repair tools.

### Task 4: Create the Server-Only Admin Route Group

**Files:**
- Create: `apps/web/src/server/admin/guard.ts`
- Create: `apps/web/src/app/(admin)/admin/layout.tsx`
- Create: `apps/web/src/app/(admin)/admin/page.tsx`
- Create: `apps/web/src/app/(admin)/admin/not-found.tsx`

**Interfaces:**
- Produces: `export async function assertSuperAdminPage(): Promise<SessionUser>`
- Produces: `export async function assertSuperAdminAction(): Promise<ActionResult<SessionUser>>`

- [ ] **Step 1: Create the guard module**

  `apps/web/src/server/admin/guard.ts`:

  ```ts
  import "server-only";
  import { notFound } from "next/navigation";
  import { requireSuperAdmin, type SessionUser } from "@/server/auth/dal";
  import { err, ok, type ActionResult } from "@/server/result";

  export async function assertSuperAdminPage(): Promise<SessionUser> {
    try {
      return await requireSuperAdmin();
    } catch {
      notFound();
    }
  }

  export async function assertSuperAdminAction(): Promise<ActionResult<SessionUser>> {
    try {
      return ok(await requireSuperAdmin());
    } catch {
      return err("FORBIDDEN", "Founder support access is required");
    }
  }
  ```

- [ ] **Step 2: Create the admin layout**

  Layout must call `assertSuperAdminPage()` and render navigation labels: `Overview`, `Search`, `Users`, `Squads`, `Sessions`, `Fixes`, `App Admins`, `Audit`.

- [ ] **Step 3: Create the overview placeholder**

  The first `/admin` page shows founder support purpose and empty metric tiles wired to Phase 3 labels: active squads, sessions completed, unscored matches, active players.

- [ ] **Step 4: Verify non-admin behavior**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web build`

  Manual check with a non-claim account: `/admin` returns 404, not a redirect to a visible forbidden screen.

### Task 4A: Add Founder-Controlled App Admin Management

**Files:**
- Create: `apps/web/src/server/admin/app-admins.ts`
- Create: `apps/web/src/server/admin/app-admins.test.ts`
- Create: `apps/web/src/app/(admin)/admin/app-admins/page.tsx`

**Interfaces:**
- Consumes: `requireAppOwner()` for grant/revoke and `assertSuperAdminAction()` for list
- Produces: `export type AppAdminRole = "owner" | "admin"`
- Produces: `export type AppAdminRecord = { uid: string; email: string | null; displayName: string | null; disabled: boolean; role: AppAdminRole; createdAtIso: string | null; updatedAtIso: string | null }`
- Produces: `export async function listAppAdmins(): Promise<ActionResult<AppAdminRecord[]>>`
- Produces: `export async function grantAppAdminByEmail(email: string, role: AppAdminRole, reason: string): Promise<ActionResult<void>>`
- Produces: `export async function revokeAppAdminByEmail(email: string, reason: string): Promise<ActionResult<void>>`

- [ ] **Step 1: Add app-admin action tests**

  Cover:

  - non-super-admin cannot list, grant, or revoke
  - app admin with role `admin` can list but cannot grant or revoke
  - blank email returns `VALIDATION`
  - blank reason returns `VALIDATION`
  - granting an owner sets custom claims `{ superAdmin: true, appAdminRole: "owner" }` and writes `_appAdmins/{uid}.role = "owner"`
  - granting an admin sets custom claims `{ superAdmin: true, appAdminRole: "admin" }` and writes `_appAdmins/{uid}.role = "admin"`
  - revoking refuses to remove the final active owner
  - revoking the bootstrap owner succeeds after another active owner exists
  - grant and revoke each write one `_adminAuditLogs` entry

- [ ] **Step 2: Run focused test and confirm failure**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web exec vitest run src/server/admin/app-admins.test.ts`

- [ ] **Step 3: Implement service-account-backed claim management**

  Use `getAdminAuth()` and `getAdminDb()` from `apps/web/src/server/firebase/admin.ts`. `grantAppAdminByEmail` must require an app owner, call `getUserByEmail(email)`, merge existing `customClaims`, set `superAdmin: true`, set `appAdminRole` to the requested role, and upsert `_appAdmins/{uid}` with `uid`, `email`, `role`, `disabled: false`, `createdAt`, `updatedAt`, `updatedBy`, and `updatedReason`.

  `revokeAppAdminByEmail` must require an app owner, load `_appAdmins/{uid}`, count active owner docs in `_appAdmins`, and refuse to revoke when the target is the only active owner. When revocation is allowed, merge existing claims with `{ superAdmin: false, appAdminRole: null }` and mark `_appAdmins/{uid}` as `disabled: true`.

- [ ] **Step 4: Implement app admin listing**

  Read `_appAdmins` ordered by `role` then `email`, limited to 50. Join each row to the Firebase Auth record by UID to show disabled status and display name. Do not page through every Firebase Auth user.

- [ ] **Step 5: Build the App Admins page**

  The page shows current app owners/admins, disabled status, add-by-email form, owner/admin role selector, revoke buttons, and a required reason field for every grant/revoke. Add clear copy: `App owners can manage app admins. App admins can see and fix data across DuoRally. Only add people you trust to support the app.`

- [ ] **Step 6: Run focused test and web build**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web exec vitest run src/server/admin/app-admins.test.ts`

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web build`

### Task 5: Build Bounded Founder Search

**Files:**
- Create: `apps/web/src/server/admin/search.ts`
- Create: `apps/web/src/server/admin/search.test.ts`
- Create: `apps/web/src/app/(admin)/admin/search/page.tsx`

**Interfaces:**
- Produces: `type AdminSearchKind = "user" | "player" | "squad" | "session"`
- Produces: `type AdminSearchTermKind = "id" | "email" | "code" | "text"`
- Produces: `export function classifyAdminSearchTerm(term: string): AdminSearchTermKind`
- Produces: `export type AdminSearchHit = { kind: AdminSearchKind; id: string; label: string; sublabel: string; href: string }`
- Produces: `export async function adminSearch(term: string): Promise<ActionResult<AdminSearchHit[]>>`

- [ ] **Step 1: Add pure classifier tests**

  In `search.test.ts`, cover:

  ```ts
  expect(classifyAdminSearchTerm("abc123XYZ789abc123XY")).toBe("id");
  expect(classifyAdminSearchTerm("founder@example.com")).toBe("email");
  expect(classifyAdminSearchTerm("DR-123456")).toBe("code");
  expect(classifyAdminSearchTerm("northside")).toBe("text");
  ```

- [ ] **Step 2: Run focused test and confirm failure**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web exec vitest run src/server/admin/search.test.ts`

- [ ] **Step 3: Implement cheapest-first search**

  Search order:

  1. ID-shaped term: direct `get()` on `users/{id}`, `players/{id}`, `groups/{id}`, `sessions/{id}`.
  2. Email-shaped term: equality query on `users.emailLower`, `limit(10)`.
  3. Code-shaped term: equality queries for `sessions.joinCode`, `sessions.scoreCode`, `sessions.rsvpCode`, each `limit(5)`.
  4. Text term: prefix query on `users.displayNameLower`, `users.emailLower`, and `groups.nameLower`, each `limit(10)`.

- [ ] **Step 4: Build the search page**

  The page contains one search input and result links to `/admin/users/[uid]`, `/admin/squads/[groupId]`, or `/admin/sessions/[sessionId]`.

- [ ] **Step 5: Build and inspect for unbounded reads**

  Run: `rg -n "\.get\(\)\.size|onSnapshot|collection\(db" apps/web/src/app/\(admin\) apps/web/src/server/admin`

  Expected: no matches.

### Task 6: Build User, Squad, and Session Inspectors

**Files:**
- Create: `apps/web/src/server/admin/inspect.ts`
- Create: `apps/web/src/app/(admin)/admin/users/[uid]/page.tsx`
- Create: `apps/web/src/app/(admin)/admin/squads/[groupId]/page.tsx`
- Create: `apps/web/src/app/(admin)/admin/sessions/[sessionId]/page.tsx`

**Interfaces:**
- Produces: `inspectUser(uid: string): Promise<ActionResult<AdminUserInspection>>`
- Produces: `inspectSquad(groupId: string): Promise<ActionResult<AdminSquadInspection>>`
- Produces: `inspectSession(sessionId: string): Promise<ActionResult<AdminSessionInspection>>`

- [ ] **Step 1: Implement `inspectUser`**

  Return profile doc, Auth record metadata, provider IDs, disabled flag, global `players/{uid}` stats, and up to 25 squad memberships. If squad membership lookup cannot be done cheaply without a collection-group index, show direct profile/player/Auth details and a search hint rather than scanning all squads.

- [ ] **Step 2: Implement `inspectSquad`**

  Return group doc, owner/member/admin counts using aggregations where possible, first 25 members, first 25 venues/courts, inferred geography, archive metadata, latest 25 sessions ordered by `startsAt` or `createdAt`.

- [ ] **Step 3: Implement `inspectSession`**

  Return session doc, roster, leaderboard, latest 50 matches, engine state, generation runs, and latest 100 `auditLogs` ordered by `createdAt`.

- [ ] **Step 4: Build the three inspector pages**

  Use concise founder labels:

  - User page: `Account`, `Player stats`, `Squads`, `Auth status`.
  - Squad page: `Owner`, `Members`, `Geography`, `Venues and courts`, `Recent sessions`, `Archive status`.
  - Session page: `Status`, `Roster`, `Matches`, `Scores`, `Timeline`, `Support actions`.

- [ ] **Step 5: Show data freshness and boundaries**

  Each inspector page must show a small line: `Read-only support view. Data loaded at <time>.`

- [ ] **Step 6: Build the web app**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web build`

---

## Phase 2 - Founder Dashboard Metrics

This phase gives the founder adoption visibility without creating a data warehouse or background job.

### Task 7: Define Pure Founder Metrics

**Files:**
- Create: `packages/domain/src/admin-metrics.ts`
- Create: `packages/domain/src/admin-metrics.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces: `AdminMetricsSnapshot`
- Produces: `unscoredMatchRate(snapshot): number`
- Produces: `sessionCompletionRate(snapshot): number`
- Produces: `sessionAbandonmentRate(snapshot): number`
- Produces: `repeatSquadRate(snapshot): number`

- [ ] **Step 1: Add pure metric tests**

  Include zero denominator cases:

  ```ts
  expect(unscoredMatchRate({ matches: { total: 0, unscored: 0 } } as AdminMetricsSnapshot)).toBe(0);
  expect(sessionCompletionRate({ sessions: { total: 10, completed: 7 } } as AdminMetricsSnapshot)).toBe(70);
  ```

- [ ] **Step 2: Run focused domain test and confirm failure**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/domain test -- src/admin-metrics.test.ts`

- [ ] **Step 3: Implement metric shape**

  Required top-level shape:

  ```ts
  export interface AdminMetricsSnapshot {
    capturedAtIso: string;
    users: { total: number; registeredPlayers: number; active30d: number };
    squads: { total: number; active30d: number; repeatSessionSquads: number; archived: number };
    geography: {
      topRegions: Array<{ label: string; squadCount: number; active30d: number }>;
      unknownSquads: number;
      source: "venue-address" | "session-venue" | "mixed" | "unknown";
    };
    sessions: { total: number; created7d: number; started: number; completed: number; abandoned: number };
    matches: { total: number; scored: number; unscored: number };
    support: { scoreCorrections: number; ownershipTransfers: number; statRecomputes: number };
  }
  ```

- [ ] **Step 4: Export from the domain package**

  Add `export * from "./admin-metrics.js";` to `packages/domain/src/index.ts`.

- [ ] **Step 5: Run domain tests**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/domain test`

### Task 8: Compute On-Demand Cached Metrics

**Files:**
- Create: `apps/web/src/server/admin/geography.ts`
- Create: `apps/web/src/server/admin/metrics.ts`
- Modify: `apps/web/src/app/(admin)/admin/page.tsx`

**Interfaces:**
- Consumes: `AdminMetricsSnapshot`
- Produces: `export type SquadGeography = { label: string; source: "venue-address" | "session-venue" | "unknown" }`
- Produces: `export function inferSquadGeography(input: { venues: Array<{ name?: string | null; address?: string | null }>; sessions: Array<{ venueName?: string | null }> }): SquadGeography`
- Produces: `export async function computeAdminMetrics(): Promise<AdminMetricsSnapshot>`
- Produces: `export const getAdminMetrics`

- [ ] **Step 1: Implement free geography inference**

  `inferSquadGeography` must not call a paid geocoding API. It derives a founder-level adoption label from:

  1. venue `address` when present, extracting suburb/city/state from comma-separated text;
  2. venue `name` if it contains a known local place name already entered by the squad;
  3. recent session `venueName` as a fallback;
  4. `Unknown` when no reliable signal exists.

  The output is for adoption analytics, not exact player location.

- [ ] **Step 2: Implement aggregation helpers**

  Use Firestore count aggregations only. Do not fetch whole collections to count documents.

- [ ] **Step 3: Compute founder dashboard metrics**

  Compute:

  - total users from `users`
  - registered players from `players` where `isGuest != true` if supported by current data shape
  - total squads from `groups`
  - archived squads by archive metadata
  - top squad geography labels by squad count and active-in-30-days count
  - unknown geography count so the founder can see how much location data is missing
  - sessions total, created in last 7 days, started, completed, abandoned
  - matches total/scored/unscored from bounded collection group only if an existing index supports it; otherwise compute match metrics from latest 50 sessions and label it `recent sample`
  - support actions from `_adminAuditLogs` count by action when Phase 4 exists

- [ ] **Step 4: Cache the metrics**

  Use:

  ```ts
  export const getAdminMetrics = unstable_cache(
    computeAdminMetrics,
    ["founder-admin-metrics"],
    { revalidate: 86_400 },
  );
  ```

- [ ] **Step 5: Render the overview dashboard**

  `/admin` should lead with:

  - active squads
  - repeat squads
  - squad geography by suburb/city/region
  - completed sessions
  - abandoned sessions
  - unscored matches
  - active registered players

- [ ] **Step 6: Show cache age and metric limitations**

  Display `As of <capturedAtIso>`. If match metrics are from a recent sample, label them `Recent sessions sample`. If geography is inferred from venue/session text, label it `Based on saved venues and session venue names`.

- [ ] **Step 7: Build the web app**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web build`

---

## Phase 3 - Audited Repair Foundation

This phase creates the safe mutation foundation before exposing any fix buttons.

### Task 9: Add Founder Audit Wrapper

**Files:**
- Create: `apps/web/src/server/admin/audit.ts`
- Create: `apps/web/src/server/admin/audit.test.ts`

**Interfaces:**
- Produces: `AdminAuditAction`
- Produces: `withAdminAudit<T>(input): Promise<ActionResult<T>>`

- [ ] **Step 1: Add audit validation tests**

  Cover:

  - non-super-admin returns `FORBIDDEN`
  - blank reason returns `VALIDATION`
  - success writes one audit entry
  - failed mutation writes no audit entry

- [ ] **Step 2: Run focused test and confirm failure**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web exec vitest run src/server/admin/audit.test.ts`

- [ ] **Step 3: Implement audit wrapper**

  Write `_adminAuditLogs/{autoId}` with:

  ```ts
  {
    actorUid,
    actorEmail,
    action,
    target,
    reason,
    before,
    after,
    createdAt,
  }
  ```

- [ ] **Step 4: Snapshot only bounded targets**

  For document targets, snapshot the document only. For multi-document targets, require the caller to provide a compact `before` and `after` summary.

- [ ] **Step 5: Run focused test**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web exec vitest run src/server/admin/audit.test.ts`

### Task 10: Extract Shared Score Correction Service

**Files:**
- Create: `apps/web/src/server/sessions/score-service.ts`
- Modify: `apps/web/src/server/sessions/score.ts`
- Modify: `apps/web/src/server/sessions/score.test.ts` if present, otherwise create `apps/web/src/server/sessions/score-service.test.ts`

**Interfaces:**
- Produces: `submitScoreForActor(input): Promise<void>`
- Consumes: existing `submitScore(input)` behavior

- [ ] **Step 1: Add service tests for ordinary and founder actors**

  Test that ordinary member scoring still requires squad membership and founder correction bypasses squad membership only when `actor.superAdmin === true`.

- [ ] **Step 2: Run focused test and confirm failure**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web exec vitest run src/server/sessions/score-service.test.ts`

- [ ] **Step 3: Move the existing transaction into the service**

  The service accepts:

  ```ts
  type ScoreActor =
    | { kind: "squad-member"; uid: string; displayName: string | null }
    | { kind: "founder"; uid: string; email: string | null; reason: string };
  ```

  Keep the same validation, delta reversal, delta application, global player updates, match metadata update, autofill behavior, and session audit log.

- [ ] **Step 4: Update `submitScore` to call the service**

  `submitScore` remains the normal app entry point and keeps its existing returned `ActionResult<void>` behavior.

- [ ] **Step 5: Run focused score tests and typecheck**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web exec vitest run src/server/sessions/score-service.test.ts`

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web build`

### Task 11: Extract Ownership and Session Recovery Services

**Files:**
- Create: `apps/web/src/server/squads/ownership-service.ts`
- Modify: `apps/web/src/server/squads/actions.ts`
- Create: `apps/web/src/server/sessions/status-service.ts`
- Modify: `apps/web/src/server/sessions/actions.ts`

**Interfaces:**
- Produces: `transferSquadOwnershipForActor(input): Promise<void>`
- Produces: `recoverSessionStatusForActor(input): Promise<void>`

- [ ] **Step 1: Add ownership service tests**

  Cover normal owner transfer and founder recovery transfer where the founder is not a squad member.

- [ ] **Step 2: Add session recovery tests**

  Cover these permitted founder recovery actions:

  - `scheduled` or `draft` to `active` only when matches exist
  - `active` or `paused` to `completed`
  - `active` to `paused`
  - reject `cancelled` status changes

- [ ] **Step 3: Run focused tests and confirm failure**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web exec vitest run src/server/squads/ownership-service.test.ts src/server/sessions/status-service.test.ts`

- [ ] **Step 4: Extract service logic**

  Normal app actions keep current role checks. Founder paths pass an actor with `kind: "founder"` and still write group/session audit logs.

- [ ] **Step 5: Run focused tests and web build**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web exec vitest run src/server/squads/ownership-service.test.ts src/server/sessions/status-service.test.ts`

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web build`

---

## Phase 4 - Founder Fix Tools

This phase exposes the smallest useful set of repair tools, each with preview, confirmation, reason, mutation, and audit.

### Task 12: Build Score Correction Fix

**Files:**
- Create: `apps/web/src/server/admin/fixes.ts`
- Create: `apps/web/src/server/admin/fixes.test.ts`
- Create: `apps/web/src/app/(admin)/admin/sessions/[sessionId]/fix-score/page.tsx`

**Interfaces:**
- Produces: `previewScoreCorrection(sessionId, matchId, payload): Promise<ActionResult<ScoreCorrectionPreview>>`
- Produces: `adminCorrectScore(sessionId, matchId, payload, reason): Promise<ActionResult<void>>`

- [ ] **Step 1: Add fix tests**

  Assert blank reason rejects, non-super-admin rejects, preview returns affected players, and correction produces the same stat deltas as the shared score service.

- [ ] **Step 2: Run focused test and confirm failure**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web exec vitest run src/server/admin/fixes.test.ts`

- [ ] **Step 3: Implement preview**

  Preview shows previous score, new score, previous winner, new winner, affected player IDs, and expected games/wins/losses/points deltas.

- [ ] **Step 4: Implement correction**

  Correction calls `withAdminAudit` and `submitScoreForActor` with a founder actor.

- [ ] **Step 5: Build the fix UI**

  UI flow: choose match, enter corrected score, preview changes, enter reason, confirm.

- [ ] **Step 6: Run focused test and web build**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web exec vitest run src/server/admin/fixes.test.ts`

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web build`

### Task 13: Build Ownership, Archive, and Session Recovery Fixes

**Files:**
- Modify: `apps/web/src/server/admin/fixes.ts`
- Modify: `apps/web/src/server/admin/fixes.test.ts`
- Create: `apps/web/src/app/(admin)/admin/squads/[groupId]/fix/page.tsx`
- Create: `apps/web/src/app/(admin)/admin/sessions/[sessionId]/recover/page.tsx`

**Interfaces:**
- Produces: `adminTransferSquadOwnership(groupId, newOwnerUid, reason): Promise<ActionResult<void>>`
- Produces: `adminRestoreArchivedSquad(groupId, reason): Promise<ActionResult<void>>`
- Produces: `adminRecoverSessionStatus(sessionId, statusTo, reason): Promise<ActionResult<void>>`

- [ ] **Step 1: Add fix tests**

  Cover blank reason rejection, founder-claim requirement, missing target rejection, successful audit write, and no mutation when service throws.

- [ ] **Step 2: Run focused test and confirm failure**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web exec vitest run src/server/admin/fixes.test.ts`

- [ ] **Step 3: Implement ownership transfer**

  Use `transferSquadOwnershipForActor`. Do not require the founder to be a squad member. Require the target to be an existing registered squad member.

- [ ] **Step 4: Implement archive restore**

  Restore only when `archivedAt` and `purgeAfter` exist and purge has not occurred. Clear archive metadata through the existing squad archive service if present; otherwise create a small shared service that uses the same active-squad rules normal restore uses.

- [ ] **Step 5: Implement session recovery**

  Use `recoverSessionStatusForActor`. Do not offer arbitrary status dropdowns. Offer only permitted recovery actions from the current state.

- [ ] **Step 6: Build fix pages**

  Each page shows a preview summary, requires reason text, and confirms with a clear button label: `Apply support fix`.

- [ ] **Step 7: Run focused test and web build**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web exec vitest run src/server/admin/fixes.test.ts`

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web build`

### Task 14: Build Player Stat Recompute Fix

**Files:**
- Create: `apps/web/src/server/players/recompute-service.ts`
- Create: `apps/web/src/server/players/recompute-service.test.ts`
- Modify: `apps/web/src/server/admin/fixes.ts`
- Modify: `apps/web/src/server/admin/fixes.test.ts`
- Create: `apps/web/src/app/(admin)/admin/users/[uid]/recompute-stats/page.tsx`

**Interfaces:**
- Produces: `previewPlayerStatRecompute(playerId): Promise<ActionResult<PlayerStatRecomputePreview>>`
- Produces: `adminRecomputePlayerStats(playerId, reason): Promise<ActionResult<void>>`

- [ ] **Step 1: Add recompute service tests**

  Cover completed scored matches only, ignore cancelled matches, ignore scoreless completions unless a product decision changes their meaning, and ignore guest global stat docs.

- [ ] **Step 2: Run focused test and confirm failure**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web exec vitest run src/server/players/recompute-service.test.ts`

- [ ] **Step 3: Implement preview**

  Preview returns current global stats, recomputed stats, difference, and source match count.

- [ ] **Step 4: Implement apply**

  Apply writes only `players/{playerId}` global stats and writes one founder audit entry. Do not modify historical match docs.

- [ ] **Step 5: Build recompute page**

  Show a prominent warning when source match count is zero.

- [ ] **Step 6: Run tests and build**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web exec vitest run src/server/players/recompute-service.test.ts src/server/admin/fixes.test.ts`

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web build`

---

## Phase 5 - Audit Review and Release Verification

### Task 15: Founder Audit Log Viewer

**Files:**
- Create: `apps/web/src/server/admin/audit-log.ts`
- Create: `apps/web/src/app/(admin)/admin/audit/page.tsx`

**Interfaces:**
- Produces: `listAdminAuditLogs(input: { limit?: number; cursor?: string }): Promise<ActionResult<AdminAuditLogPage>>`

- [ ] **Step 1: Implement paginated audit reads**

  Read `_adminAuditLogs` ordered by `createdAt desc`, default `limit(25)`, maximum `limit(50)`.

- [ ] **Step 2: Build audit page**

  Show actor, action, target, reason, created time, and compact before/after summary.

- [ ] **Step 3: Link audit context**

  Target links open the relevant user, squad, or session inspector.

- [ ] **Step 4: Build the web app**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web build`

### Task 16: Final Acceptance Pass

**Files:**
- Modify: `docs/superpowers/plans/2026-08-23-super-admin-console.md`

**Interfaces:**
- Produces: completed acceptance checklist

- [ ] **Step 1: Run security searches**

  Run: `rg -n "SUPER_ADMIN_EMAILS|isSuperAdminEmail|canManageTeamOwners|isSuperAdminToken|isSuperAdminProfile" apps packages firestore.rules`

  Expected: no active-code matches.

- [ ] **Step 2: Run admin surface searches**

  Run: `rg -n "onSnapshot|collection\\(db" apps/web/src/app/\\(admin\\) apps/web/src/server/admin`

  Expected: no matches.

- [ ] **Step 3: Run rules tests**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web test:rules`

- [ ] **Step 4: Run domain tests**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/domain test`

- [ ] **Step 5: Run web tests**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web test`

- [ ] **Step 6: Run web build**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web build`

- [ ] **Step 7: Verify unchanged infrastructure**

  Run: `git diff -- firestore.indexes.json functions`

  Expected: no diff.

- [ ] **Step 8: Update this plan checklist**

  Check off completed tasks only after the verification commands above pass.

---

## Acceptance Criteria

- [ ] Phase 0 security hotfix ships before founder repair tools.
- [ ] A normal signed-in user cannot become super admin by editing their own profile.
- [ ] Firestore rules recognize app-admin access only through `request.auth.token.superAdmin == true`.
- [ ] `sharma.sanjeev.au@gmail.com` is used only as the bootstrap seed command, not in runtime authorization checks.
- [ ] The App Admins page lets an app owner grant owner/admin access, revoke access, and remove the bootstrap owner after another active owner exists.
- [ ] The App Admins page refuses to remove or demote the final active app owner.
- [ ] The old client `/admin` page and whole-app realtime squad listener are removed.
- [ ] `/admin` returns 404 for non-founder users.
- [ ] Founder can search by user email/name, squad name/id, session id, and session code.
- [ ] Founder can inspect users, squads, sessions, matches, score state, and session audit timelines.
- [ ] Founder dashboard shows active usage, squad adoption, squad geography, session completion, abandoned sessions, and support activity.
- [ ] Every founder mutation requires preview, reason, confirmation, and audit entry.
- [ ] Score correction updates session player stats, session leaderboard stats, and global player stats together.
- [ ] Ownership recovery preserves historical results and does not rewrite active play.
- [ ] Session recovery offers only state-specific safe actions, not arbitrary raw status changes.
- [ ] Player stat recompute states exactly which matches were used.
- [ ] No scheduled job, third-party search service, data warehouse, or new Cloud Function is introduced.
- [ ] `functions/**` and `firestore.indexes.json` remain unchanged.
- [ ] `corepack pnpm@9.15.9 --filter @picklebaddies/web test:rules`, `corepack pnpm@9.15.9 --filter @picklebaddies/domain test`, `corepack pnpm@9.15.9 --filter @picklebaddies/web test`, and `corepack pnpm@9.15.9 --filter @picklebaddies/web build` pass.

## Deferred Post-MVP

- View-as-user with explicit consent and read-audit design.
- Duplicate guest/registered player merge.
- Automated integrity scans across all historical data.
- Monthly trends and retained metric history.
- Feature flags and kill switches.
- Cross-session audit forensics requiring collection-group indexing.
- GA4 to BigQuery export.
