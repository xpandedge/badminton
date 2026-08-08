# Plan: Team Member & Player Sync

**Generated**: 2026-06-18  
**Estimated Complexity**: Medium

## Overview

Three bugs, one root cause: `groups/{id}/members` and `groups/{id}/players` are two separate Firestore sub-collections that are never synced. When an owner adds a user by email (`addMemberToSquad`), it writes only to `members/` — so the Players tab stays empty forever. A separate freeform "Add Player" form exists that lets anyone add unlinked guest entries, violating the "signed-up users only" rule. The live-session player picker also uses free-form text inputs with no guard.

**Approach:**
1. Server action writes to both `members/` and `players/` in one transaction when a member is added.
2. Group page removes freeform "Add Player" form, replaces with a Members list derived from the members sub-collection.
3. Live session "Add Late Player" panel becomes a member picker (dropdown from group's player list).

---

## Prerequisites

- `apps/web/src/server/squads/actions.ts` — `addMemberToSquad` server action (the fix lands here)
- `apps/web/src/app/(app)/groups/[groupId]/page.tsx` — group detail page
- `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx` — live session page
- `apps/web/src/lib/players/players.ts` — `watchGroupPlayers` client watcher
- `apps/web/src/lib/groups/groups.ts` — `watchGroupMembers` client watcher (already exists)

---

## Sprint 1: Server — member addition auto-creates player doc

**Goal**: When a member is added via `addMemberToSquad`, a corresponding player doc is created in `groups/{groupId}/players/{userId}` in the same Firestore transaction.

**Demo/Validation**:
- Add a user by email to a squad; verify Firestore now has both `members/{uid}` and `players/{uid}` docs.
- The players/{uid} doc should have: `userId`, `displayName`, `email`, `isGuest: false`, `skillLevel: "unknown"`.
- Re-adding the same user (idempotent path) must not error — existing member check is already there.

### Task 1.1: Extend `addMemberToSquad` to write player doc

- **Location**: `apps/web/src/server/squads/actions.ts`
- **Description**:
  In the `runTransaction` that already writes `memberRef`, also write `groups/{squadId}/players/{targetUser.uid}` with the player's profile. Only write if the player doc doesn't already exist (`t.get()` check — use merge or conditional set).
  ```typescript
  const playerRef = db.doc(`groups/${squadId}/players/${targetUser.uid}`);
  const existingPlayer = await t.get(playerRef);
  if (!existingPlayer.exists) {
    t.set(playerRef, {
      userId: targetUser.uid,
      displayName: targetUser.displayName ?? targetUser.email?.split("@")[0] ?? "Player",
      email: targetUser.email ?? null,
      skillLevel: "unknown",
      isGuest: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  ```
- **Dependencies**: None
- **Acceptance Criteria**:
  - `addMemberToSquad` success → both `members/{uid}` and `players/{uid}` exist in Firestore.
  - Idempotent: calling again for the same user returns `ok()` without error (existing member guard fires first).
  - `players/{uid}.isGuest === false`, `userId` is populated.
- **Validation**: Test with Firebase emulator; check both sub-collections after adding.

---

## Sprint 2: Group page — remove freeform form, show real members list

**Goal**: The group page shows who's on the team (from `members/` sub-collection) and removes the freeform "Add Player" form. Adding a member is the only path to the player roster.

**Demo/Validation**:
- Group page → Players tab → shows list of members with name, email, role badge.
- "Add Player" form is gone.
- "Add Team Member" form still works (adds by email).
- After adding a member, they appear immediately in the list (via `watchGroupMembers` real-time).

### Task 2.1: Replace player watcher with member watcher in group page

- **Location**: `apps/web/src/app/(app)/groups/[groupId]/page.tsx`
- **Description**:
  - Remove `watchGroupPlayers` import and usage.
  - Replace `players` state with a members state using `watchGroupMembers` from `@/lib/groups/groups`.
  - The `GroupMember` type from `@picklebaddies/domain` has `userId`, `role`.
  - Cross-reference with `groups/{groupId}/players/{userId}` for `displayName` + `email`, OR just read those from the member doc (the server action writes displayName/email onto the member doc already — `addMemberToSquad` does this).
  - **Simplest approach**: fetch both `members/` and `players/` — join by `userId`. Members give role; players give displayName, email, skillLevel.
  - **Better approach**: Since `addMemberToSquad` already stores `displayName` and `email` on the member doc, just watch members and show those fields.
- **Dependencies**: Task 1.1 (member doc now has displayName/email)
- **Acceptance Criteria**:
  - Players tab shows a card per member: avatar initial, displayName, email, role badge.
  - Count in header stat reflects `members.length`.
  - Real-time: adding a member updates the list without page refresh.

### Task 2.2: Remove freeform "Add Player" section from group page

- **Location**: `apps/web/src/app/(app)/groups/[groupId]/page.tsx`
- **Description**:
  - Delete the "Add Player" form section (the `<section>` containing the `handleAddPlayer` form with playerName/playerEmail/playerSkill inputs).
  - Remove associated state: `playerName`, `playerEmail`, `playerSkill`, `duplicateWarning`.
  - Remove `handleAddPlayer` function.
  - Remove imports: `addPlayer` from `@/lib/players/players`, `findDuplicatePlayers`, `SKILL_LEVELS`, `SkillLevel`.
  - Keep `addPlayer` lib function itself (still used by other code paths if any — check first).
- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - No freeform player add form visible on the group page.
  - TypeScript compiles without errors after removals.
  - `addPlayer` lib function: keep if used elsewhere, delete if unused.
- **Validation**: `pnpm --filter @picklebaddies/web exec tsc --noEmit`

### Task 2.3: Rename "Players" tab to "Members" and update header stat

- **Location**: `apps/web/src/app/(app)/groups/[groupId]/page.tsx`
- **Description**:
  - Tab label: "Players" → "Members".
  - Header stats: "Players" count stat → "Members" count sourced from `members.length`.
  - Members list card: show role badge (owner=volt, organiser=ink, member=ghost style) next to name.
  - "Add Team Member" section header stays the same; subtitle already says "User must have signed up first."
- **Dependencies**: Task 2.1, 2.2
- **Acceptance Criteria**:
  - Tab says "Members", not "Players".
  - Each member card shows their role badge.
  - Owner sees the "Add Team Member" form; members see read-only list.

---

## Sprint 3: Live session — member picker for "Add Late Player"

**Goal**: The live session page's "Add Late Player" panel shows a dropdown of the group's players (registered users) instead of free-form text inputs.

**Demo/Validation**:
- Open a live session → "Add Player" panel → dropdown is populated with group members.
- Selecting a member fills in their name automatically; no manual playerId entry needed.
- Clicking "Add" calls `addLatePlayer` with the correct playerId and displayName.

### Task 3.1: Load group players in live session page

- **Location**: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`
- **Description**:
  - The page already reads `session.groupId`. Use `watchGroupPlayers(session.groupId, ...)` (already watches `groups/{id}/players`).
  - Store as `groupPlayers` state: `Array<{id: string; userId: string; displayName: string; skillLevel: string}>`.
  - Only load after `session` state is populated (groupId is available).
  - Filter out players already in the session (compare against `players.map(p => p.playerId)`).
- **Dependencies**: Sprint 1 (group players now populated for real users)
- **Acceptance Criteria**:
  - `groupPlayers` state is populated with group members who are registered users.
  - No extra Firestore reads before `session.groupId` is available.

### Task 3.2: Replace freeform Add-Player inputs with a select picker

- **Location**: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`
- **Description**:
  - Replace the two text inputs (`addPlayerId`, `addPlayerName`) with a single `<select>` dropdown.
  - `<option value="">Pick a player…</option>` + one option per `groupPlayers` entry: `value={p.id}` (the Firestore doc id, used as playerId), label = displayName.
  - On selection change: set `addPlayerId = selected.id`, `addPlayerName = selected.displayName`.
  - Remove manual state for `addPlayerName` and `addPlayerId` text inputs; replace with a single `selectedGroupPlayerId` state.
  - If `groupPlayers` is empty: show "No available players — add members to the team first."
  - Keep the "Add" button; it still calls `addLatePlayer({ sessionId, playerId, displayName })`.
- **Dependencies**: Task 3.1
- **Acceptance Criteria**:
  - No free-form text inputs for player selection.
  - Only group members (registered users) appear in the picker.
  - Players already in the session are excluded from the picker.
  - Adding a player from the picker calls `addLatePlayer` correctly.
- **Validation**: Manual test — add a group member to a live session via the picker.

---

## Testing Strategy

- **Sprint 1**: Firebase emulator — add member → inspect both `members/` and `players/` docs in emulator UI.
- **Sprint 2**: Visual — group page shows members list, no freeform form. TypeScript typecheck passes.
- **Sprint 3**: Manual — open live session, confirm picker shows group members, add one, confirm they appear in the active players list.
- **Regression**: Existing session flow (create session, generate schedule, score) unaffected.

---

## Potential Risks & Gotchas

1. **`addMemberToSquad` already has an idempotent check** — it returns `ok()` early if the member doc already exists. The player doc write only happens in the non-idempotent branch (new member path). Existing members added before this fix won't automatically get player docs. Consider a one-time backfill or accept that only newly-added members get player docs.

2. **`watchGroupMembers` returns `GroupMember[]`** which has `userId` and `role` but may not have `displayName`/`email` — these fields are on the member doc only if `addMemberToSquad` wrote them. Verify the member doc shape includes those fields. The server action does write `displayName` and `email` to the member doc.

3. **`addPlayer` client lib** — it writes directly to `groups/{id}/players` using the client SDK. If this is used elsewhere (e.g., a future import), removing it from the group page won't break things. But it's a client-side write to a collection that should be server-only. Post-plan: consider migrating it to a server action and tightening Firestore rules.

4. **Session "players" vs "group players"**: `sessions/{id}/players/{playerId}` uses the group player doc id as the playerId. The live page currently expects a freeform `playerId` string. With Task 3.2, we use the Firestore doc id from `groups/{id}/players/{docId}` — this should match.

5. **Members who existed before Sprint 1** won't have player docs. If the group page now reads from `watchGroupMembers` (Task 2.1), this doesn't matter for the members list. But if the session player picker reads from `watchGroupPlayers`, pre-existing members won't show up. Mitigation: use `watchGroupMembers` as the source for the session picker too (or add a backfill script).

---

## Rollback Plan

- Sprint 1: Revert the transaction addition in `addMemberToSquad`. No data is lost (the new player docs can stay).
- Sprint 2: Restore the freeform form from git history.
- Sprint 3: Restore the two text inputs from git history.
