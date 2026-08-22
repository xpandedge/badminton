# Password Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline password reset support to DuoRally sign-in and document the Firebase Auth branding launch gate.

**Architecture:** The Firebase Auth wrapper remains in `apps/web/src/lib/auth/sign-in.ts`, keeping client Auth calls out of React components except through local helper functions. The existing `/sign-in` client component owns UI state, so it will own reset-request status and call the helper with the email input value.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Firebase Auth client SDK, Vitest.

## Global Constraints

- Preserve Google sign-in behavior.
- Show password recovery only for sign-in mode, not registration mode.
- Do not claim launch readiness until Firebase Auth email templates and sender branding are reconfigured to DuoRally.
- Do not move existing Cloud Functions or server action boundaries.
- Preserve existing worktree changes not related to password recovery.

---

### Task 1: Firebase Password Reset Helper

**Files:**
- Modify: `apps/web/src/lib/auth/sign-in.ts`

**Interfaces:**
- Produces: `sendPasswordReset(email: string): Promise<void>`

- [ ] **Step 1: Add the Firebase import**

```ts
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  type UserCredential,
} from "firebase/auth";
```

- [ ] **Step 2: Add the helper**

```ts
export async function sendPasswordReset(email: string): Promise<void> {
  const { auth } = getFirebaseServices();
  await sendPasswordResetEmail(auth, email);
}
```

- [ ] **Step 3: Run focused typecheck**

Run: `pnpm --filter @picklebaddies/web typecheck`

Expected: TypeScript accepts the new helper.

### Task 2: Sign-In UI Reset Action

**Files:**
- Modify: `apps/web/src/app/sign-in/page.tsx`

**Interfaces:**
- Consumes: `sendPasswordReset(email: string): Promise<void>`
- Produces: Inline reset flow inside `SignInForm`

- [ ] **Step 1: Import helper**

```ts
import {
  signInWithGoogle,
  signInWithEmail,
  registerWithEmail,
  sendPasswordReset,
} from "@/lib/auth/sign-in";
```

- [ ] **Step 2: Add reset status state**

```ts
const [resetMessage, setResetMessage] = useState<string | null>(null);
```

- [ ] **Step 3: Clear reset status when mode changes**

```ts
setResetMessage(null);
```

- [ ] **Step 4: Add reset handler**

```ts
async function handlePasswordReset() {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    setError("Enter your email address first, then request a reset link.");
    setResetMessage(null);
    return;
  }

  setBusy(true);
  setError(null);
  setResetMessage(null);
  try {
    await sendPasswordReset(trimmedEmail);
    setResetMessage("If an account exists for that email, a DuoRally password reset link has been sent.");
  } catch (e) {
    setError(e instanceof Error ? e.message : "Password reset failed");
  } finally {
    setBusy(false);
  }
}
```

- [ ] **Step 5: Render the action only in sign-in mode**

```tsx
{mode === "signin" && (
  <button
    type="button"
    className="pb-link-button"
    disabled={busy}
    onClick={handlePasswordReset}
  >
    Forgot password?
  </button>
)}
```

- [ ] **Step 6: Render reset success status**

```tsx
{resetMessage && (
  <div className="pb-success" role="status">
    <span>{resetMessage}</span>
  </div>
)}
```

- [ ] **Step 7: Run focused typecheck**

Run: `pnpm --filter @picklebaddies/web typecheck`

Expected: TypeScript accepts the updated sign-in component.

### Task 3: Launch Documentation

**Files:**
- Create: `docs/plans/2026-08-09-password-recovery-design.md`

**Interfaces:**
- Produces: A launch checklist for Firebase Auth email branding

- [ ] **Step 1: Document Firebase branding gate**

Add a design note stating that Firebase Auth templates/sender configuration must say DuoRally before launch, because the local Firebase project still uses PickleBaddies naming.

- [ ] **Step 2: Verify docs exist**

Run: `Test-Path docs/plans/2026-08-09-password-recovery-design.md`

Expected: `True`

### Task 4: Final Verification

**Files:**
- Verify: `apps/web/src/lib/auth/sign-in.ts`
- Verify: `apps/web/src/app/sign-in/page.tsx`
- Verify: `docs/plans/2026-08-09-password-recovery-design.md`

- [ ] **Step 1: Run focused web typecheck**

Run: `pnpm --filter @picklebaddies/web typecheck`

Expected: PASS.

- [ ] **Step 2: Run focused auth tests**

Run: `pnpm --filter @picklebaddies/web exec vitest run src/lib/auth`

Expected: PASS.

- [ ] **Step 3: Inspect diff**

Run: `git diff -- apps/web/src/lib/auth/sign-in.ts apps/web/src/app/sign-in/page.tsx docs/plans/2026-08-09-password-recovery-design.md docs/superpowers/plans/2026-08-09-password-recovery.md`

Expected: Diff contains only the password reset helper, inline reset UI and docs.

- [ ] **Step 4: Firebase Console launch check**

In Firebase Console for `picklebaddies-prod-e727d`, configure Authentication email templates and custom domain/sender settings for DuoRally, then send a real password reset email to confirm the inbox-visible branding.
