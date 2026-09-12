# Homepage Session Tournament Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the public DuoRally homepage so it presents the bigger organiser story for social sessions, round robins, and tournament-style play.

**Architecture:** Keep the implementation in the existing public homepage route and public CSS system. Replace feature-sheet copy with a visitor-facing organiser journey while preserving current navigation, metadata, legal links, and public sport SEO links.

**Tech Stack:** Next.js App Router, React server component, global CSS, existing DuoRally components.

## Global Constraints

- Do not edit the unrelated dirty dashboard or live-session files.
- Keep tournament wording honest: use "social sessions, round robins, and tournaments" while explaining small tournament-style and round-robin play.
- Use normal visitor-facing copy, not SEO instructions or technical labels.
- Preserve links to sign-in, sport landing pages, Brisbane court links, and legal pages.

---

### Task 1: Homepage Narrative

**Files:**
- Modify: `apps/web/src/app/page.tsx`

**Interfaces:**
- Consumes: existing `Logo` and `LegalLinks` components.
- Produces: updated homepage content using existing and new public CSS classes.

- [ ] **Step 1: Replace feature-first copy**

Update metadata and visible homepage copy around the promise "Run social sessions, round robins, and tournaments from one courtside app."

- [ ] **Step 2: Add organiser journey sections**

Add sections for before play, during play, after play, supported formats, and live board visibility.

- [ ] **Step 3: Preserve routes and links**

Keep links to `/sign-in`, `/racquet-sports-rotation-app`, `/badminton-doubles-rotation-app`, `/pickleball-rotation-app`, and `/brisbane-pickleball-badminton-court-bookings`.

### Task 2: Homepage Presentation

**Files:**
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: existing public CSS variables and button classes.
- Produces: responsive visual treatment for the new homepage blocks.

- [ ] **Step 1: Update public hero layout**

Make the homepage feel like an active court-night control surface without adding external media dependencies.

- [ ] **Step 2: Add responsive classes**

Add CSS for the session-board visual, format rows, journey blocks, and mobile stacking.

- [ ] **Step 3: Check text wrapping**

Ensure mobile text stays readable and does not overlap.

### Task 3: Verification

**Files:**
- Test: `apps/web/tsconfig.json`

**Interfaces:**
- Consumes: local TypeScript checker.
- Produces: verified homepage build compatibility.

- [ ] **Step 1: Run TypeScript**

Run `apps/web/node_modules/.bin/tsc.cmd --noEmit -p apps/web/tsconfig.json`.

- [ ] **Step 2: Inspect diff**

Confirm only the intended homepage, CSS, and plan files are changed.
