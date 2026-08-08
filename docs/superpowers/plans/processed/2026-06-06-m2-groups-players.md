# M2: Groups + Players Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner can create a group, add other members (owner/organiser/member), add manual + guest players with skill levels, and set up venues with court entities — all gated by the M1 permission predicates and enforced by Firestore rules.

**Architecture:** New `groups` and `players` service modules in `apps/web/src/lib` own all reads/writes. A `useGroupRole(groupId)` hook subscribes to `groups/{id}/members` and feeds membership into the pure `resolveGroupRole` from `@picklebaddies/domain`, so the UI gates actions with the same predicates Cloud Functions will use. Venues own real **court entities** (DELTA_SPEC D2) — sessions later snapshot these, not a bare count. Duplicate-player detection is a pure, tested helper.

**Tech Stack:** Next.js 15, Firebase Firestore (modular SDK), `@picklebaddies/domain`, Vitest, `@firebase/rules-unit-testing`.

**Prerequisites:** M1 processed (auth + `@picklebaddies/domain` roles/predicates + AuthProvider + protected routes + rules-test harness).

**PRD refs:** §12.2, §12.3, §15.2–15.6, §19.2–19.3. **DELTA_SPEC:** D5 (member roles), D2 (court entities live under venues).

---

## File Structure

`apps/web/src/lib/groups/`
- `types.ts` — `Group`, `GroupMemberDoc`, `Venue`, `Court` document types.
- `groups.ts` — `createGroup`, `getGroup`, `watchGroupMembers`, `addMember`, `removeMember`.
- `venues.ts` — `addVenue`, `watchVenues`, `addCourt`, `setCourtActive`, `watchCourts`.
- `useGroupRole.ts` — hook: members snapshot → `resolveGroupRole`.

`apps/web/src/lib/players/`
- `types.ts` — `GroupPlayer`, `SkillLevel` (re-export from domain), `NewPlayerInput`.
- `players.ts` — `addPlayer`, `watchGroupPlayers`, `updatePlayer`.
- `duplicate.ts` — `findDuplicatePlayers` (pure).
- `duplicate.test.ts`

`apps/web/src/app/(app)/groups/`
- `page.tsx` — list + create group.
- `[groupId]/page.tsx` — group detail: members, players, venues.

Move `SkillLevel` to shared domain:
- `packages/domain/src/skill.ts` — `SkillLevel` type + `SKILL_LEVELS` array. (Engine already has its own `SKILL_VALUE`; keep numeric mapping in the engine, the string enum in domain, and have the engine import the type from domain in M4 — for now duplicate-free by exporting the type from domain and re-using.)
- `packages/domain/src/index.ts` — export skill.

`firestore.rules` — **modify**: groups + subcollections.
`apps/web/firestore.groups.rules.test.ts` — rules tests.

---

## Task 1: Skill level in shared domain

**Files:** Create `packages/domain/src/skill.ts`, `packages/domain/src/skill.test.ts`; modify `packages/domain/src/index.ts`.

- [ ] **Step 1: Failing test** — `packages/domain/src/skill.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { SKILL_LEVELS, isSkillLevel } from "./skill.js";

describe("skill levels", () => {
  it("lists the four MVP levels in order", () => {
    expect(SKILL_LEVELS).toEqual(["unknown", "beginner", "intermediate", "advanced"]);
  });
  it("validates known/unknown values", () => {
    expect(isSkillLevel("advanced")).toBe(true);
    expect(isSkillLevel("pro")).toBe(false);
  });
});
```
- [ ] **Step 2: Run** `pnpm --filter @picklebaddies/domain test` → FAIL.
- [ ] **Step 3: Implement** `packages/domain/src/skill.ts`:
```typescript
export type SkillLevel = "unknown" | "beginner" | "intermediate" | "advanced";

export const SKILL_LEVELS: readonly SkillLevel[] = [
  "unknown",
  "beginner",
  "intermediate",
  "advanced",
];

export function isSkillLevel(value: string): value is SkillLevel {
  return (SKILL_LEVELS as readonly string[]).includes(value);
}
```
Add to `packages/domain/src/index.ts`: `export * from "./skill.js";`
- [ ] **Step 4: Run** test → PASS.
- [ ] **Step 5: Commit** `feat(domain): SkillLevel enum + guard`.

