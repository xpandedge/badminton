# Session Connect TV Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give organisers a visible Connect a TV action on each session page.

**Architecture:** Reuse the existing session `scoreCode` and `/board/[code]/connect` route. Render the action in the session hero beside Run Session, only when a public board code exists, so TV pairing, Chromecast and mirroring continue through the existing flow.

**Tech Stack:** Next.js App Router, React, TypeScript, Playwright.

## Global Constraints

- Do not create a second TV connection flow.
- Do not expose a button when the session has no `scoreCode`.
- Keep the action usable at mobile widths.

---

### Task 1: Add and verify the session action

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/page.tsx`
- Test: `apps/web/e2e/tv-connect.spec.ts`

**Interfaces:**
- Consumes: `session.scoreCode` and existing `/board/[code]/connect` route.
- Produces: an organiser-visible `Connect a TV` link with the session-specific href.

- [ ] Add a secondary hero link beside `Run Session`:

```tsx
{session.scoreCode && (
  <a href={`/board/${encodeURIComponent(session.scoreCode)}/connect`}>
    Connect a TV
  </a>
)}
```

- [ ] Add a browser assertion that the session page exposes the link and its href ends in `/board/<scoreCode>/connect`.
- [ ] Run the focused TV browser tests and TypeScript check.
- [ ] Commit the scoped UI, test and plan changes.
- [ ] Deploy production and verify the session route plus connection route.
