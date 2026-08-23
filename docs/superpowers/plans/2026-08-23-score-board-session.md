# Score Board Session Visual Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the public score-link board with the authenticated session console's visual system without changing its data or interaction behavior.

**Architecture:** Keep `apps/web/src/lib/sessions/board.ts` and all board state logic unchanged. Refine `apps/web/src/app/board/[code]/page.tsx` in place, reusing existing design tokens and the session console's dark patterned hero, status pills, surface cards, and dense leaderboard grid.

**Tech Stack:** Next.js 15, React 19, TypeScript, existing CSS variables and inline board styles.

## Global Constraints

- Preserve the public board route and polling behavior.
- Preserve player-name selection and local-storage identity behavior.
- Do not add client writes, authentication requirements, or new Firestore reads.
- Keep names and leaderboard values readable on narrow screens.

---

### Task 1: Restyle the public board

**Files:**
- Modify: `apps/web/src/app/board/[code]/page.tsx`

**Interfaces:**
- Consumes: existing `BoardData`, `deriveViewerState`, `courtCurrentMatch`, `benchPlayers`, and current board state.
- Produces: the same board content with session-aligned visual hierarchy.

- [x] **Step 1: Update the board hero**

Use the existing dark patterned header style from the session console, retain the session name, sport label, status pill, and player picker, and keep a constrained `maxWidth` that works on phones and desktop.

- [x] **Step 2: Update live court and personal-state surfaces**

Give current courts, the personalized hero, up-next state, bench state, and completed-session message consistent borders, radius, spacing, and status emphasis. Keep the existing `mine` highlight and all current text/data.

- [x] **Step 3: Update the leaderboard panel**

Use a session-style dense row layout with a stronger panel header, stable rank/name/stat columns, highlighted selected player, and no clipped long names. Preserve the winner-only and points-mode column behavior.

### Task 2: Verify and release

**Files:**
- Verify: `apps/web/src/app/board/[code]/page.tsx`

- [x] **Step 1: Run checks**

Run `corepack pnpm@9.15.9 --filter @picklebaddies/web typecheck`, `corepack pnpm@9.15.9 --filter @picklebaddies/web test`, and `corepack pnpm@9.15.9 --filter @picklebaddies/web build`. Expected: all pass.

- [x] **Step 2: Review the diff**

Run `git diff --check` and confirm only the board presentation and approved plan/design documents changed.

- [x] **Step 3: Commit and deploy**

Commit with `git commit -m "Align public score board with session design"`, push `main`, deploy the linked Vercel production project, and verify the Firebase workflow for the pushed commit.