---

## Task 2: Duplicate-player detection (pure, TDD)

Implements PRD §12.3 "Duplicate warning for similar name or same email within a group".

**Files:** Create `apps/web/src/lib/players/duplicate.ts`, `apps/web/src/lib/players/duplicate.test.ts`.

- [ ] **Step 1: Failing test** — `duplicate.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { findDuplicatePlayers } from "./duplicate.js";

const existing = [
  { id: "a", displayName: "Ravi Kumar", email: "ravi@x.com" },
  { id: "b", displayName: "Anita", email: null },
];

describe("findDuplicatePlayers", () => {
  it("flags exact email match (case-insensitive)", () => {
    const hits = findDuplicatePlayers(existing, { displayName: "R K", email: "RAVI@x.com" });
    expect(hits.map((h) => h.id)).toEqual(["a"]);
  });
  it("flags near-identical name (case/whitespace-insensitive)", () => {
    const hits = findDuplicatePlayers(existing, { displayName: "  ravi   kumar ", email: null });
    expect(hits.map((h) => h.id)).toEqual(["a"]);
  });
  it("returns empty when clearly new", () => {
    expect(findDuplicatePlayers(existing, { displayName: "Priya", email: "p@x.com" })).toEqual([]);
  });
});
```
- [ ] **Step 2: Run** `pnpm --filter @picklebaddies/web test` → FAIL.
- [ ] **Step 3: Implement** `duplicate.ts`:
```typescript
export interface ExistingPlayer { id: string; displayName: string; email: string | null; }
export interface CandidatePlayer { displayName: string; email: string | null; }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function findDuplicatePlayers(
  existing: ExistingPlayer[],
  candidate: CandidatePlayer,
): ExistingPlayer[] {
  const candName = norm(candidate.displayName);
  const candEmail = candidate.email ? candidate.email.trim().toLowerCase() : null;
  return existing.filter((p) => {
    const emailHit = candEmail !== null && p.email !== null && p.email.toLowerCase() === candEmail;
    const nameHit = norm(p.displayName) === candName;
    return emailHit || nameHit;
  });
}
```
- [ ] **Step 4: Run** test → PASS.
- [ ] **Step 5: Commit** `feat(web): findDuplicatePlayers helper with tests`.

---

## Task 3: Group document types + service

**Files:** Create `apps/web/src/lib/groups/types.ts`, `apps/web/src/lib/groups/groups.ts`.

- [ ] **Step 1: Types** — `groups/types.ts`:
```typescript
import type { GroupRole, SkillLevel } from "@picklebaddies/domain";

export interface Group { name: string; description: string | null; createdBy: string; }
export interface GroupMemberDoc { userId: string; role: GroupRole; }
export interface Venue { name: string; address: string | null; }
export interface Court { name: string; courtNumber: number; isActive: boolean; }
export type { GroupRole, SkillLevel };
```
- [ ] **Step 2: Service** — `groups/groups.ts` (signatures, all writes via service layer per §17):
```typescript
import {
  addDoc, collection, doc, getDoc, onSnapshot, serverTimestamp,
  setDoc, deleteDoc, query,
} from "firebase/firestore";
import { getFirebaseServices } from "@/lib/firebase/client";
import { resolveGroupRole, type GroupMember } from "@picklebaddies/domain";
import type { Group, GroupMemberDoc } from "./types";

/** Creates the group and writes the creator as owner (PRD §12.2). */
export async function createGroup(input: { name: string; description?: string }): Promise<string> {
  const { db, auth } = getFirebaseServices();
  const uid = auth.currentUser!.uid;
  const ref = await addDoc(collection(db, "groups"), {
    name: input.name,
    description: input.description ?? null,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, `groups/${ref.id}/members/${uid}`), {
    userId: uid, role: "owner", createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function watchGroupMembers(
  groupId: string, cb: (members: GroupMember[]) => void,
): () => void {
  const { db } = getFirebaseServices();
  return onSnapshot(query(collection(db, `groups/${groupId}/members`)), (snap) => {
    cb(snap.docs.map((d) => d.data() as GroupMember));
  });
}

export async function addMember(groupId: string, userId: string, role: GroupMemberDoc["role"]): Promise<void> {
  const { db } = getFirebaseServices();
  await setDoc(doc(db, `groups/${groupId}/members/${userId}`), {
    userId, role, createdAt: serverTimestamp(),
  });
}
export async function removeMember(groupId: string, userId: string): Promise<void> {
  const { db } = getFirebaseServices();
  await deleteDoc(doc(db, `groups/${groupId}/members/${userId}`));
}
```
- [ ] **Step 3: Verify** `pnpm --filter @picklebaddies/web typecheck` → 0.
- [ ] **Step 4: Commit** `feat(web): groups service (create/members)`.

