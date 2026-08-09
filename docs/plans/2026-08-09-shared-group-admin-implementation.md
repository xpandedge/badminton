# Shared Group Administration Implementation Plan

## Outcome

Ship a consistent Owner / Admin / Member permission model across domain logic, server actions, Firestore rules, dashboard discovery, and group/session interfaces. Preserve legacy `organiser` records as admin-level without requiring a production data migration.

## Phase 1: Define And Test The Permission Matrix

**Files**

- Modify `packages/domain/src/roles.ts`
- Modify `packages/domain/src/roles.test.ts`
- Modify `apps/web/src/lib/groups/types.ts`

**Changes**

1. Add `admin` to the stored group-role type and retain `organiser` as a legacy value.
2. Add a normalization/display helper that treats `organiser` as `admin`.
3. Define explicit predicates instead of reusing ambiguous membership checks:
   - `canManageAdmins`: owner only.
   - `canManageGroup`: owner, admin, or legacy organiser.
   - `canManageMembers`: owner, admin, or legacy organiser.
   - `canCreateSession`, `canGenerateSchedule`, `canRebalanceSession`, `canManageSessionPlayers`, and `canAdvanceRound`: owner/admin level.
   - `canEnterScore`: every group member.
   - `canDeleteGroup` and `canTransferOwnership`: owner only.
4. Replace the old test assumption that every member can run sessions with table-driven tests for all four stored values plus `null`.

**Acceptance**

- A regular member cannot pass any group or session management predicate.
- A legacy organiser passes exactly the same predicates as a new admin.
- Score entry remains available to members.

## Phase 2: Secure Group Administration On The Server

**Files**

- Modify `apps/web/src/server/squads/actions.ts`
- Add focused tests beside the squad authorization logic, extracting pure policy helpers if needed.

**Changes**

1. Change new role assignments from `organiser` to `admin`.
2. Add `updateMemberRole(squadId, memberId, role)`:
   - Only the owner can promote a member to admin or demote an admin to member.
   - The owner record cannot be changed through this action.
   - `organiser` targets are accepted as legacy admins and may be normalised to `admin` on update.
3. Update `addMemberToSquad`:
   - Owner may add a member or admin.
   - Admin may add only a regular member.
   - Requested roles are validated server-side, not trusted from the client.
4. Allow owner/admin level users to add guest players, rotate invite codes, and approve or reject join requests.
5. Update `removePlayerFromSquad` to read both caller and target roles in one transaction:
   - Owner may remove admins and members, never the owner.
   - Admin may remove regular members and guests, never owner/admin-level users.
6. Record `updatedAt` and `updatedBy` on changed membership documents.

**Acceptance**

- Directly calling an action cannot bypass the role restrictions hidden in the UI.
- There is always exactly one unchanged owner after these operations.
- An admin can administer two unrelated groups through independent membership records.

## Phase 3: Enforce Session Operations

**Files**

- Modify `apps/web/src/server/sessions/actions.ts`
- Modify `apps/web/src/server/sessions/generate.ts`
- Modify `apps/web/src/server/sessions/rebalance.ts`
- Modify `apps/web/src/server/sessions/players.ts`
- Review `apps/web/src/server/sessions/score.ts`

**Changes**

1. Require owner/admin level for session creation, lifecycle changes, cancellation, court changes, schedule generation, shuffling, player-status changes, swaps, and court disabling.
2. Keep signed-in group-member score submission unchanged.
3. Replace raw membership checks and inline role comparisons with domain predicates.
4. Return consistent user-facing authorization messages such as `Only group owners and admins can run sessions.`

**Acceptance**

- Members cannot invoke management actions by calling server actions directly.
- Admins can fully run sessions created by the owner or another admin.
- Completed scores and public score-link behaviour are unchanged.

## Phase 4: Mirror The Model In Firestore Rules

**Files**

- Modify `firestore.rules`
- Modify `apps/web/firestore.groups.rules.test.ts`
- Modify `apps/web/firestore.sessions.rules.test.ts`
- Review `apps/web/firestore.full.rules.test.ts`

