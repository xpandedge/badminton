# Mobile Dashboard Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile dashboard prioritize frequent returning-user actions while keeping the full join-squad flow prominent only for brand-new users.

**Architecture:** Use the dashboard's existing group/session state to render different layouts for no-squad and existing-squad users. Keep all current join/search handlers; move utility links into a compact row for returning users.

**Tech Stack:** Next.js App Router, React client component, existing DuoRally inline style conventions.

## Global Constraints

- Optimize mobile first.
- Keep the full `Find your squad` form only when the user has no squads.
- Keep `Join squad`, `Rankings`, and `Book court` available but lower priority for existing users.
- Do not add new backend behavior.

---

### Task 1: Returning-User Dashboard

**Files:**
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `groupsLoaded`, `groups`, `sessions`, existing CTA links.
- Produces: compact summary, primary session action, squad list higher on screen, compact utility row.

- [ ] **Step 1: Add derived session state**
- [ ] **Step 2: Replace large greeting hero with compact status strip**
- [ ] **Step 3: Render full join form only when group count is zero**
- [ ] **Step 4: Move utility links below squads for returning users**
- [ ] **Step 5: Validate with TypeScript and diff checks**