---

## Task 4: `useGroupRole` hook

**Files:** Create `apps/web/src/lib/groups/useGroupRole.ts`.

- [ ] **Step 1: Implement**:
```typescript
"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import { watchGroupMembers } from "./groups";
import { resolveGroupRole, type GroupRole } from "@picklebaddies/domain";

export function useGroupRole(groupId: string | null): GroupRole | null {
  const { user } = useAuth();
  const [role, setRole] = useState<GroupRole | null>(null);
  useEffect(() => {
    if (!groupId || !user) { setRole(null); return; }
    return watchGroupMembers(groupId, (members) => setRole(resolveGroupRole(members, user.uid)));
  }, [groupId, user]);
  return role;
}
```
- [ ] **Step 2: Verify** typecheck → 0.
- [ ] **Step 3: Commit** `feat(web): useGroupRole hook`.

---

## Task 5: Players service + venues/courts service (D2)

**Files:** Create `apps/web/src/lib/players/types.ts`, `players/players.ts`, `apps/web/src/lib/groups/venues.ts`.

- [ ] **Step 1: Players service** — `players/players.ts`:
```typescript
import { addDoc, collection, onSnapshot, query, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { getFirebaseServices } from "@/lib/firebase/client";
import type { SkillLevel } from "@picklebaddies/domain";

export interface NewPlayerInput {
  displayName: string; email?: string | null; phone?: string | null;
  skillLevel?: SkillLevel; isGuest?: boolean;
}

export async function addPlayer(groupId: string, input: NewPlayerInput): Promise<string> {
  const { db } = getFirebaseServices();
  const ref = await addDoc(collection(db, `groups/${groupId}/players`), {
    userId: null,
    displayName: input.displayName,
    email: input.email ?? null,
    phone: input.phone ?? null,
    skillLevel: input.skillLevel ?? "unknown",
    isGuest: input.isGuest ?? true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function watchGroupPlayers(groupId: string, cb: (players: Array<{ id: string } & Record<string, unknown>>) => void): () => void {
  const { db } = getFirebaseServices();
  return onSnapshot(query(collection(db, `groups/${groupId}/players`)), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
```
- [ ] **Step 2: Venues/courts service** (DELTA_SPEC D2 — courts are entities) — `groups/venues.ts`:
```typescript
import { addDoc, collection, onSnapshot, query, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { getFirebaseServices } from "@/lib/firebase/client";

export async function addVenue(groupId: string, name: string, address?: string): Promise<string> {
  const { db } = getFirebaseServices();
  const ref = await addDoc(collection(db, `groups/${groupId}/venues`), {
    name, address: address ?? null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function addCourt(groupId: string, venueId: string, name: string, courtNumber: number): Promise<string> {
  const { db } = getFirebaseServices();
  const ref = await addDoc(collection(db, `groups/${groupId}/venues/${venueId}/courts`), {
    name, courtNumber, isActive: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function setCourtActive(groupId: string, venueId: string, courtId: string, isActive: boolean): Promise<void> {
  const { db } = getFirebaseServices();
  await updateDoc(doc(db, `groups/${groupId}/venues/${venueId}/courts/${courtId}`), { isActive, updatedAt: serverTimestamp() });
}

export function watchCourts(groupId: string, venueId: string, cb: (courts: Array<{ id: string } & Record<string, unknown>>) => void): () => void {
  const { db } = getFirebaseServices();
  return onSnapshot(query(collection(db, `groups/${groupId}/venues/${venueId}/courts`)), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
```
- [ ] **Step 3: Verify** typecheck → 0.
- [ ] **Step 4: Commit** `feat(web): players + venues/courts services (D2 court entities)`.

---

## Task 6: Group UI (list/create + detail with members/players/venues)

**Files:** Create `apps/web/src/app/(app)/groups/page.tsx`, `apps/web/src/app/(app)/groups/[groupId]/page.tsx`.

