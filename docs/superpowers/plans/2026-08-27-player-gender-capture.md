# Player Gender Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture `Male`, `Female`, or `Non-binary` for signed-in players and admin-added guest players so DuoRally can support mixed games in a future scheduling release.

**Architecture:** Add a shared domain enum for player gender, then validate it in server actions before it reaches Firestore. Store gender at player level on account/profile records, squad player records, and session player records where those records are created or updated. Extend the existing protected account dialog and admin guest forms without changing matchmaking.

**Tech Stack:** TypeScript, Next.js App Router, React 19, Firebase Auth, Firestore client SDK for own-profile reads, Firebase Admin SDK in server actions, Vitest, pnpm workspaces.

## Global Constraints

- Gender options are exactly `Male`, `Female`, and `Non-binary`.
- Stored gender values are exactly `male`, `female`, and `non_binary`.
- Gender is player-level data, not group-level data.
- Signed-in users without gender must see a login prompt until a value is saved.
- Admin-added guest players must provide gender when they are added.
- Explain the reason in the UI: DuoRally asks so mixed games and balanced session formats can be supported in future.
- Do not change matchmaking, team balancing, ranking, or scoring behavior in this release.
- Do not display gender in rankings, scoreboards, public board pages, or player labels.
- Preserve existing active sessions, completed matches, and historical results.
- The worktree already contains unrelated unstaged changes; stage and commit only files touched by this plan.

---

## File Structure

- Create `packages/domain/src/player-gender.ts`: shared gender constants, type guard, parser, and display labels.
- Modify `packages/domain/src/player-gender.test.ts`: focused tests for valid values, invalid values, and labels.
- Modify `packages/domain/src/index.ts`: export the gender helpers.
- Modify `apps/web/src/lib/auth/profile.ts`: include optional `gender` on stored user profiles and add a client-safe own-profile read helper.
- Modify `apps/web/src/lib/auth/profile.test.ts`: verify new profiles do not invent gender and existing fields still map correctly.
- Modify `apps/web/src/server/users/actions.ts`: add a profile update action that validates gender, updates Auth display name, and fans out name/gender to player records.
- Modify `apps/web/src/components/PlayerNameDialog.tsx`: convert the name-only dialog into an account profile dialog with gender selection and required-mode copy.
- Modify `apps/web/src/app/(app)/layout.tsx`: read `users/{uid}.gender`, open the account dialog automatically when missing, and pass current gender into the dialog.
- Modify `apps/web/src/server/players/actions.ts`: validate and store gender for durable guest player creation.
- Modify `apps/web/src/server/squads/actions.ts`: validate and store gender for admin-created squad guests; copy known gender for registered squad members where available.
- Modify `apps/web/src/server/sessions/players.ts`: require and store gender for session-only guests; copy gender from squad players into session player records.
- Modify `apps/web/src/server/sessions/actions.ts`: copy gender into RSVP-created session player records and admin RSVP sync records where the source record has it.
- Modify `apps/web/src/app/(app)/sessions/[sessionId]/page.tsx`: require gender in the session detail guest form.
- Modify `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`: require gender in the live session guest form.
- Modify `apps/web/src/app/privacy/page.tsx`: mention gender as profile information collected to support mixed session formats.

---

### Task 1: Shared Player Gender Domain

**Files:**
- Create: `packages/domain/src/player-gender.ts`
- Create: `packages/domain/src/player-gender.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces: `PLAYER_GENDERS`, `PlayerGender`, `PLAYER_GENDER_LABELS`, `isPlayerGender(value: unknown): value is PlayerGender`, `parsePlayerGender(value: unknown): PlayerGender | null`.

- [ ] **Step 1: Write the failing test**

Create `packages/domain/src/player-gender.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PLAYER_GENDERS,
  PLAYER_GENDER_LABELS,
  isPlayerGender,
  parsePlayerGender,
} from "./player-gender.js";

