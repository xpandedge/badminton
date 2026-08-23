# In-App Support Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a signed-in support form that emails `sanju36@gmail.com` without exposing the recipient or SMTP credentials to users.

**Architecture:** The existing Help page and bottom navigation gain a Support form/link. A server-only Next.js action verifies the Firebase session, validates the payload, checks the existing Firestore-backed rate limiter, and sends through Gmail SMTP using Nodemailer. The recipient is a server-only constant and user identity comes from the verified session.

**Tech Stack:** Next.js 15 server actions, React 19 client component, Firebase Admin session verification and Firestore rate limiter, Nodemailer, Vitest, pnpm 9.15.9.

## Global Constraints

- Support is available to signed-in users only.
- Never render `sanju36@gmail.com` in client code or accept the destination from the form.
- Never commit SMTP credentials; production values belong in Vercel environment variables.
- Preserve unrelated uncommitted founder-admin work in the working tree.
- Use `corepack pnpm@9.15.9` for package and verification commands.
- Limit input to subject 120 characters and message 4000 characters.
- Limit each signed-in user to 3 support submissions per hour.

---

### Task 1: Add the mail dependency and server contract

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/src/server/support/actions.ts`
- Create: `apps/web/src/server/support/actions.test.ts`

**Interfaces:**
- Produces `submitSupportRequest(input: { subject: string; message: string; honeypot?: string }): Promise<ActionResult<void>>`.
- Consumes `requireSession`, `checkRateLimit`, and `err`/`ok` from existing server helpers.

- [ ] **Step 1: Add the Nodemailer dependency**

Run `corepack pnpm@9.15.9 --filter @picklebaddies/web add nodemailer` and add the matching `@types/nodemailer` package if TypeScript requires it.

- [ ] **Step 2: Write focused tests for input behavior**

Mock `requireSession`, `checkRateLimit`, and the Nodemailer transport. Cover unauthenticated users, blank/oversized subject or message, honeypot submissions, rate-limit errors, missing SMTP configuration, and a successful message containing the verified user's identity with `to: "sanju36@gmail.com"`.

- [ ] **Step 3: Implement the server action**

Use `requireSession()` and reject missing SMTP variables with a generic `INTERNAL` result. Trim and bound fields, silently return success for a filled honeypot, call `checkRateLimit("support:${session.uid}", { maxRequests: 3, windowMs: 3_600_000 })`, then create an SMTP transport with `smtp.gmail.com`, port `465`, and secure TLS. Set `from` to `SUPPORT_SMTP_USER`, `to` to the server-only recipient, and `replyTo` to the verified session email when available. Do not include raw exception text in the response.

- [ ] **Step 4: Run the focused tests**

Run `corepack pnpm@9.15.9 --filter @picklebaddies/web exec vitest run src/server/support/actions.test.ts` and confirm all cases pass.

- [ ] **Step 5: Commit the server support slice**

Run `git add apps/web/package.json pnpm-lock.yaml apps/web/src/server/support/actions.ts apps/web/src/server/support/actions.test.ts` then `git commit -m "Add server-side support request email"`.

### Task 2: Add the Support entry point and form

**Files:**
- Create: `apps/web/src/components/SupportForm.tsx`
- Modify: `apps/web/src/app/(app)/help/page.tsx`
- Modify: `apps/web/src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes `submitSupportRequest` from `@/server/support/actions`.
- Produces a mobile-friendly Support link in the existing bottom nav and a form section on `/help`.

- [ ] **Step 1: Build the client form**

Create a controlled form with subject and message fields, a honeypot field hidden from sight but available to bots, submit busy state, success state, and generic error state. Use existing `pb-input` and `pb-btn` classes plus the Help page's current visual language. Do not show the support recipient.

- [ ] **Step 2: Add navigation**

Keep the current Help destination and add a clearly labeled `Support` link/button in the signed-in app shell without disturbing the session FAB. The link should target `/help#support`.

- [ ] **Step 3: Add the Help section**

Render the form in a dedicated `Support` section near the end of the guide, with copy that says questions and bug reports can be sent from here. Include an accessible heading, labels, and live status messaging.

- [ ] **Step 4: Run web tests and typecheck**

Run `corepack pnpm@9.15.9 --filter @picklebaddies/web test` and `corepack pnpm@9.15.9 -r typecheck`.

- [ ] **Step 5: Commit the UI slice**

Run `git add apps/web/src/components/SupportForm.tsx apps/web/src/app/(app)/help/page.tsx apps/web/src/app/(app)/layout.tsx` then `git commit -m "Add in-app support form"`.

### Task 3: Release configuration and production verification

**Files:**
- Modify: `docs/plans/2026-08-23-support-button-design.md`
- Modify: `docs/superpowers/plans/2026-08-23-support-button.md`

**Interfaces:**
- Requires Vercel production environment variables `SUPPORT_SMTP_USER` and `SUPPORT_SMTP_APP_PASSWORD`.

- [ ] **Step 1: Check the final diff**

Run `git diff --check` and `git status --short`; verify only the support feature commits contain support files and unrelated founder-admin changes remain unstaged.

- [ ] **Step 2: Document runtime setup**

Record that the Gmail account must have 2-Step Verification enabled and a Gmail app password created for `SUPPORT_SMTP_APP_PASSWORD`; add both values to Vercel Production environment variables, then redeploy.

- [ ] **Step 3: Deploy**

Run the repository's established production deployment path after the secrets are configured. Confirm the deployment is READY and the production alias resolves.

- [ ] **Step 4: Smoke-check the user flow**

Open `https://duorally.com.au/help`, confirm Support is reachable and the form renders. Submit a test message only after the SMTP secret is configured, then confirm delivery to `sanju36@gmail.com` without exposing the destination in the UI.
