# M3: Session Creation + Join Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An organiser can create a draft session (sport, venue, **court snapshot**, duration, game length, **scoring mode**), add session players from the group, generate a join code, and approve people who request to join via that code — without anyone but the server writing session-player docs.

**Architecture:** Session creation snapshots the venue's active **court entities** into the session doc as `courts[]` (DELTA_SPEC D2) — never a bare count. Scoring mode is a first-class enum on the session (DELTA_SPEC D1) consumed by scoring/leaderboard in M5. The join flow goes entirely through a `requestJoin` Cloud Function writing to `joinRequests` (DELTA_SPEC D6) — public clients never write `sessions/{id}/players`; organiser approval (a function) promotes a request into a player doc.

**Tech Stack:** Next.js 15, Firestore, Firebase Cloud Functions (callable), `@picklebaddies/domain`, Vitest, rules-unit-testing.

**Prerequisites:** M2 processed (groups, players, venues/courts, role gating, group rules).

**PRD refs:** §12.4, §12.5, §13 (session/player statuses), §15.7–15.8, §19.8. **DELTA_SPEC:** D1 (scoring mode), D2 (court snapshot), D5 (roles), D6 (join via function), D7 (player status semantics).

---

## File Structure

`packages/domain/src/`
- `scoring.ts` — `ScoringMode` type, `SCORING_MODES`. (Logic added in M5; type defined here.)
- `session-status.ts` — `SessionStatus`, `MatchStatus`, `SessionPlayerStatus` enums + `SCHEDULABLE_STATUSES` (D7).
- `join-code.ts` — `generateJoinCode` (pure, seedable) + `normalizeJoinCode`.
- `*.test.ts` for each.

`apps/web/src/lib/sessions/`
- `types.ts` — `Session`, `SessionCourt`, `SessionPlayer`.
- `sessions.ts` — `createSession`, `getSession`, `watchSession`, `updateSessionDraft`, `addSessionPlayer`, `watchSessionPlayers`.
- `join.ts` — client callers for the `requestJoin` / `approveJoinRequest` functions + `watchJoinRequests`.

`functions/src/`
- `lib/auth.ts` — `requireGroupRole(uid, groupId, predicate)` server-side check (DELTA_SPEC D5 / §19.9).
- `lib/rateLimit.ts` — minimal per-code request limiter.
- `join.ts` — `requestJoin`, `approveJoinRequest`, `rejectJoinRequest` callables (DELTA_SPEC D6).
- `index.ts` — **modify**: export join callables.

`apps/web/src/app/(app)/sessions/`
- `new/page.tsx` — create-session wizard.
- `[sessionId]/page.tsx` — session detail (draft): players, join code, requests.

`apps/web/src/app/join/[code]/page.tsx` — public join landing (DELTA_SPEC D6, §12.1 openable before sign-in).

`firestore.rules` — **modify**: sessions, session players (function/organiser-write only), joinRequests (narrow).
`apps/web/firestore.sessions.rules.test.ts` — rules tests.

---

## Task 1: Session/scoring/status enums in domain (TDD)

**Files:** Create `packages/domain/src/scoring.ts`, `session-status.ts`, and tests; modify `index.ts`.

- [ ] **Step 1: Failing test** — `session-status.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { SCHEDULABLE_STATUSES, isSchedulable } from "./session-status.js";

describe("schedulable player statuses (DELTA_SPEC D7)", () => {
  it("only checked_in/active players are schedulable", () => {
    expect(isSchedulable("active")).toBe(true);
    expect(isSchedulable("checked_in")).toBe(true);
  });
  it("waiting/left/removed/no_show are NOT scheduled into future rounds", () => {
    for (const s of ["waiting", "left", "removed", "no_show", "invited", "registered"] as const) {
      expect(isSchedulable(s)).toBe(false);
    }
  });
  it("exposes the schedulable set", () => {
    expect([...SCHEDULABLE_STATUSES].sort()).toEqual(["active", "checked_in"]);
  });
});
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `session-status.ts`:
```typescript
export type SessionStatus = "draft" | "scheduled" | "active" | "paused" | "completed" | "cancelled";
export type MatchStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type SessionPlayerStatus =
  | "invited" | "registered" | "checked_in" | "active" | "waiting" | "left" | "removed" | "no_show";

