# Email Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players create a DuoRally account using email, confirmed password, and display name from the existing sign-in page.

**Architecture:** Reuse the existing `registerWithEmail(email, password, displayName)` Firebase Auth helper. Add a sign-in/create-account mode toggle in `apps/web/src/app/sign-in/page.tsx`, route both modes through the same session-cookie redirect flow, and keep password reset only in sign-in mode.

**Tech Stack:** Next.js App Router, React client state, Firebase Auth.

## Global Constraints

- Keep Google sign-in.
- Avoid Facebook sign-in setup.
- Email/password provider must be enabled in Firebase Console.
- New email account form must collect display name, email, password, and confirm password.

---

### Task 1: Expose Email Account Creation

**Files:**
- Modify: `apps/web/src/app/sign-in/page.tsx`
- Modify: `apps/web/src/lib/auth/sign-in.ts`

- [x] Import `registerWithEmail` into the sign-in page.
- [x] Add `mode: "sign-in" | "create"` and `displayName` state.
- [x] In create mode, submit `registerWithEmail(email, password, displayName)`.
- [x] Show display name input only in create mode.
- [x] Show confirm password input only in create mode.
- [x] Block account creation with `Passwords do not match.` when password and confirm password differ.
- [x] Use `autoComplete="new-password"` in create mode and `current-password` in sign-in mode.
- [x] Keep Forgot password visible only in sign-in mode.

### Task 2: Update Copy

**Files:**
- Modify: `apps/web/src/app/sign-in/page.tsx`
- Modify: `apps/web/src/app/(app)/help/page.tsx`

- [x] Update sign-in hero copy to mention creating an account with email.
- [x] Add a toggle button that switches between `Create account` and `Sign in`.
- [x] Update Help account guidance to mention Google or email signup.

### Task 3: Verify

- [x] Run `node_modules\.bin\tsc.cmd -p apps\web\tsconfig.json --noEmit`.