describe("player gender", () => {
  it("exposes the approved stored values and labels", () => {
    expect(PLAYER_GENDERS).toEqual(["male", "female", "non_binary"]);
    expect(PLAYER_GENDER_LABELS).toEqual({
      male: "Male",
      female: "Female",
      non_binary: "Non-binary",
    });
  });

  it("accepts only approved gender values", () => {
    expect(isPlayerGender("male")).toBe(true);
    expect(isPlayerGender("female")).toBe(true);
    expect(isPlayerGender("non_binary")).toBe(true);
    expect(isPlayerGender("woman")).toBe(false);
    expect(isPlayerGender("")).toBe(false);
    expect(isPlayerGender(null)).toBe(false);
  });

  it("parses valid values and rejects invalid values", () => {
    expect(parsePlayerGender("male")).toBe("male");
    expect(parsePlayerGender("female")).toBe("female");
    expect(parsePlayerGender("non_binary")).toBe("non_binary");
    expect(parsePlayerGender(" prefer_not ")).toBeNull();
    expect(parsePlayerGender(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @picklebaddies/domain exec vitest run src/player-gender.test.ts
```

Expected: FAIL because `packages/domain/src/player-gender.ts` does not exist.

- [ ] **Step 3: Add the domain helper**

Create `packages/domain/src/player-gender.ts`:

```ts
export const PLAYER_GENDERS = ["male", "female", "non_binary"] as const;

export type PlayerGender = (typeof PLAYER_GENDERS)[number];

export const PLAYER_GENDER_LABELS: Record<PlayerGender, string> = {
  male: "Male",
  female: "Female",
  non_binary: "Non-binary",
};

export function isPlayerGender(value: unknown): value is PlayerGender {
  return typeof value === "string" && PLAYER_GENDERS.includes(value as PlayerGender);
}

export function parsePlayerGender(value: unknown): PlayerGender | null {
  return isPlayerGender(value) ? value : null;
}
```

Modify `packages/domain/src/index.ts`:

```ts
export * from "./player-gender.js";
```

- [ ] **Step 4: Run domain tests and build**

Run:

```bash
pnpm --filter @picklebaddies/domain exec vitest run src/player-gender.test.ts
pnpm --filter @picklebaddies/domain build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/player-gender.ts packages/domain/src/player-gender.test.ts packages/domain/src/index.ts
git commit -m "Add player gender domain values" -m "Co-Authored-By: Claude Opus 4.8"
```

---

### Task 2: Signed-In Profile Storage And Server Update

**Files:**
- Modify: `apps/web/src/lib/auth/profile.ts`
- Modify: `apps/web/src/lib/auth/profile.test.ts`
- Modify: `apps/web/src/server/users/actions.ts`

**Interfaces:**
- Consumes: `PlayerGender`, `parsePlayerGender` from `@picklebaddies/domain`.
- Produces: `updateMyPlayerProfile(input: { displayName: string; gender: PlayerGender }): Promise<ActionResult<void>>`.
- Keeps: `updateMyDisplayName(displayNameInput: string): Promise<ActionResult<void>>` as a compatibility wrapper.

- [ ] **Step 1: Write the failing profile tests**

Extend `apps/web/src/lib/auth/profile.test.ts` with:

```ts
it("does not invent a gender for a new Firebase user", () => {
  const profile = buildUserProfile({
    displayName: "Sam Rally",
    email: "sam@example.com",
    photoURL: null,
  });

  expect("gender" in profile).toBe(false);
});
```

- [ ] **Step 2: Run test to verify current behavior is explicit**

Run:

```bash
pnpm --filter @picklebaddies/web exec vitest run src/lib/auth/profile.test.ts
```

Expected: PASS or FAIL only if TypeScript needs the `gender` field added to `UserProfileFields`. Continue with Step 3 either way.

- [ ] **Step 3: Add optional gender to the client profile type**

In `apps/web/src/lib/auth/profile.ts`, import the type:

```ts
import type { PlayerGender } from "@picklebaddies/domain";
```

Extend `UserProfileFields`:

```ts
gender?: PlayerGender | null;
```

Do not add gender to `buildUserProfile`; Firebase Auth does not contain this field.

- [ ] **Step 4: Add the server action**

In `apps/web/src/server/users/actions.ts`, update imports:

```ts
import {
  isSport,
  parsePlayerGender,
  SPORT_OPTIONS,
  type PlayerGender,
  type Sport,
} from "@picklebaddies/domain";
```

Add this input type near `UserSearchResult`:

```ts
export interface PlayerProfileInput {
  displayName: string;
  gender: PlayerGender;
}
```

Add this helper:

```ts
function profileGenderUpdate(gender: PlayerGender): Record<string, unknown> {
  return { gender, updatedAt: FieldValue.serverTimestamp() };
}
```

Replace the body of `updateMyDisplayName` with a wrapper:

```ts
export async function updateMyDisplayName(displayNameInput: string): Promise<ActionResult<void>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const userSnap = await getAdminDb().doc(`users/${user.uid}`).get();
  const existingGender = parsePlayerGender(userSnap.data()?.gender);
  if (!existingGender) {
    return err("INVALID_ARGUMENT", "Choose your gender in your account profile first.");
  }

  return updateMyPlayerProfile({ displayName: displayNameInput, gender: existingGender });
}
```

Add `updateMyPlayerProfile` by moving the existing `updateMyDisplayName` fan-out code into the new function and adding gender validation:

```ts
export async function updateMyPlayerProfile(input: PlayerProfileInput): Promise<ActionResult<void>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  let displayName: string;
  try {
    displayName = normalizePlayerDisplayName(input.displayName);
  } catch (validationError) {
    return err(
      "INVALID_ARGUMENT",
      validationError instanceof Error ? validationError.message : "Enter a valid player name",
    );
  }

  const gender = parsePlayerGender(input.gender);
  if (!gender) return err("INVALID_ARGUMENT", "Choose Male, Female, or Non-binary.");

  const db = getAdminDb();

  try {
    const groupsSnapshot = await db.collection("groups")
      .where("memberIds", "array-contains", user.uid)
      .get();
    const groupIds = groupsSnapshot.docs.map((groupDoc) => groupDoc.id);
    const sessionSnapshots = await Promise.all(
      groupIds.map((groupId) => db.collection("sessions").where("groupId", "==", groupId).get()),
    );
    const sessionDocs = sessionSnapshots.flatMap((snapshot) => snapshot.docs);

    const canonicalRefs = [db.doc(`users/${user.uid}`), db.doc(`players/${user.uid}`)];
    const groupRefs = groupIds.flatMap((groupId) => [
      db.doc(`groups/${groupId}/members/${user.uid}`),
      db.doc(`groups/${groupId}/players/${user.uid}`),
    ]);
    const sessionRefs = sessionDocs.flatMap((sessionDoc) => [
      db.doc(`sessions/${sessionDoc.id}/players/${user.uid}`),
    ]);
    const existingSnapshots = await db.getAll(...canonicalRefs, ...groupRefs, ...sessionRefs);
    const matchesBySession = await Promise.all(
      sessionDocs.map((sessionDoc) => db.collection(`sessions/${sessionDoc.id}/matches`).get()),
    );

    await getAdminAuth().updateUser(user.uid, { displayName });

    const writer = db.bulkWriter();
    const now = FieldValue.serverTimestamp();

    for (const snapshot of existingSnapshots) {
      if (!snapshot.exists) continue;
      const data: Record<string, unknown> = { displayName, gender, updatedAt: now };
      if (snapshot.ref.parent.id === "users") {
        data.displayNameLower = displayName.toLowerCase();
      }
      writer.set(snapshot.ref, data, { merge: true });
    }

    for (const matchesSnapshot of matchesBySession) {
      for (const matchDoc of matchesSnapshot.docs) {
        const match = matchDoc.data();
        const teamA = renameMatchTeam(match.teamA, user.uid, displayName);
        const teamB = renameMatchTeam(match.teamB, user.uid, displayName);
        if (!teamA.changed && !teamB.changed) continue;
        const matchUpdate: Record<string, unknown> = { updatedAt: now };
        if (teamA.changed) matchUpdate.teamA = teamA.players;
        if (teamB.changed) matchUpdate.teamB = teamB.players;
        writer.update(matchDoc.ref, matchUpdate);
      }
    }

    await writer.close();
    return ok(undefined);
  } catch (updateError) {
    console.error("player profile update failed", updateError);
    return err("INTERNAL", "Could not update your profile. Please try again.");
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
pnpm --filter @picklebaddies/domain build
pnpm --filter @picklebaddies/web exec vitest run src/lib/auth/profile.test.ts
pnpm --filter @picklebaddies/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/auth/profile.ts apps/web/src/lib/auth/profile.test.ts apps/web/src/server/users/actions.ts
git commit -m "Store player gender on profile updates" -m "Co-Authored-By: Claude Opus 4.8"
```

---

### Task 3: Account Dialog And Login Prompt

**Files:**
- Modify: `apps/web/src/components/PlayerNameDialog.tsx`
- Modify: `apps/web/src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `PLAYER_GENDER_LABELS`, `PLAYER_GENDERS`, `parsePlayerGender`, `PlayerGender`.
- Consumes: `updateMyPlayerProfile(input: { displayName: string; gender: PlayerGender })`.
- Produces: profile dialog props `{ currentName: string; currentGender: PlayerGender | null; open: boolean; requireGender: boolean; onClose: () => void; onSaved: () => Promise<void> }`.

- [ ] **Step 1: Convert the dialog props and state**

In `apps/web/src/components/PlayerNameDialog.tsx`, update imports:

```ts
import {
  PLAYER_GENDER_LABELS,
  PLAYER_GENDERS,
  parsePlayerGender,
  type PlayerGender,
} from "@picklebaddies/domain";
import { updateMyPlayerProfile } from "@/server/users/actions";
```

Update props:

```ts
type PlayerNameDialogProps = {
  currentName: string;
  currentGender: PlayerGender | null;
  open: boolean;
  requireGender?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
};
```

Update component state:

```ts
export function PlayerNameDialog({
  currentName,
  currentGender,
  open,
  requireGender = false,
  onClose,
  onSaved,
}: PlayerNameDialogProps) {
  const [name, setName] = useState(currentName);
  const [gender, setGender] = useState<PlayerGender | "">(currentGender ?? "");
```

When the dialog opens:

```ts
setName(currentName);
setGender(currentGender ?? "");
```

- [ ] **Step 2: Require gender on submit**

Replace the save action with:

```ts
const parsedGender = parsePlayerGender(gender);
if (!parsedGender) {
  setError("Choose Male, Female, or Non-binary.");
  return;
}

setSaving(true);
try {
  const result = await updateMyPlayerProfile({ displayName, gender: parsedGender });
  if (!result.ok) throw new Error(result.message);
  await onSaved();
  onClose();
} catch (saveError) {
  setError(saveError instanceof Error ? saveError.message : "Could not update your profile");
} finally {
  setSaving(false);
}
```

- [ ] **Step 3: Add gender controls and required-mode copy**

Change the title and description:

```tsx
<h2 id={titleId}>{requireGender ? "Complete your player profile" : "Your player profile"}</h2>
<p id={descriptionId}>
  We ask this so DuoRally can support mixed games and balanced session formats in future.
</p>
```

Add this field below the name input:

```tsx
<label style={{ display: "grid", gap: "0.4rem", marginTop: "0.875rem" }}>
  <span style={{ color: "var(--text-1)", fontSize: "0.8125rem", fontWeight: 800 }}>
    Gender
  </span>
  <select
    className="pb-input"
    value={gender}
    onChange={(event) => setGender(event.target.value as PlayerGender | "")}
    disabled={saving}
    required
  >
    <option value="" disabled>Choose gender</option>
    {PLAYER_GENDERS.map((option) => (
      <option key={option} value={option}>{PLAYER_GENDER_LABELS[option]}</option>
    ))}
  </select>
</label>
```

Hide the cancel button when gender is required:

```tsx
{!requireGender && (
  <button type="button" className="pb-confirm-dialog__cancel" onClick={onClose} disabled={saving}>
    Cancel
  </button>
)}
```

Prevent backdrop and Escape close in required mode by checking `!requireGender && !saving`.

- [ ] **Step 4: Read profile gender in the protected layout**

In `apps/web/src/app/(app)/layout.tsx`, import Firestore client helpers and gender parser:

```ts
import { doc, onSnapshot } from "firebase/firestore";
import { getFirebaseServices } from "@/lib/firebase/client";
import { parsePlayerGender, SPORTS, type PlayerGender } from "@picklebaddies/domain";
```

Add state:

```ts
const [profileGender, setProfileGender] = useState<PlayerGender | null>(null);
const [profileLoaded, setProfileLoaded] = useState(false);
```

Add a profile watcher after the sign-in redirect effect:

```ts
useEffect(() => {
  if (!user) {
    setProfileGender(null);
    setProfileLoaded(false);
    return;
  }

  const { db } = getFirebaseServices();
  const ref = doc(db, "users", user.uid);
  return onSnapshot(ref, (snapshot) => {
    setProfileGender(parsePlayerGender(snapshot.data()?.gender));
    setProfileLoaded(true);
  }, () => {
    setProfileGender(null);
    setProfileLoaded(true);
  });
}, [user]);
```

Add the automatic prompt:

```ts
useEffect(() => {
  if (!loading && user && profileLoaded && !profileGender) {
    setShowPlayerNameDialog(true);
  }
}, [loading, profileGender, profileLoaded, user]);
```

Update the account button title and dialog props:

```tsx
title="Edit your player profile"
aria-label="Edit your player profile"
```

```tsx
<PlayerNameDialog
  currentName={user.displayName?.trim() ?? ""}
  currentGender={profileGender}
  open={showPlayerNameDialog}
  requireGender={!profileGender}
  onClose={closePlayerNameDialog}
  onSaved={async () => {
    await refreshUser();
  }}
/>
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
pnpm --filter @picklebaddies/domain build
pnpm --filter @picklebaddies/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/PlayerNameDialog.tsx 'apps/web/src/app/(app)/layout.tsx'
git commit -m "Prompt players for gender in account profile" -m "Co-Authored-By: Claude Opus 4.8"
```

---

### Task 4: Server Validation For Guest And Squad Player Gender

**Files:**
- Modify: `apps/web/src/server/players/actions.ts`
- Modify: `apps/web/src/server/squads/actions.ts`
- Modify: `apps/web/src/server/sessions/players.ts`
- Modify: `apps/web/src/server/sessions/actions.ts`

**Interfaces:**
- Consumes: `PlayerGender`, `parsePlayerGender`.
- Updates: `createGuestPlayer(displayName: string, gender: PlayerGender)`.
- Updates: `AddGuestPlayerInput` with `gender: PlayerGender`.
- Updates: `AddSessionGuestInput` with `gender: PlayerGender`.

- [ ] **Step 1: Add imports**

In each server file that validates gender, import:

```ts
import { parsePlayerGender, type PlayerGender } from "@picklebaddies/domain";
```

Merge with existing `@picklebaddies/domain` imports instead of adding duplicate import lines.

- [ ] **Step 2: Validate durable guest player creation**

In `apps/web/src/server/players/actions.ts`, change:

```ts
export async function createGuestPlayer(
  displayName: string,
): Promise<ActionResult<{ playerId: string }>> {
```

to:

```ts
export async function createGuestPlayer(
  displayName: string,
  gender: PlayerGender,
): Promise<ActionResult<{ playerId: string }>> {
```

Add after display-name validation:

```ts
const parsedGender = parsePlayerGender(gender);
if (!parsedGender) return err("INVALID_ARGUMENT", "Choose Male, Female, or Non-binary.");
```

Add to `guestRef.set`:

```ts
gender: parsedGender,
```

- [ ] **Step 3: Validate squad guest creation**

In `apps/web/src/server/squads/actions.ts`, update `AddGuestPlayerInput`:

```ts
export interface AddGuestPlayerInput {
  squadId: string;
  displayName: string;
  gender: PlayerGender;
  skillLevel?: string;
}
```

After display-name validation:

```ts
const parsedGender = parsePlayerGender(input.gender);
if (!parsedGender) return err("INVALID_ARGUMENT", "Choose Male, Female, or Non-binary.");
```

Add to the squad player write:

```ts
gender: parsedGender,
```

- [ ] **Step 4: Copy registered member gender into squad player records**

In `addMemberToSquad`, fetch the user profile before the transaction:

```ts
const userProfileSnap = await db.doc(`users/${targetUser.uid}`).get();
const targetGender = parsePlayerGender(userProfileSnap.data()?.gender);
```

Add to the `groups/{squadId}/players/{targetUser.uid}` write when present:

```ts
...(targetGender ? { gender: targetGender } : {}),
```

- [ ] **Step 5: Validate session-only guest creation**

In `apps/web/src/server/sessions/players.ts`, update `AddSessionGuestInput`:

```ts
export interface AddSessionGuestInput {
  sessionId: string;
  displayName: string;
  gender: PlayerGender;
  skillLevel?: string;
}
```

Add after display-name validation:

```ts
const parsedGender = parsePlayerGender(input.gender);
if (!parsedGender) return err("INVALID_ARGUMENT", "Choose Male, Female, or Non-binary.");
```

Add to `sessions/{sessionId}/players/{playerId}`:

```ts
gender: parsedGender,
```

Add to the guest-added audit details:

```ts
details: { playerId, displayName: name, gender: parsedGender },
```

- [ ] **Step 6: Copy known gender into session player records**

In `addGroupMemberToSession`, after reading `groupPlayer`, add:

```ts
const gender = parsePlayerGender(groupPlayer.gender);
```

Add to the session player write:

```ts
...(gender ? { gender } : {}),
```

In `apps/web/src/server/sessions/actions.ts`, in signed-in RSVP paths where `groupPlayer` is available, add:

```ts
const gender = parsePlayerGender(groupPlayer?.gender);
```

Add to `playerUpdate` only when present:

```ts
...(gender ? { gender } : {}),
```

In RSVP sync helpers that build session player records from squad player records, carry `gender` through the internal entry object when `parsePlayerGender(player.gender)` returns a value, then set it on the session player write.

- [ ] **Step 7: Run typecheck**

Run:

```bash
pnpm --filter @picklebaddies/domain build
pnpm --filter @picklebaddies/web typecheck
```

Expected: FAIL until UI call sites pass `gender`; this is acceptable for this step if all remaining errors are missing `gender` arguments in guest forms.

- [ ] **Step 8: Commit after UI call sites are updated in Task 5**

Do not commit this task alone if typecheck fails. Commit together with Task 5 if the codebase requires UI call-site updates for a passing build.

---

### Task 5: Admin Guest Add UI

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/page.tsx`
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`

**Interfaces:**
- Consumes: `PLAYER_GENDER_LABELS`, `PLAYER_GENDERS`, `PlayerGender`.
- Produces: calls to `addGuestPlayerToSession({ sessionId, displayName, skillLevel, gender })`.

- [ ] **Step 1: Add imports**

In both session pages:

```ts
import { PLAYER_GENDER_LABELS, PLAYER_GENDERS, type PlayerGender } from "@picklebaddies/domain";
```

Merge with existing domain imports where present.

- [ ] **Step 2: Add guest gender state on session detail page**

In `apps/web/src/app/(app)/sessions/[sessionId]/page.tsx`, add:

```ts
const [guestGender, setGuestGender] = useState<PlayerGender | "">("");
```

Update the submit guard:

```ts
if (!guestName.trim() || !guestGender || isAddingGuest || !canManage) return;
```

Update the server call:

```ts
const result = await addGuestPlayerToSession({
  sessionId,
  displayName: guestName,
  skillLevel: guestSkill,
  gender: guestGender,
});
```

Reset after success:

```ts
setGuestGender("");
```

- [ ] **Step 3: Add the session detail gender select**

Place this select between guest name and guest skill:

```tsx
<select
  className="pb-input"
  value={guestGender}
  onChange={(e) => setGuestGender(e.target.value as PlayerGender | "")}
  style={{ height: 44, borderRadius: "var(--r-md)" }}
  aria-label="Guest gender"
  required
>
  <option value="" disabled>Gender</option>
  {PLAYER_GENDERS.map((option) => (
    <option key={option} value={option}>{PLAYER_GENDER_LABELS[option]}</option>
  ))}
</select>
```

Update the add button disabled and opacity checks to include `guestGender`.

- [ ] **Step 4: Add guest gender state on live session page**

In `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`, add:

```ts
const [sessionGuestGender, setSessionGuestGender] = useState<PlayerGender | "">("");
```

Update the submit guard:

```ts
if (!sessionGuestName.trim() || !sessionGuestGender || isAddingSessionGuest) return;
```

Update the server call:

```ts
const res = await addGuestPlayerToSession({
  sessionId,
  displayName: sessionGuestName,
  skillLevel: sessionGuestSkill,
  gender: sessionGuestGender,
});
```

Reset after success:

```ts
setSessionGuestGender("");
```

- [ ] **Step 5: Add the live session gender select**

Place this select between guest name and guest skill:

```tsx
<select
  className="pb-input"
  value={sessionGuestGender}
  onChange={(e) => setSessionGuestGender(e.target.value as PlayerGender | "")}
  style={{ height: 44, borderRadius: "var(--r-md)" }}
  aria-label="Guest gender"
  required
>
  <option value="" disabled>Gender</option>
  {PLAYER_GENDERS.map((option) => (
    <option key={option} value={option}>{PLAYER_GENDER_LABELS[option]}</option>
  ))}
</select>
```

Update the live add button disabled and opacity checks to include `sessionGuestGender`.

- [ ] **Step 6: Run typecheck**

Run:

```bash
pnpm --filter @picklebaddies/domain build
pnpm --filter @picklebaddies/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Tasks 4 and 5 together if needed**

```bash
git add apps/web/src/server/players/actions.ts apps/web/src/server/squads/actions.ts apps/web/src/server/sessions/players.ts apps/web/src/server/sessions/actions.ts 'apps/web/src/app/(app)/sessions/[sessionId]/page.tsx' 'apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx'
git commit -m "Require gender for admin-added guests" -m "Co-Authored-By: Claude Opus 4.8"
```

---

### Task 6: Privacy Copy And Final Verification

**Files:**
- Modify: `apps/web/src/app/privacy/page.tsx`

**Interfaces:**
- Consumes: completed data capture behavior from Tasks 1-5.
- Produces: user-facing privacy copy that acknowledges gender as profile information.

- [ ] **Step 1: Update privacy copy**

In `apps/web/src/app/privacy/page.tsx`, update the account information bullet to include gender:

```tsx
<li><strong>Account information:</strong> name, email address, gender, profile details, authentication identifier and account status.</li>
```

Add a purpose bullet where the page describes how information is used:

```tsx
<li>support mixed games and balanced session formats as DuoRally adds those options.</li>
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm --filter @picklebaddies/domain exec vitest run src/player-gender.test.ts
pnpm --filter @picklebaddies/web exec vitest run src/lib/auth/profile.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build-level checks**

Run:

```bash
pnpm --filter @picklebaddies/domain build
pnpm --filter @picklebaddies/web typecheck
```

Expected: PASS.

- [ ] **Step 4: Manual browser verification**

Run the app locally:

```bash
pnpm --filter @picklebaddies/web dev
```

Verify:

- A signed-in user with no `users/{uid}.gender` sees the account popup after login.
- The popup explains the mixed games and balanced session format reason.
- The popup cannot be dismissed while gender is missing.
- Saving `Male`, `Female`, or `Non-binary` writes the stored value to `users/{uid}` and `players/{uid}`.
- The account initials button can reopen the dialog and change gender.
- Session detail Add guest requires gender and saves it on `sessions/{sessionId}/players/{guestId}`.
- Live session Add guest requires gender and saves it on `sessions/{sessionId}/players/{guestId}`.
- Existing rankings, scoreboards, and public player labels do not display gender.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/privacy/page.tsx
git commit -m "Document player gender data use" -m "Co-Authored-By: Claude Opus 4.8"
```

---

## Self-Review

Spec coverage:

- Player-level capture is covered by Tasks 1-3.
- Signed-in login prompt is covered by Task 3.
- Account editing with name is covered by Task 3.
- Admin-added guest capture is covered by Tasks 4-5.
- Reason copy is covered by Tasks 3 and 5.
- Group-level mixed format settings are intentionally excluded by Global Constraints and the design doc.
- Matchmaking is unchanged by every task.

Placeholder scan:

- The plan contains no unresolved placeholders or unspecified validation.
- The only future-facing wording is user-facing product copy about future mixed formats.

Type consistency:

- Stored values use `PlayerGender`.
- UI labels come from `PLAYER_GENDER_LABELS`.
- Server validation uses `parsePlayerGender`.
- All guest-add inputs use `gender: PlayerGender`.