/** DELTA_SPEC D7: present + available. Per-round play/sit is derived, not stored. */
export const SCHEDULABLE_STATUSES: ReadonlySet<SessionPlayerStatus> = new Set(["checked_in", "active"]);
export function isSchedulable(status: SessionPlayerStatus): boolean {
  return SCHEDULABLE_STATUSES.has(status);
}
```
And `scoring.ts`:
```typescript
export type ScoringMode = "winner_only" | "points";
export const SCORING_MODES: readonly ScoringMode[] = ["winner_only", "points"];
```
Export both from `index.ts`.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(domain): session/match/player status + scoring enums (D1/D7)`.

---

## Task 2: Join-code generation (pure, TDD)

**Files:** Create `packages/domain/src/join-code.ts`, `join-code.test.ts`; modify `index.ts`.

- [ ] **Step 1: Failing test**:
```typescript
import { describe, it, expect } from "vitest";
import { generateJoinCode, normalizeJoinCode } from "./join-code.js";

describe("join codes", () => {
  it("is deterministic given a seed and 6 unambiguous chars", () => {
    const code = generateJoinCode(() => 0.5);
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
    expect(generateJoinCode(() => 0.5)).toBe(code);
  });
  it("normalizes user input (uppercase, trims, strips spaces)", () => {
    expect(normalizeJoinCode("  ab c12 ")).toBe("ABC12");
  });
});
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `join-code.ts`:
```typescript
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I
export function generateJoinCode(rng: () => number = Math.random, length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return out;
}
export function normalizeJoinCode(input: string): string {
  return input.toUpperCase().replace(/\s+/g, "");
}
```
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(domain): join-code generator + normalizer`.

---

## Task 3: Session service + court snapshot (D2)

**Files:** Create `apps/web/src/lib/sessions/types.ts`, `sessions.ts`.

- [ ] **Step 1: Types** — `sessions/types.ts`:
```typescript
import type { ScoringMode, SessionStatus, SessionPlayerStatus, SkillLevel } from "@picklebaddies/domain";

export interface SessionCourt { courtId: string; name: string; courtNumber: number; isActive: boolean; }

export interface Session {
  groupId: string; venueId: string; name: string;
  sport: "badminton" | "pickleball";
  status: SessionStatus;
  startsAt: unknown; durationMinutes: number; estimatedGameMinutes: number;
  courts: SessionCourt[];            // DELTA_SPEC D2 snapshot (replaces numberOfCourts)
  courtCount: number;                // derived: count of isActive courts
  scoringMode: ScoringMode;          // DELTA_SPEC D1
  createdBy: string; currentRoundNumber: number;
  joinCode: string; joinEnabled: boolean;
}

export interface SessionPlayer {
  playerId: string; displayName: string; skillLevel: SkillLevel; status: SessionPlayerStatus;
  participantType: "registered_user" | "guest"; // DELTA_SPEC D5 axis B
  gamesPlayed: number; wins: number; losses: number;
  pointsFor: number; pointsAgainst: number; sitOutCount: number;
}
```
- [ ] **Step 2: createSession** — snapshots active courts from the chosen venue:
```typescript
import { addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, where, onSnapshot } from "firebase/firestore";
import { getFirebaseServices } from "@/lib/firebase/client";
import { generateJoinCode } from "@picklebaddies/domain";
import type { Session, SessionCourt } from "./types";

export interface CreateSessionInput {
  groupId: string; venueId: string; name: string;
  sport: "badminton" | "pickleball";
  startsAt: Date; durationMinutes: number; estimatedGameMinutes: number;
  scoringMode: "winner_only" | "points";
}

export async function createSession(input: CreateSessionInput): Promise<string> {
  const { db, auth } = getFirebaseServices();
  const uid = auth.currentUser!.uid;
  // D2: snapshot the venue's active courts into the session.
  const courtSnap = await getDocs(collection(db, `groups/${input.groupId}/venues/${input.venueId}/courts`));
  const courts: SessionCourt[] = courtSnap.docs
    .map((d) => ({ courtId: d.id, ...(d.data() as Omit<SessionCourt, "courtId">) }))
    .filter((c) => c.isActive)
    .sort((a, b) => a.courtNumber - b.courtNumber);

  const ref = await addDoc(collection(db, "sessions"), {
    groupId: input.groupId, venueId: input.venueId, name: input.name, sport: input.sport,
    status: "draft",
    startsAt: input.startsAt, durationMinutes: input.durationMinutes,
    estimatedGameMinutes: input.estimatedGameMinutes,
    courts, courtCount: courts.length,
    scoringMode: input.scoringMode,
    createdBy: uid, currentRoundNumber: 0,
    joinCode: generateJoinCode(), joinEnabled: true,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function watchSession(sessionId: string, cb: (s: (Session & { id: string }) | null) => void): () => void {
  const { db } = getFirebaseServices();
  return onSnapshot(doc(db, `sessions/${sessionId}`), (snap) =>
    cb(snap.exists() ? ({ id: snap.id, ...(snap.data() as Session) }) : null));
}
```
- [ ] **Step 3: addSessionPlayer / watchSessionPlayers** — organiser adds a known group player into `sessions/{id}/players` with cached `displayName`+`skillLevel` (PRD §15.8 caching) and `status: "registered"`, `participantType: "registered_user"`.
- [ ] **Step 4: Verify** typecheck → 0. **Step 5: Commit** `feat(web): session service with court snapshot (D2) + scoring mode (D1)`.

