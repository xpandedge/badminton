# Session Name Placeholder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Require an intentional session name while showing a useful name/date/time example.

**Architecture:** Change only the create-session form's initial name state and input placeholder. Keep server validation and create-session data flow unchanged.

**Tech Stack:** Next.js 15, React 19, TypeScript, existing form styles.

### Task 1: Make session naming intentional

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/new/page.tsx`

- [ ] Start `name` as an empty string.
- [ ] Add the approved name/date/time example as the input placeholder.
- [ ] Preserve the existing required attribute, `canCreate` guard, and server validation.

### Task 2: Verify and release

- [ ] Run web typecheck and tests.
- [ ] Run the production build or record the local Windows symlink limitation if it recurs after successful compilation.
- [ ] Review the diff, commit, push, deploy Vercel, and verify the Firebase workflow.