**Changes**

1. Replace `isOrganiser` helpers with admin-level helpers accepting `owner`, `admin`, and legacy `organiser`.
2. Permit admins to write player, venue, and court records while denying members.
3. Restrict member-document writes:
   - Owner can create/update/delete admin or member records.
   - Admin can create/delete member records only.
   - Neither path can create or alter an owner record.
4. Restrict join-request reads to owner/admin level so private applicant details are not exposed to every member.
5. Tighten session document reads from `any signed-in user` to group members or session players; public board and score links continue through server-side code.
6. Add explicit tests for owner, admin, legacy organiser, member, session player, and unrelated signed-in user.

**Acceptance**

- Rules tests prove that UI bypasses fail.
- Existing legacy organiser records retain access.
- An unrelated signed-in account cannot read an arbitrary session document.

## Phase 5: Build The Group Role Experience

**Files**

- Modify `apps/web/src/app/(app)/groups/[groupId]/page.tsx`
- Modify `apps/web/src/lib/groups/groups.ts`
- Modify `apps/web/src/lib/groups/useGroupRole.ts` if role normalization is not kept entirely in the domain package.

**Changes**

1. Replace the Organiser label and option with Admin.
2. Show a clear Owner, Admin, or Member badge; render legacy organiser records as Admin.
3. Give the owner a compact role control on each non-owner member:
   - `Make admin`
   - `Change to member`
4. Let admins access member, guest, venue, court, invite-code, and join-request management.
5. Limit an admin's add-member form to Member and hide role promotion controls.
6. Hide join-request subscriptions and private request details from regular members.
7. Add confirmation and in-place success/error feedback for role changes and removals.

**Acceptance**

- The owner can appoint multiple admins without leaving the member list.
- Admins see the tools they can use and no owner-only controls.
- Members get a clean read/player experience with no dead management controls.

## Phase 6: Align Session And Dashboard UX

**Files**

- Modify `apps/web/src/app/(app)/sessions/new/page.tsx`
- Modify `apps/web/src/app/(app)/sessions/[sessionId]/page.tsx`
- Modify `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`
- Modify `apps/web/src/server/sessions/actions.ts`
- Modify `apps/web/src/app/(app)/dashboard/page.tsx`
- Modify `apps/web/src/app/(app)/help/page.tsx`
- Modify `docs/USER_GUIDE.md`

**Changes**

1. Use the revised domain predicates to hide management controls from members.
2. Keep score entry available to members while separating it visually from admin session controls.
3. Update `getMySessionsAction` so sessions from groups the user owns or administers appear as manageable, regardless of who created them; deduplicate sessions where the user also plays.
4. Use plain labels such as `Admin` and `Member`; remove remaining user-facing `Organiser` role copy where it refers to permissions.
5. Explain the three roles briefly in Help and the user guide.

**Acceptance**

- An admin can find and open every session they are responsible for from the dashboard.
- A regular member cannot see Start, Shuffle, player-management, court-management, completion, or cancellation controls.
- Existing player views and score entry remain easy to reach.

## Phase 7: Verification And Release

1. Run domain tests: `pnpm --filter @picklebaddies/domain test`.
2. Run web unit tests: `pnpm --filter @picklebaddies/web test`.
3. Run Firestore Rules emulator tests: `pnpm --filter @picklebaddies/web test:rules`.
4. Run typecheck: `pnpm --filter @picklebaddies/web typecheck`.
5. Run the production build: `pnpm --filter @picklebaddies/web build`.
6. Run or extend Playwright coverage for owner, admin, member, and legacy organiser flows.
7. Manually verify mobile layouts for role controls and permission-hidden session controls.
8. Deploy to a Vercel preview first, complete a production-data smoke test with a disposable group, then deploy to production after approval.

## Recommended Delivery Order

Deliver Phases 1-4 together as the permission foundation. Then deliver Phases 5-6 as the visible product experience. Do not release the UI before the server and rules enforcement is live in the same deployment.