---

## Task 4: Server-side role guard (functions)

**Files:** Create `functions/src/lib/auth.ts`.

- [ ] **Step 1: Implement** the reusable guard (DELTA_SPEC D5 / §19.9):
```typescript
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { resolveGroupRole, type GroupRole } from "@picklebaddies/domain";

/** Loads the caller's group role and asserts the predicate, else throws permission-denied. */
export async function requireGroupRole(
  uid: string, groupId: string, predicate: (role: GroupRole | null) => boolean,
): Promise<GroupRole> {
  const db = getFirestore();
  const snap = await db.collection(`groups/${groupId}/members`).get();
  const members = snap.docs.map((d) => d.data() as { userId: string; role: GroupRole });
  const role = resolveGroupRole(members, uid);
  if (!predicate(role)) throw new HttpsError("permission-denied", "Insufficient role");
  return role!;
}
```
- [ ] **Step 2: Verify** `pnpm --filter @picklebaddies/functions typecheck` → 0. **Step 3: Commit** `feat(functions): requireGroupRole server guard`.

---

## Task 5: Join flow Cloud Functions (D6)

**Files:** Create `functions/src/lib/rateLimit.ts`, `functions/src/join.ts`; modify `functions/src/index.ts`.

- [ ] **Step 1: requestJoin** (callable; auth optional for guests) — validates code + `joinEnabled`, rate-limits, writes a `joinRequests` doc; **never** writes `players`:
```typescript
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { normalizeJoinCode } from "@picklebaddies/domain";

export const requestJoin = onCall(async (req) => {
  const { joinCode, displayName, isGuest } = req.data as { joinCode: string; displayName: string; isGuest: boolean };
  const db = getFirestore();
  const code = normalizeJoinCode(joinCode);
  const q = await db.collection("sessions").where("joinCode", "==", code).where("joinEnabled", "==", true).limit(1).get();
  if (q.empty) throw new HttpsError("not-found", "Invalid or closed join code");
  const session = q.docs[0]!;
  const ref = await session.ref.collection("joinRequests").add({
    displayName, isGuest: !!isGuest, userId: req.auth?.uid ?? null,
    status: "pending", createdAt: FieldValue.serverTimestamp(),
  });
  return { sessionId: session.id, requestId: ref.id };
});
```
- [ ] **Step 2: approveJoinRequest / rejectJoinRequest** — organiser-only (`requireGroupRole(..., canManageSessionPlayers)` resolved via the session's `groupId`). Approve promotes the request into `sessions/{id}/players` (`status: "registered"`, cached name/skill, `participantType` from `isGuest`) in a transaction and sets the request `status: "approved"`.
- [ ] **Step 3: Export** from `index.ts`: `export { requestJoin, approveJoinRequest, rejectJoinRequest } from "./join.js";` (CommonJS build resolves `.js`).
- [ ] **Step 4: Verify** `pnpm --filter @picklebaddies/functions build` → 0. **Step 5: Commit** `feat(functions): join request + approve/reject (D6)`.

---

## Task 6: Session UI + public join page

**Files:** Create `apps/web/src/lib/sessions/join.ts`; `app/(app)/sessions/new/page.tsx`; `app/(app)/sessions/[sessionId]/page.tsx`; `app/join/[code]/page.tsx`.

- [ ] **Step 1: Client callers** — `sessions/join.ts` wraps `httpsCallable(functions, "requestJoin"|"approveJoinRequest"|"rejectJoinRequest")` and `watchJoinRequests(sessionId, cb)`.
- [ ] **Step 2: Create wizard** — `new/page.tsx`: gated by `canCreateSession(useGroupRole(groupId))`; fields per §12.4 with reasonable defaults (duration 120, game 15, scoring `points`); sport + venue + scoring selects; on submit `createSession` → push to detail.
- [ ] **Step 3: Detail (draft)** — `[sessionId]/page.tsx`: show players, join code/link, pending join requests with Approve/Reject (organiser only). Editable while `status === "draft"`.
- [ ] **Step 4: Public join** — `app/join/[code]/page.tsx`: openable signed-out (§12.1); collects display name; calls `requestJoin`; shows "request sent, waiting for organiser".
- [ ] **Step 5: Verify** `pnpm --filter @picklebaddies/web build` → routes listed, compiled. **Step 6: Commit** `feat(web): session wizard, draft detail, public join page`.

---

## Task 7: Firestore rules for sessions + joinRequests + tests

**Files:** Modify `firestore.rules`; create `apps/web/firestore.sessions.rules.test.ts`.

- [ ] **Step 1: Rules** — add a `sessions/{sessionId}` block:
  - `read`: group members OR a registered session player.
  - `create`/`update`: `isOrganiserOrAbove()` resolved against `request.resource.data.groupId` (helper reused).
  - `players/{spId}`: `read` group member/self; **`write: if false`** (only Cloud Functions via Admin SDK write — DELTA_SPEC D6 keeps §19.3 intact).
  - `joinRequests/{reqId}`: `create: if false` for clients (only `requestJoin` function writes); `read/update: if isOrganiserOrAbove()`.
- [ ] **Step 2: Tests** — `firestore.sessions.rules.test.ts`: organiser can create session; member can read; **client cannot write a player doc**; **client cannot create a joinRequest directly**; non-member cannot read.
- [ ] **Step 3: Run** `pnpm --filter @picklebaddies/web test:rules` → PASS. **Step 4: Commit** `feat(rules): session + joinRequest access (D6) + tests`.

---

## Task 8: Verification + processed

- [ ] **Step 1:** `pnpm -r test` (domain enums/join-code + web pure) → green.
- [ ] **Step 2:** `pnpm -r typecheck` → 0; `pnpm --filter @picklebaddies/functions build` → 0.
- [ ] **Step 3:** `pnpm --filter @picklebaddies/web test:rules` → PASS.
- [ ] **Step 4:** Manual (emulators incl. functions): create draft session (3 courts snapshotted, scoring=points) in <2 min → open join link in a private window → submit request → approve as organiser → player appears with `registered`.
- [ ] **Step 5: Commit** `chore(m3): verification pass`.
- [ ] **Step 6: Mark processed**:
```bash
git mv docs/superpowers/plans/2026-06-06-m3-session-creation.md docs/superpowers/plans/processed/2026-06-06-m3-session-creation.md
git commit -m "chore(plans): mark M3 processed"
```

---

## Self-Review (acceptance mapping)

- §12.4 required fields, <2 min, defaults, editable-before-start → Tasks 3, 6. ✅
- §12.5 join code/URL, request, approve/remove, appears in list, late joiners later → Tasks 5, 6 (late-round inclusion handled in M6). ✅
- §12.1 invite openable pre-sign-in → Task 6 public page. ✅
- D1 scoring mode enum on session → Task 1, 3. ✅
- D2 court snapshot → Task 3. ✅
- D6 join via function, no client player/joinRequest writes → Tasks 5, 7. ✅
- D7 player status semantics + schedulable set → Task 1. ✅

**Deferred:** check-in / status transitions and rebalance-on-join are M6; scoring-mode *behavior* (winner derivation, tie-break) is M5.
