# Founder Console Usage Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/admin` into a founder-first usage cockpit while preserving table views for People, Squads, Sessions, Requests, Fixes, Admins, and Fix log.

**Architecture:** Keep access control unchanged through `assertSuperAdminPage()` and Firebase custom claims. Extend the cached server metrics snapshot with 90-day adoption, retention, session funnel, weekly trend, geography, quiet squads, and guest-session signals, then render them in the admin overview as drill-down cards and tables.

**Tech Stack:** Next.js App Router server components, Firebase Admin SDK, Firestore aggregate queries, `@picklebaddies/domain` pure metric helpers, Vitest.

## Global Constraints

- `/admin` remains hidden from non-admin users through server-side claim checks and 404 behavior.
- Do not hardcode founder/admin emails into runtime access checks.
- Existing People, Squads, Sessions, Health, Cases, Fixes, App Admins, and Audit table pages remain available.
- The table/action views must be visible from a left panel on desktop and an easy horizontal rail on mobile.
- Follow the existing DuoRally brand theme: ink, volt, emerald, Archivo/Hanken fonts, and sport-facing language.
- Geography must stay visible on the founder dashboard and squad table view.
- Support fixes must remain explicit, audited, and separated from ordinary squad-owner actions.

---

### Task 1: Extend Admin Metrics Contract

**Files:**
- Modify: `packages/domain/src/admin-metrics.ts`
- Modify: `packages/domain/src/admin-metrics.test.ts`

**Interfaces:**
- Consumes: Existing `AdminMetricsSnapshot`, `repeatSquadRate`, `sessionCompletionRate`, `sessionAbandonmentRate`, and `unscoredMatchRate`.
- Produces: `squadSecondSessionRate(snapshot: AdminMetricsSnapshot): number`, plus new snapshot fields for period, retention, weekly sessions, quiet squads, and session funnel values.

- [x] **Step 1: Add failing test expectations**

```ts
expect(squadSecondSessionRate(snapshot({
  retention: { fivePlus: 1, twoToFour: 2, once: 1 },
}))).toBe(75);
```

- [x] **Step 2: Implement metric fields and helper**

```ts
export function squadSecondSessionRate(snapshot: AdminMetricsSnapshot): number {
  return rate(snapshot.retention.fivePlus + snapshot.retention.twoToFour, snapshot.retention.fivePlus + snapshot.retention.twoToFour + snapshot.retention.once);
}
```

- [x] **Step 3: Run domain tests**

Run: `pnpm --filter @picklebaddies/domain test -- --run src/admin-metrics.test.ts`

### Task 2: Compute Founder Usage Snapshot

**Files:**
- Modify: `apps/web/src/server/admin/metrics.ts`

**Interfaces:**
- Consumes: Firestore `users`, `players`, `groups`, `sessions`, session `matches`, and session `players`.
- Produces: `getAdminMetrics()` returning the extended `AdminMetricsSnapshot`.

- [x] **Step 1: Add 90-day aggregation helpers**

```ts
const periodDays = 90;
const last90 = daysAgo(periodDays);
```

- [x] **Step 2: Build weekly trend and retention buckets**

```ts
const weeklySessions = buildWeeklySeries(recentSessionDocs, 12);
const retention = bucketSquadRetention(squadSessionCounts);
```

- [x] **Step 3: Build session fall-over funnel**

```ts
sessions: {
  created90d,
  neverStarted,
  started,
  completed,
  openNow,
  fullyScored,
}
```

- [x] **Step 4: Build quiet squad list**

```ts
quietSquads: squads.filter((squad) => squad.lastPlayedAtIso && olderThan30Days).slice(0, 8)
```

### Task 3: Redesign `/admin` as Founder Console

**Files:**
- Modify: `apps/web/src/app/(admin)/admin/page.tsx`
- Modify: `apps/web/src/app/(admin)/admin/layout.tsx`
- Modify: `apps/web/src/app/(admin)/admin/users/page.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: `getAdminMetrics()`.
- Produces: Founder usage dashboard with summary tiles, trend chart, retention panel, session funnel, geography, quiet squads, and clear links to table views.

- [x] **Step 1: Rename the overview mental model**

```tsx
{ href: "/admin", label: "Usage" }
{ href: "/admin/users", label: "People" }
{ href: "/admin/audit", label: "Fix log" }
```

- [x] **Step 2: Add the left table/action panel**

```tsx
<aside className="pb-admin-rail">
  <Link href="/admin/users">People table</Link>
  <Link href="/admin/squads">Squads table</Link>
  <Link href="/admin/sessions">Sessions table</Link>
</aside>
```

- [x] **Step 3: Render weekly usage and retention**

```tsx
<WeeklyBars weeks={metrics.weeklySessions} />
<RetentionPanel retention={metrics.retention} />
```

- [x] **Step 4: Keep table drill-downs visible**

```tsx
<Link href="/admin/users">People table</Link>
<Link href="/admin/squads">Squads table</Link>
<Link href="/admin/sessions">Sessions table</Link>
```

### Task 4: Verify and Ship

**Files:**
- Test: `packages/domain/src/admin-metrics.test.ts`
- Test: `apps/web`

**Interfaces:**
- Consumes: Updated admin dashboard.
- Produces: Verified production deployment when requested.

- [x] **Step 1: Run focused domain tests**

Run: `pnpm --filter @picklebaddies/domain test -- --run src/admin-metrics.test.ts`

- [x] **Step 2: Run web typecheck**

Run: `pnpm --filter @picklebaddies/web typecheck`

- [x] **Step 3: Deploy to production after explicit user approval**

Run: `npx vercel deploy --prod -y`
