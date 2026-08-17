# Session RSVP Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a session-specific RSVP roster that gives regular players default priority, lets casual players join confirmed or waiting buckets, and exposes a public name-only RSVP link for casuals without accounts.

**Architecture:** Store player type on squad-player documents, store RSVP capacity settings on squads and copied session documents, and write pure bucket-allocation logic in the domain package. Add server actions for signed-in RSVP and public name-only RSVP, then render a session-specific public RSVP page and admin controls for capacity and overrides.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Firebase Admin SDK transactions, Firestore, Vitest, existing DuoRally inline styles.

## Global Constraints

- The RSVP roster is per session and must show the session name, squad name, venue, date/time, and capacity settings.
- Admins must have an in-system configuration UI for capacity numbers.
- Regular players are in by default unless they mark `I'm away`.
- Casual players opt in.
- Signed-in casuals use the app or the same session RSVP link.
- Name-only casuals can add themselves instantly from a public link.
- Anyone with the link can view display names and add a casual name.
- Name-only casuals can remove themselves without login or token in v1.
- Duplicate casual names are blocked per session, case-insensitive.
- Public roster pages show display names only; do not show email, phone, account IDs, or private profile details.
- Casual confirmed capacity equals configured casual slots plus released regular spots, capped by total session capacity.
- Waitlisted casuals must not become schedulable players.
- Preserve `/groups`, `/sessions`, Firestore collection names, and internal `groups` identifiers.

---

## File Structure

- Modify `packages/domain/src/session-rsvp.ts`: pure types and bucket allocation logic.
- Create `packages/domain/src/session-rsvp.test.ts`: capacity and duplicate-name tests.
- Modify `packages/domain/src/index.ts`: export session RSVP helpers.
- Modify `apps/web/src/server/squads/actions.ts`: add player-type and squad RSVP default actions.
- Modify `apps/web/src/server/sessions/actions.ts`: copy squad RSVP defaults into sessions and update signed-in RSVP behavior.
- Create `apps/web/src/server/sessions/rsvp-public.ts`: public session RSVP lookup and name-only casual actions.
- Modify `apps/web/src/app/(app)/groups/[groupId]/page.tsx`: let admins mark squad players as regular/casual and configure squad RSVP defaults.
- Modify `apps/web/src/app/(app)/sessions/[sessionId]/page.tsx`: show session RSVP settings, share link, session-specific capacity override controls, and admin override controls.
- Create `apps/web/src/app/rsvp/[rsvpCode]/page.tsx`: public session-specific RSVP roster page.
- Modify `firestore.rules`: allow only safe public reads/writes if any client-side public Firestore access is added. Prefer server actions to avoid broad public rules.

### Task 1: Pure RSVP Allocation Logic

**Files:**
- Create: `packages/domain/src/session-rsvp.ts`
- Create: `packages/domain/src/session-rsvp.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces:
  - `type SquadPlayerKind = "regular" | "casual"`
  - `type RsvpResponse = "in" | "away" | "casual_joined" | "removed"`
  - `interface SessionRsvpCapacity`
  - `interface SessionRsvpEntry`
  - `buildSessionRsvpBuckets(input: BuildSessionRsvpBucketsInput): SessionRsvpBuckets`
  - `normalizeCasualName(name: string): string`

- [ ] **Step 1: Write failing tests**

Create `packages/domain/src/session-rsvp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSessionRsvpBuckets, normalizeCasualName } from "./session-rsvp.js";

