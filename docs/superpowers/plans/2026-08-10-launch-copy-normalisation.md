# Launch Copy Normalisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize launch-facing copy around Squads, customer-facing booking search, user-readable statuses and current button labels.

**Architecture:** Keep data models and routes unchanged. Update visible strings and light UI state only in existing Next.js client/server components, using existing CSS classes and inline styles.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, existing DuoRally CSS tokens.

## Global Constraints

- Use Squads as the user-facing term.
- Keep `/groups` routes and `group`/`squad` code names unchanged unless visible text requires different copy.
- Bookings is client-facing: use search intent, suburb/venue filtering, sport selection and practical booking links.
- Do not show `draft`, `scheduled` or `planned` to users.
- Keep current action labels: Start Playing and Shuffle Next Games.
- Preserve unrelated dirty worktree changes.

---

### Task 1: Court Booking Copy And Search

**Files:**
- Modify: `apps/web/src/app/(app)/bookings/page.tsx`

**Interfaces:**
- Produces: Sport and suburb/venue filtering through local component state.

- [ ] **Step 1: Remove `bestFor` from the `Venue` type and data**

Delete the `bestFor: string;` property and all `bestFor: "..."` data fields.

- [ ] **Step 2: Add a location query**

```ts
const [query, setQuery] = useState("");
```

- [ ] **Step 3: Filter by active sport and suburb/venue query**

```ts
const venues = useMemo(() => {
  const normalized = query.trim().toLowerCase();
  return VENUES.filter((venue) => {
    const matchesSport = venue.sports.includes(activeSport);
    const matchesQuery =
      !normalized ||
      venue.area.toLowerCase().includes(normalized) ||
      venue.name.toLowerCase().includes(normalized);
    return matchesSport && matchesQuery;
  });
}, [activeSport, query]);
```

- [ ] **Step 4: Rewrite the hero**

Use kicker `Court booking`, heading `Where do you want to play?`, and supporting copy `Pick a sport, search by suburb or venue, then book directly with the court.`

- [ ] **Step 5: Add the search input**

Render an input with placeholder `Suburb or venue` near the sport selector.

- [ ] **Step 6: Remove the vanity counter and taxonomy chip**

Delete the hero meter and `pb-venue-best` rendering.

- [ ] **Step 7: Add an empty state**

Show `No courts found for that search. Try another suburb or switch sport.` when the filtered venue list is empty.

### Task 2: Squads And Help Copy

**Files:**
- Modify: `apps/web/src/app/(app)/layout.tsx`
- Modify: `apps/web/src/app/(app)/groups/page.tsx`
- Modify: `apps/web/src/app/(app)/help/page.tsx`
- Modify: `docs/USER_GUIDE.md`

**Interfaces:**
- Produces: User-facing copy that says Squads consistently and current button labels.

- [ ] **Step 1: Change navigation label**

Change visible nav label `Groups` to `Squads`.

- [ ] **Step 2: Change group page labels**

Change visible labels such as `Your Groups` to `Your Squads` while preserving function names and routes.

- [ ] **Step 3: Rewrite help setup copy**

Replace `Go to Groups...` with `Open Squads...`; replace `DuoRally can build court assignments correctly` with `DuoRally knows which courts are available when play starts.`

- [ ] **Step 4: Replace spec-like help card**

Replace `Session rule` with `When plans change` and explain that `Shuffle Next Games` updates upcoming games while keeping finished results intact.

### Task 3: Friendly Status Labels

**Files:**
- Modify: `apps/web/src/lib/format/status.ts`
- Modify: `apps/web/src/components/StatusBadge.tsx`

**Interfaces:**
- Produces: `formatSessionStatus(status: string): string` labels and status badge labels with friendly copy.

- [ ] **Step 1: Update status map**

```ts
const SESSION_STATUS_LABELS: Record<string, string> = {
  draft: "Not started",
  scheduled: "Upcoming",
  active: "Playing now",
  paused: "Paused",
  completed: "Finished",
  cancelled: "Cancelled",
};
```

- [ ] **Step 2: Update badge labels**

Use `Not started`, `Upcoming`, `Playing now`, `Paused`, `Finished` and `Cancelled`.

### Task 4: Verification

**Files:**
- Verify: `apps/web/src/app/(app)/bookings/page.tsx`
- Verify: `apps/web/src/app/(app)/help/page.tsx`
- Verify: `apps/web/src/app/(app)/groups/page.tsx`
- Verify: `apps/web/src/app/(app)/layout.tsx`
- Verify: `apps/web/src/lib/format/status.ts`
- Verify: `apps/web/src/components/StatusBadge.tsx`

- [ ] **Step 1: Search for stale visible copy**

Run:

```powershell
rg -n "Session Chaos Killer|Brisbane court finder|compare nearby venues|bestFor|Large court bank|Contactless booking|Live Console|Start Session|Your Groups|workspace|label: \"Draft\"|label: \"Scheduled\"" apps/web/src docs/USER_GUIDE.md -S
```

Expected: no live-app occurrences of stale copy.

- [ ] **Step 2: Typecheck web app**

Run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit
```

from `apps/web`.

Expected: PASS.

- [ ] **Step 3: Inspect diff**

Run:

```powershell
git diff -- apps/web/src/app/(app)/bookings/page.tsx apps/web/src/app/(app)/help/page.tsx apps/web/src/app/(app)/groups/page.tsx apps/web/src/app/(app)/layout.tsx apps/web/src/lib/format/status.ts apps/web/src/components/StatusBadge.tsx docs/USER_GUIDE.md
```

Expected: changes are copy/UI only.
