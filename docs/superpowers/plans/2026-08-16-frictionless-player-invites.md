# Frictionless Player Invites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make squad invites and casual player entry feel lightweight, with WhatsApp sharing and name-only guests before account-member management.

**Architecture:** Reuse the existing squad invite code, guest-player, and account-member actions on the squad detail page. Add client-side share helpers only; no data model or backend changes.

**Tech Stack:** Next.js App Router, React client component, existing DuoRally server actions and CSS utilities.

## Global Constraints

- Do not force casual players to sign in.
- Keep account creation as an incentive for stats, rankings, history, and app access.
- Preserve existing account-member management for organisers who need it.
- Keep WhatsApp/share behavior URL-based and browser-safe.

---

### Task 1: Invite Sharing

**Files:**
- Modify: `apps/web/src/app/(app)/groups/[groupId]/page.tsx`

**Interfaces:**
- Consumes: `inviteCode`, `group?.name`, `window.location.origin`, `navigator.share`, `navigator.clipboard`
- Produces: "Share invite" and "WhatsApp" actions beside the invite code.

- [ ] **Step 1: Add share helpers**
- [ ] **Step 2: Add WhatsApp and native share buttons**
- [ ] **Step 3: Keep copy/new-code controls**

### Task 2: Player Add Priority

**Files:**
- Modify: `apps/web/src/app/(app)/groups/[groupId]/page.tsx`

**Interfaces:**
- Consumes: existing `handleAddGuestPlayer` and `handleAddMember`
- Produces: "Add player by name" first, "Add existing member" second.

- [ ] **Step 1: Move guest form above account-member form**
- [ ] **Step 2: Replace forceful sign-up copy with incentive copy**
- [ ] **Step 3: Validate with TypeScript and diff checks**
