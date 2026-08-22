# Home Squad Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make joining or finding a squad obvious from the dashboard for newly signed-in players.

**Architecture:** Reuse the existing squad join/search server actions on the dashboard rather than creating a second backend path. Keep `/groups` focused on squad management while Home presents the entry actions a new player needs first.

**Tech Stack:** Next.js App Router, React client components, Firebase-backed server actions, existing DuoRally CSS utilities.

## Global Constraints

- Use visible "Squads" wording; preserve `/groups` routes and internal group identifiers.
- Do not add new persistence or search infrastructure.
- Keep the dashboard action-led and mobile friendly.
- Do not hide existing create/manage squad flows.

---

### Task 1: Dashboard Squad Discovery

**Files:**
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `joinSquadByCode(code)`, `searchSquads(query)`, `requestToJoinSquad(squadId)` from `@/server/squads/actions`
- Produces: A dashboard "Find your squad" card with invite-code join, name search, request/open states, and create fallback link.

- [ ] **Step 1: Import existing squad actions**

Add `useRef`, `useRouter`, and the squad action imports to the dashboard component.

- [ ] **Step 2: Add join/search state and handlers**

Mirror the working `/groups` page behavior: join by code routes directly into the squad, search debounces after two characters, request updates the local requested state, and existing members get an Open action.

- [ ] **Step 3: Add the Home card**

Place a "Find your squad" card below the primary CTA row and before "Your squads". For users with no squads, make this the first strong next step; for existing users, keep it compact but visible.

- [ ] **Step 4: Soften the squad management affordance**

Change the `+ New` link near "Your squads" to "Create" so joining is not implied to live only inside the Squads tab.

- [ ] **Step 5: Validate**

Run `tsc --noEmit` from `apps/web` and `git diff --check` on the touched files.