- [ ] **Step 1:** Build `groups/page.tsx` — list groups the user is a member of + a create form calling `createGroup`, then `router.push(/groups/{id})`.
- [ ] **Step 2:** Build `[groupId]/page.tsx` — uses `useGroupRole(groupId)`; gate "Add member" / "Add player" / "Add venue/court" buttons with `canManageGroup` / `canManageSessionPlayers` from `@picklebaddies/domain`. Player add form runs `findDuplicatePlayers` against `watchGroupPlayers` results and shows a warning before confirming. Skill select uses `SKILL_LEVELS`.
- [ ] **Step 3: Verify** `pnpm --filter @picklebaddies/web build` → routes `/groups`, `/groups/[groupId]` listed, compiled.
- [ ] **Step 4: Commit** `feat(web): group list + detail UI with role-gated actions`.

---

## Task 7: Firestore rules for groups + tests

**Files:** Modify `firestore.rules`; create `apps/web/firestore.groups.rules.test.ts`.

- [ ] **Step 1:** Replace the catch-all deny with group rules:
```
match /groups/{groupId} {
  function memberRole() {
    return get(/databases/$(database)/documents/groups/$(groupId)/members/$(request.auth.uid)).data.role;
  }
  function isMember() {
    return request.auth != null &&
      exists(/databases/$(database)/documents/groups/$(groupId)/members/$(request.auth.uid));
  }
  function isOwner() { return isMember() && memberRole() == "owner"; }
  function isOrganiserOrAbove() { return isMember() && (memberRole() == "owner" || memberRole() == "organiser"); }

  allow read: if isMember();
  allow create: if request.auth != null && request.resource.data.createdBy == request.auth.uid;
  allow update, delete: if isOwner();

  match /members/{memberId} {
    allow read: if isMember();
    allow write: if isOwner();
  }
  match /players/{playerId} {
    allow read: if isMember();
    allow write: if isOrganiserOrAbove();
  }
  match /venues/{venueId} {
    allow read: if isMember();
    allow write: if isOrganiserOrAbove();
    match /courts/{courtId} {
      allow read: if isMember();
      allow write: if isOrganiserOrAbove();
    }
  }
}
```
Keep the final `match /{document=**} { allow read, write: if false; }`.
- [ ] **Step 2:** Write `firestore.groups.rules.test.ts` (mirrors M1 harness) covering: owner can create group + write members; organiser can write players but not members; member can read but not write players; non-member denied all. Seed initial member docs with `env.withSecurityRulesDisabled`.
- [ ] **Step 3: Run** `pnpm --filter @picklebaddies/web test:rules` → PASS.
- [ ] **Step 4: Commit** `feat(rules): group/member/player/venue access + tests`.

---

## Task 8: Verification + processed

- [ ] **Step 1:** `pnpm -r test` → all green (domain incl. skill, web pure incl. duplicate).
- [ ] **Step 2:** `pnpm -r typecheck` → 0.
- [ ] **Step 3:** `pnpm --filter @picklebaddies/web test:rules` → PASS.
- [ ] **Step 4:** Manual (emulators): create group → add organiser → add 8 players (trigger a duplicate warning) → add venue with 3 courts → toggle a court inactive. Confirm a non-owner cannot add members.
- [ ] **Step 5: Commit** `chore(m2): verification pass`.
- [ ] **Step 6: Mark processed**:
```bash
git mv docs/superpowers/plans/2026-06-06-m2-groups-players.md docs/superpowers/plans/processed/2026-06-06-m2-groups-players.md
git commit -m "chore(plans): mark M2 processed"
```

---

## Self-Review (acceptance mapping)

- §12.2 create group / creator=owner / add organisers / reuse players → Tasks 3, 6, 7. ✅
- §12.3 add player (name/email/phone/skill), guest without account, duplicate warning → Tasks 2, 5, 6. ✅
- D2 court entities under venues → Task 5. ✅
- D5 role-gated writes (UI + rules) → Tasks 4, 6, 7. ✅
- §19.2–19.3 group-member read / organiser writes → Task 7. ✅

**Deferred:** sessions consume venues/courts in M3; member *invite by email lookup* (vs known uid) is a Phase-2 nicety — M2 adds members by uid only; note in UI.
