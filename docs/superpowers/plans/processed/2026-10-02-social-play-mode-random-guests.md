# Social Play Mode Guest Gender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let organisers choose Random or Mixed games for social sessions, and skip guest gender entry for Random sessions.

**Architecture:** Add a shared `SocialPlayMode` domain type and persist it on session documents as `socialPlayMode`. New social sessions default to `random`; `mixed_games` keeps the existing gender-required guest flow. Existing sessions without `socialPlayMode` keep the prior gender-required behavior.

**Tech Stack:** Next.js App Router, React, TypeScript, Firebase server actions, `@picklebaddies/domain`.

## Global Constraints

- Use exactly Male, Female, Non-binary when gender is captured.
- Guest gender is captured at player level only when the session requires it.
- Random social sessions must not show a guest gender dropdown.
- Existing sessions with no `socialPlayMode` must not silently lose their existing gender-required behavior.
- Preserve unrelated dirty files and hunks.

---

### Task 1: Shared Session Setting

**Files:**
- Create: `packages/domain/src/social-play-mode.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `apps/web/src/lib/sessions/types.ts`

**Interfaces:**
- Produces: `SocialPlayMode = "random" | "mixed_games"`
- Produces: `requiresGuestGenderForSocialPlayMode(mode?: unknown): boolean`

- [ ] Add the shared type and helper.
- [ ] Export it from the domain package.
- [ ] Add optional `socialPlayMode?: SocialPlayMode` to the web `Session` type.

### Task 2: Session Creation UI and Persistence

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/new/page.tsx`
- Modify: `apps/web/src/server/sessions/actions.ts`
- Modify: `apps/web/src/lib/sessions/sessions.ts`

**Interfaces:**
- Consumes: `SocialPlayMode`
- Produces: `socialPlayMode` saved on session docs

- [ ] Add a `Game mix` setting with `Random` and `Mixed games`.
- [ ] Default new social sessions to `random`.
- [ ] Send `socialPlayMode` into `createSession`.
- [ ] Persist `socialPlayMode` in server and legacy client create paths.

### Task 3: Guest Gender Behavior

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/page.tsx`
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`
- Modify: `apps/web/src/lib/sessions/rebalance.ts`
- Modify: `apps/web/src/server/sessions/players.ts`

**Interfaces:**
- Consumes: `requiresGuestGenderForSocialPlayMode(session.socialPlayMode)`
- Produces: Random sessions allow `{ gender: undefined }`; Mixed games require valid gender.

- [ ] Hide gender dropdowns when guest gender is not required.
- [ ] Disable Add guest only when missing the fields required for the current mode.
- [ ] Make server-side gender optional for Random sessions and required for Mixed/legacy sessions.

### Task 4: Verify

**Files:**
- Test: `packages/domain/src/social-play-mode.test.ts`
- Test: `apps/web/tsconfig.json`

- [ ] Run domain tests.
- [ ] Rebuild domain package.
- [ ] Run web TypeScript check.
- [ ] Run `git diff --check`.
