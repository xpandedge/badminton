# Help Current Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update DuoRally Help copy so it accurately explains the current organiser and player workflows.

**Architecture:** Preserve the existing role-based, searchable Help page and replace only its content constants and concise supporting copy. Verify every instruction against the current dashboard, squad, session setup, live session, account, board, and scoring controls.

**Tech Stack:** Next.js 15, React 19, TypeScript

## Global Constraints

- Use customer-facing language, not founder or implementation language.
- Keep visible terminology as Squads, Home, Current games, Player Board, Going, and Not going.
- Do not claim that visible current games change after roster or court updates.
- Do not describe guests as permanent squad players.

---

### Task 1: Refresh Organiser Help

**Files:**
- Modify: `apps/web/src/app/(app)/help/page.tsx`

**Interfaces:**
- Produces: current organiser sections, quick start, and troubleshooting copy

- [ ] **Step 1: Update squad and session setup copy**

Describe share/WhatsApp invites, Home RSVPs, Add all, selective additions/removals, and session-only guests.

- [ ] **Step 2: Update live and scoring copy**

Describe Current games, manual swaps, future-game rebalancing, Step Out, Remove, Re-activate, Player Board, score entry, and session completion.

### Task 2: Refresh Player Help

**Files:**
- Modify: `apps/web/src/app/(app)/help/page.tsx`

**Interfaces:**
- Produces: current account, joining, RSVP, playing, and ranking guidance

- [ ] **Step 1: Add account and player-name guidance**

Explain Google signup, existing email/password sign-in and recovery, and editing the global player name from the header initials.

- [ ] **Step 2: Update Home and session guidance**

Explain Home squad discovery, Home RSVPs, automatic session inclusion when Going, the highlighted live/next session, Player Board, and ranking scopes.

### Task 3: Verify and Deploy

**Files:**
- Verify: `apps/web/src/app/(app)/help/page.tsx`

**Interfaces:**
- Produces: production Help content at `https://duorally.com.au/help`

- [ ] **Step 1: Run TypeScript**

Run: `node_modules\.bin\tsc.cmd -p apps\web\tsconfig.json --noEmit`

Expected: exit code 0.

- [ ] **Step 2: Check whitespace**

Run: `git diff --check`

Expected: no whitespace errors; existing CRLF warnings are acceptable.

- [ ] **Step 3: Deploy production**

Run: `npx.cmd vercel deploy --prod -y`

Expected: remote build reaches READY and aliases to `https://duorally.com.au`.