describe("session RSVP roster", () => {
  it("keeps regulars in by default and moves away regulars to away", () => {
    const result = buildSessionRsvpBuckets({
      capacity: { totalPlayers: 11, casualConfirmedSlots: 3, waitlistEnabled: true },
      regulars: [
        { id: "r1", displayName: "Prasanna" },
        { id: "r2", displayName: "Sachin", response: "away" },
      ],
      casuals: [],
    });

    expect(result.regularsIn.map((p) => p.displayName)).toEqual(["Prasanna"]);
    expect(result.regularsAway.map((p) => p.displayName)).toEqual(["Sachin"]);
  });

  it("promotes casuals into released regular spots", () => {
    const result = buildSessionRsvpBuckets({
      capacity: { totalPlayers: 11, casualConfirmedSlots: 3, waitlistEnabled: true },
      regulars: Array.from({ length: 8 }, (_, index) => ({
        id: `r${index}`,
        displayName: `Regular ${index}`,
        response: index < 2 ? "away" : "in",
      })),
      casuals: Array.from({ length: 6 }, (_, index) => ({
        id: `c${index}`,
        displayName: `Casual ${index}`,
        response: "casual_joined",
      })),
    });

    expect(result.casualsConfirmed).toHaveLength(5);
    expect(result.casualsWaiting).toHaveLength(1);
  });

  it("blocks duplicate casual names by normalized display name", () => {
    expect(normalizeCasualName("  Sam T  ")).toBe("sam t");
    expect(normalizeCasualName("SAM   T")).toBe("sam t");
  });
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```bash
pnpm --filter @picklebaddies/domain exec vitest run src/session-rsvp.test.ts
```

Expected: FAIL because `session-rsvp.ts` does not exist.

- [ ] **Step 3: Implement the pure module**

Create `packages/domain/src/session-rsvp.ts`:

```ts
export type SquadPlayerKind = "regular" | "casual";
export type RsvpResponse = "in" | "away" | "casual_joined" | "removed";

export interface SessionRsvpCapacity {
  totalPlayers: number;
  casualConfirmedSlots: number;
  waitlistEnabled: boolean;
}

export interface SessionRsvpEntry {
  id: string;
  displayName: string;
  response?: RsvpResponse;
  joinedAtMs?: number;
  adminOverride?: "confirmed" | "waiting";
}

export interface BuildSessionRsvpBucketsInput {
  capacity: SessionRsvpCapacity;
  regulars: SessionRsvpEntry[];
  casuals: SessionRsvpEntry[];
}

export interface SessionRsvpBuckets {
  regularsIn: SessionRsvpEntry[];
  regularsAway: SessionRsvpEntry[];
  casualsConfirmed: SessionRsvpEntry[];
  casualsWaiting: SessionRsvpEntry[];
  confirmedCount: number;
  spotsRemaining: number;
}

export function normalizeCasualName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildSessionRsvpBuckets(input: BuildSessionRsvpBucketsInput): SessionRsvpBuckets {
  const regularsAway = input.regulars.filter((entry) => entry.response === "away");
  const regularsIn = input.regulars.filter((entry) => entry.response !== "away" && entry.response !== "removed");
  const releasedRegularSpots = regularsAway.length;
  const maxCasualConfirmed = Math.max(
    0,
    Math.min(
      input.capacity.totalPlayers - regularsIn.length,
      input.capacity.casualConfirmedSlots + releasedRegularSpots,
    ),
  );
  const joinedCasuals = input.casuals
    .filter((entry) => entry.response === "casual_joined")
    .sort((a, b) => (a.joinedAtMs ?? 0) - (b.joinedAtMs ?? 0));
  const overrideConfirmed = joinedCasuals.filter((entry) => entry.adminOverride === "confirmed");
  const overrideWaiting = new Set(
    joinedCasuals.filter((entry) => entry.adminOverride === "waiting").map((entry) => entry.id),
  );
  const remainingCasuals = joinedCasuals.filter(
    (entry) => entry.adminOverride !== "confirmed" && !overrideWaiting.has(entry.id),
  );
  const remainingSlots = Math.max(0, maxCasualConfirmed - overrideConfirmed.length);
  const casualsConfirmed = [...overrideConfirmed, ...remainingCasuals.slice(0, remainingSlots)];
  const confirmedIds = new Set(casualsConfirmed.map((entry) => entry.id));
  const casualsWaiting = joinedCasuals.filter((entry) => !confirmedIds.has(entry.id));
  const confirmedCount = regularsIn.length + casualsConfirmed.length;

  return {
    regularsIn,
    regularsAway,
    casualsConfirmed,
    casualsWaiting,
    confirmedCount,
    spotsRemaining: Math.max(0, input.capacity.totalPlayers - confirmedCount),
  };
}
```

- [ ] **Step 4: Export the module**

Add to `packages/domain/src/index.ts`:

```ts
export * from "./session-rsvp.js";
```

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --filter @picklebaddies/domain exec vitest run src/session-rsvp.test.ts
node_modules\\.bin\\tsc.cmd -p packages\\domain\\tsconfig.json --noEmit
```

Expected: tests and typecheck pass. If pnpm is blocked by noninteractive cleanup, run the package-local Vitest binary and record the blocker.

### Task 2: Squad Player Type And Defaults

**Files:**
- Modify: `apps/web/src/server/squads/actions.ts`
- Modify: `apps/web/src/app/(app)/groups/[groupId]/page.tsx`

**Interfaces:**
- Consumes: `SquadPlayerKind`.
- Produces:
  - `updateSquadPlayerKind(squadId: string, playerId: string, kind: SquadPlayerKind): Promise<ActionResult<void>>`
  - `updateSquadRsvpDefaults(squadId: string, input: SquadRsvpDefaultsInput): Promise<ActionResult<void>>`

- [ ] **Step 1: Add server action interfaces**

Add near the squad action types:

```ts
export interface SquadRsvpDefaultsInput {
  totalPlayers: number;
  casualConfirmedSlots: number;
  waitlistEnabled: boolean;
  cutoffHoursBeforeStart?: number | null;
}
```

- [ ] **Step 2: Implement `updateSquadPlayerKind`**

Add a server action that requires owner/admin role and writes:

```ts
t.set(db.doc(`groups/${squadId}/players/${playerId}`), {
  playerKind: kind,
  updatedAt: FieldValue.serverTimestamp(),
}, { merge: true });
```

Reject any `kind` not equal to `regular` or `casual`.

- [ ] **Step 3: Implement `updateSquadRsvpDefaults`**

Validate `totalPlayers >= 4`, `casualConfirmedSlots >= 0`, and `casualConfirmedSlots <= totalPlayers`. Write to `groups/{squadId}`:

```ts
rsvpDefaults: {
  totalPlayers,
  casualConfirmedSlots,
  waitlistEnabled,
  cutoffHoursBeforeStart: cutoffHoursBeforeStart ?? null,
}
```

- [ ] **Step 4: Add squad-page configuration controls**

In `groups/[groupId]/page.tsx`, in the `Manage` people view, add a `Regular/Casual` segmented control on each member row. Use `Regular` and `Casual` labels, not internal enum copy. Add a compact RSVP defaults form near the invite/management tools with these admin-editable fields:

```tsx
<input type="number" min={4} name="totalPlayers" aria-label="Total player capacity" />
<input type="number" min={0} name="casualConfirmedSlots" aria-label="Casual confirmed slots" />
<label>
  <input type="checkbox" name="waitlistEnabled" />
  Keep a casual waiting list
</label>
<input type="number" min={0} name="cutoffHoursBeforeStart" aria-label="RSVP cutoff hours before start" />
```

Label the section `Default RSVP capacity` and helper copy `New sessions start with these numbers. You can still adjust an individual session.`

- [ ] **Step 5: Verify**

Run:

```bash
node_modules\\.bin\\tsc.cmd -p apps\\web\\tsconfig.json --noEmit
```

Expected: PASS.

### Task 3: Session Capacity Snapshot

**Files:**
- Modify: `apps/web/src/server/sessions/actions.ts`
- Modify: `apps/web/src/lib/sessions/types.ts`
- Modify: `apps/web/src/app/(app)/sessions/new/page.tsx`
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/page.tsx`

**Interfaces:**
- Consumes: `groups/{squadId}.rsvpDefaults`.
- Produces session fields:
  - `rsvpCode: string`
  - `rsvpEnabled: boolean`
  - `rsvpCapacity.totalPlayers: number`
  - `rsvpCapacity.casualConfirmedSlots: number`
  - `rsvpCapacity.waitlistEnabled: boolean`
  - `rsvpCapacity.cutoffAt: Timestamp | null`

- [ ] **Step 1: Extend session types**

Add optional fields to `Session` in `apps/web/src/lib/sessions/types.ts`:

```ts
rsvpCode?: string;
rsvpEnabled?: boolean;
rsvpCapacity?: {
  totalPlayers: number;
  casualConfirmedSlots: number;
  waitlistEnabled: boolean;
  cutoffAt?: unknown | null;
};
```

- [ ] **Step 2: Copy defaults during session creation**

In `createSession`, read `groups/{squadId}` before writing the session. Generate a stable public `rsvpCode` using existing join-code style helpers or the same random-code pattern used for score/join links. Set `rsvpEnabled: true` and copy `rsvpDefaults` into `rsvpCapacity`.

- [ ] **Step 3: Add session capacity override controls**

On `sessions/[sessionId]/page.tsx`, add admin-only controls for total capacity, casual confirmed slots, waitlist enabled, cutoff time, and RSVP link copy. The heading must include the session name/date so the admin knows this setting is for this session. Use field labels:

- `Total player capacity`
- `Casual confirmed slots`
- `Casual waiting list`
- `RSVP cutoff`

Add helper copy: `These numbers apply only to this session.`

- [ ] **Step 4: Verify**

Run:

```bash
node_modules\\.bin\\tsc.cmd -p apps\\web\\tsconfig.json --noEmit
```

Expected: PASS.

### Task 4: Signed-In RSVP Uses Regular/Casual Model

**Files:**
- Modify: `apps/web/src/server/sessions/actions.ts`
- Modify: `apps/web/src/app/(app)/groups/[groupId]/page.tsx`
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `playerKind` from `groups/{groupId}/players/{uid}`.
- Produces signed-in RSVP statuses:
  - regular: `in` by default, `away` when user taps `I'm away`
  - casual: `casual_joined` when user opts in

- [ ] **Step 1: Change `rsvpToSession` input**

Allow statuses:

```ts
status: "in" | "away" | "casual_joined" | "removed"
```

Keep backward compatibility by mapping old `going` to `in` for regular players and `casual_joined` for casual players, and old `not_going` to `away` for regular players or `removed` for casual players.

- [ ] **Step 2: Stop adding all RSVP entries directly as active players**

Only confirmed players from the computed roster should become `sessions/{sessionId}/players` with `status: "active"`. Casual waiting entries must not be written as active session players.

- [ ] **Step 3: Add regular buttons**

For regular signed-in users, show `I'm away` by default and `I'm back in` when away.

- [ ] **Step 4: Add casual buttons**

For signed-in casuals, show `Join list` and `Remove me`. Show whether they are confirmed or waiting after bucket calculation.

- [ ] **Step 5: Verify**

Run:

```bash
node_modules\\.bin\\tsc.cmd -p apps\\web\\tsconfig.json --noEmit
```

Expected: PASS.

### Task 5: Public Session RSVP Page

**Files:**
- Create: `apps/web/src/server/sessions/rsvp-public.ts`
- Create: `apps/web/src/app/rsvp/[rsvpCode]/page.tsx`

**Interfaces:**
- Produces:
  - `getPublicRsvpRoster(rsvpCode: string): Promise<ActionResult<PublicRsvpRoster>>`
  - `joinPublicCasualRsvp(rsvpCode: string, displayName: string): Promise<ActionResult<void>>`
  - `removePublicCasualRsvp(rsvpCode: string, displayName: string): Promise<ActionResult<void>>`

- [ ] **Step 1: Define public roster DTO**

In `rsvp-public.ts`, define:

```ts
export interface PublicRsvpRoster {
  sessionId: string;
  sessionName: string;
  squadName: string;
  venueName: string;
  startsAtLabel: string;
  capacity: { totalPlayers: number; casualConfirmedSlots: number; waitlistEnabled: boolean };
  regularsIn: Array<{ displayName: string }>;
  regularsAway: Array<{ displayName: string }>;
  casualsConfirmed: Array<{ displayName: string; isPublic: boolean }>;
  casualsWaiting: Array<{ displayName: string; isPublic: boolean }>;
}
```

- [ ] **Step 2: Implement public lookup**

Lookup `sessions` by `rsvpCode` and `rsvpEnabled == true`. Read squad players and session RSVP entries, call `buildSessionRsvpBuckets`, and return display names only. Do not return email, phone, account IDs, or player IDs.

- [ ] **Step 3: Implement name-only join**

Normalize the submitted name with `normalizeCasualName`. Reject blank names and exact duplicate normalized names in that session. Write to `sessions/{sessionId}/rsvps/public_{hashOrAutoId}`:

```ts
{
  displayName,
  normalizedName,
  participantType: "public_casual",
  response: "casual_joined",
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
}
```

- [ ] **Step 4: Implement trust-based removal**

Find a public casual RSVP in that session by `normalizedName` and set:

```ts
{
  response: "removed",
  removedAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
}
```

- [ ] **Step 5: Build the page**

Create `/rsvp/[rsvpCode]` with:

- session heading: name, venue, date/time
- capacity summary
- four roster buckets
- display-name input
- `Join casual list`
- `Remove my name`

Use no-login language and display names only.

- [ ] **Step 6: Verify**

Run:

```bash
node_modules\\.bin\\tsc.cmd -p apps\\web\\tsconfig.json --noEmit
```

Expected: PASS.

### Task 6: Admin Override And Roster Sync

**Files:**
- Modify: `apps/web/src/server/sessions/actions.ts`
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/page.tsx`
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`

**Interfaces:**
- Produces:
  - `promoteCasualRsvp(sessionId: string, rsvpId: string): Promise<ActionResult<void>>`
  - `demoteCasualRsvp(sessionId: string, rsvpId: string): Promise<ActionResult<void>>`
  - `syncConfirmedRsvpsToSessionPlayers(sessionId: string): Promise<ActionResult<{ added: number; waiting: number }>>`

- [ ] **Step 1: Add override actions**

Admin-only actions set `adminOverride` on RSVP docs to `confirmed` or `waiting`.

- [ ] **Step 2: Add roster sync action**

Compute buckets and upsert only confirmed players into `sessions/{sessionId}/players`. Use `participantType: "registered_user"` for signed-in members and `participantType: "guest"` for public casuals. Set waitlisted casuals to `waiting` only if a session-player doc already exists; do not create active session-player docs for waitlisted casuals.

- [ ] **Step 3: Add admin buttons**

On session detail/live setup, show `Sync confirmed roster`, `Promote`, `Move to waiting`, and `Remove` controls for admins.

- [ ] **Step 4: Verify**

Run:

```bash
node_modules\\.bin\\tsc.cmd -p apps\\web\\tsconfig.json --noEmit
```

Expected: PASS.

## Self-Review

- Spec coverage: session-specific roster identity, admin-configurable capacity numbers, regular default-in behavior, casual opt-in, public name-only entry, duplicate blocking, trust-based removal, capacity buckets, admin overrides, and scheduling boundary are covered.
- Placeholder scan: no unfinished marker text or generic test instructions remain.
- Type consistency: `SquadPlayerKind`, `SessionRsvpCapacity`, `SessionRsvpEntry`, `buildSessionRsvpBuckets`, and public action names are used consistently.
- Known risk: trust-based name removal can remove another person with the same display name. Duplicate-name blocking reduces this risk for v1.
