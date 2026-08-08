# M8 Design: Court-link Scoring + Group & Session Discovery

> Status: approved, ready for implementation planning
> Date: 2026-06-08

## 1. Problem Statement

After M7, the organiser is still the single point of contact during live play:
- Score entry is bottlenecked through one person running court-to-court
- New players can only discover and join sessions if the organiser manually adds them or hands out a join code
- There is no sessions list or "my sessions" home view

M8 eliminates both bottlenecks.

---

## 2. Scope

Two independent workstreams:

| Workstream | Theme |
|---|---|
| A — Court-link scoring | Decentralise score entry; anyone with a link can submit |
| B — Group discovery + sessions list | Sign-in-gated group invite, group session browser, "my sessions" dashboard |

These share no state and can be built and tested independently.

---

## 3. Workstream A — Court-link Scoring

### 3.1 Goal

A session generates one unguessable score link. Anyone with the link can open it on their phone, pick a court, and submit the result for the current in-progress match. No login required. Score applies immediately. Organiser retains edit rights.

### 3.2 Data Model Changes

**`sessions/{sessionId}` — two new fields**

```json
{
  "scoreCode": "abc12xyz",
  "scoreLinkEnabled": true
}
```

- `scoreCode`: short unguessable string, generated once at session creation using the same generator as `joinCode` (`packages/domain/src/join-code.ts`). Never auto-rotates.
- `scoreLinkEnabled`: boolean, default `true`. Organiser toggle.

No other collections change.

### 3.3 New Cloud Function: `submitScoreByLink`

```
submitScoreByLink(scoreCode, courtId, payload)
```

**Auth:** unauthenticated callable (no `request.auth` required).

**Validation sequence:**
1. Look up session by `scoreCode` where `scoreLinkEnabled === true`. If not found → `not-found`.
2. Assert `session.status === "active"`. Otherwise → `failed-precondition`.
3. Find match in `sessions/{id}/rounds/round_{currentRoundNumber}/matches` where `courtId` matches and `status !== "completed"` and `status !== "cancelled"`. If not found → `failed-precondition` ("No active match on that court").
4. Validate `payload` against `session.scoringMode` (reuse `assertScorePayload`).

**Transaction (same logic as `submitScore`):**
- Derive winner via `deriveWinner`.
- Update match: `status → completed`, `isLocked → true`, `winnerTeam`, `scorePayload`, `completedAt`.
- Update `sessions/{id}/players` stats for all 4 players.
- Update `sessions/{id}/leaderboard` for all 4 players.
- Write audit log with `source: "court_link"` and IP address.

**Rate limiting:** per `scoreCode + IP` via existing `checkRateLimit`.

**Returns:** `{ success: true, courtName, winnerTeam }`

### 3.4 New Public Route: `/score/[scoreCode]`

**Auth:** none — fully public page.

**Page behaviour:**
1. On load: calls a new unauthenticated Cloud Function `getScoreLinkData(scoreCode)` that returns session name, sport, scoring mode, current round number, and all courts with their current match + player names. This avoids exposing session data via public Firestore rules.
2. Renders a list of court cards. Each card shows: court name, Team A names vs Team B names, current match status.
3. **If match already `completed`:** show "Already scored — [winner] won" state. No form.
4. **If session not `active` or `scoreLinkEnabled === false`:** show "Scoring not available" state.
5. **Tap a court card:** inline score entry form appears.
   - `winner_only` mode: two buttons — "Team A won" / "Team B won".
   - `points` mode: two number inputs + submit button.
6. On submit → calls `submitScoreByLink` → shows confirmation banner ("Court 1 result recorded ✓"). Court card updates to completed state.
7. No login prompt anywhere on this page.

**URL pattern:** `/score/abc12xyz`

### 3.5 Organiser Controls

**Session settings page — new "Score Link" section:**
- Toggle: "Allow court link scoring" → writes `scoreLinkEnabled`
- "Copy score link" button
- QR code for the `/score/[scoreCode]` URL (inline, no external service)

**Live session page — score audit badge:**
- Scores submitted via link show a small "via link" label (sourced from audit log `source === "court_link"`).
- Organiser can still edit any score; edit goes through existing `submitScore` with organiser auth.

---

## 4. Workstream B — Group Discovery + Sessions List

### 4.1 Goal

Sign-in is required for everything in this workstream. A group owner shares a group invite link. A new user signs up, lands on the group invite page, joins as a member, then browses the group's sessions and requests to join upcoming ones. The dashboard gains a "My Sessions" view.

### 4.2 Data Model Changes

**`groups/{groupId}` — one new field**

```json
{
  "groupInviteCode": "grp7xyz9"
}
```

- Generated at group creation (same short-code generator).
- Owner can regenerate from settings (old code immediately stops working).
- No other collections change.

### 4.3 New Cloud Function: `joinGroupByInvite`

```
joinGroupByInvite(inviteCode)
```

**Auth:** requires sign-in (`request.auth` enforced).

**Logic:**
1. Query `groups` where `groupInviteCode === inviteCode`. If not found → `not-found`.
2. Check `groups/{id}/members/{uid}`. If already a member → return `{ groupId, role: existingRole }` (idempotent).
3. Write `groups/{id}/members/{uid}` with `role: "member"`, `userId`, `createdAt`.
4. Append `uid` to `groups/{id}.memberIds` via `FieldValue.arrayUnion`.
5. Write audit log.

**Returns:** `{ groupId, role: "member" }`

### 4.4 New Route: `/join/group/[inviteCode]`

**Auth:** sign-in required.
- Unauthenticated visitor → redirect to `/sign-in?redirect=/join/group/[inviteCode]`.
- After sign-in → page calls `joinGroupByInvite(inviteCode)`.
- On success → redirect to `/groups/[groupId]`.
- Landing page shows only group name + sport (fetched by inviteCode) during the brief processing state.
- Error states: invalid code ("Link is no longer valid"), already a member (redirect silently).

### 4.5 Sessions Tab on `/groups/[groupId]`

New "Sessions" tab added to the group detail page.

**Data source:** Firestore query — `sessions` collection where `groupId == groupId`, ordered by `startsAt desc`. Readable by group members (Firestore rules: caller is in `groups/{id}/members`).

**Filter chips:** Upcoming | Active | Past

**Session card fields:** name, date/time, venue, sport icon, player count, status badge.

**Action button logic (per card):**
- Caller is organiser/owner of that session → **"Manage"** → `/sessions/[sessionId]/live`
- Caller already in `sessions/{id}/players` → **"View"** → `/sessions/[sessionId]/player`
- Caller is a group member not yet in session → **"Request to Join"** → calls existing `requestJoin(joinCode, { displayName, isGuest: false, userId })` with the session's `joinCode` read from the session doc. No new backend function needed.
- After requesting → button changes to "Requested" (disabled).

### 4.6 "My Sessions" on `/dashboard`

Dashboard gains a "My Sessions" primary section with two tabs:

**"Organising" tab**
- Query: `sessions` where `createdBy == uid`, ordered by `startsAt desc`.
- Active sessions pinned to top.
- Empty state: "No sessions yet — [Create a session]".

**"Playing" tab**
- Query: `sessions` where `sessions/{id}/players/{uid}` exists (Firestore collection group query on `players` where `playerId == uid`, then hydrate session docs).
- Active sessions pinned to top.
- Empty state: "You haven't joined any sessions yet — ask your organiser for a group invite link."

Both tabs use the same session card component as the group sessions tab.

### 4.7 Group Owner Controls

**Group settings page — new "Invite Link" section:**
- Displays current group invite link.
- "Copy link" button.
- "Regenerate link" button → generates new `groupInviteCode`, old link stops working immediately. Confirmation dialog before regenerating.

---

## 5. Security Model

### Court-link scoring
- `submitScoreByLink` is an unauthenticated callable — this is intentional and matches the same trust model as `requestJoin`.
- Attack surface is bounded: `scoreCode` is short but unguessable (same entropy as `joinCode`). Rate-limiting per IP + scoreCode prevents brute-force.
- Scoring is only possible on: active session, current round, uncompleted match. A malicious submission on an already-scored match is a no-op (returns error).
- Organiser can disable via `scoreLinkEnabled = false` instantly.
- All submissions are audited with IP + `source: "court_link"`.

### Group invite
- `joinGroupByInvite` requires auth — no anonymous group joining.
- Owner can rotate the `groupInviteCode` to invalidate old links.
- Joining only grants `member` role — cannot escalate to organiser/owner via this path.

### Sessions tab (group page)
- Session docs readable only by group members (Firestore rule: caller in `groups/{id}/members`).
- `joinCode` readable by group members (embedded in session doc) — acceptable since group membership is already trusted.
- Session player writes still go through Cloud Functions only (DELTA_SPEC D6 preserved).

---

## 6. Routes Summary

| Route | Auth | Description |
|---|---|---|
| `/score/[scoreCode]` | None | Court-link score entry |
| `/join/group/[inviteCode]` | Required (redirect to sign-in) | Group invite landing |
| `/groups/[groupId]` | Required | + Sessions tab (new) |
| `/dashboard` | Required | + My Sessions section (new) |

---

## 7. New Functions Summary

| Function | Auth | Description |
|---|---|---|
| `getScoreLinkData` | None | Read session + current round data for the score link page |
| `submitScoreByLink` | None | Score a match via court link |
| `joinGroupByInvite` | Required | Join group via invite code |

Existing functions used unchanged: `requestJoin`, `submitScore` (organiser edits), `checkRateLimit`, `writeAudit`.

---

## 8. Testing Requirements

### Unit tests (packages/domain)
- No new code-generator functions needed — `scoreCode` and `groupInviteCode` both reuse the existing `generateJoinCode` from `join-code.ts`. Existing tests cover it.

### Integration tests (functions)
- `submitScoreByLink`: valid submission completes match + updates leaderboard
- `submitScoreByLink`: rejected if session not active
- `submitScoreByLink`: rejected if match already completed
- `submitScoreByLink`: rejected if `scoreLinkEnabled === false`
- `submitScoreByLink`: rate-limit fires after N requests from same IP
- `joinGroupByInvite`: adds member with `member` role
- `joinGroupByInvite`: idempotent on repeat call
- `joinGroupByInvite`: rejects unauthenticated call
- `joinGroupByInvite`: invalid code returns `not-found`

### Manual test scenarios
1. Session with 3 courts → open `/score/[code]` on a phone → submit result on Court 2 → verify leaderboard updates live, match locked, audit shows `source: court_link`.
2. Organiser disables score link → open same URL → verify "Scoring not available" state.
3. Group owner copies invite link → new user opens link → redirected to sign-in → after sign-in lands on group page as member.
4. New member browses group sessions tab → requests to join upcoming session → organiser sees join request.
5. Dashboard "Playing" tab shows session after organiser approves join request.

---

## 9. Out of Scope for M8

- Per-court QR codes (single session link covers the need)
- Player-initiated score submission (authenticated, on-match player) — separate future feature
- Public session feed (no unauthenticated session discovery)
- Group invite approval flow (joining is immediate for `member` role)
- Push notifications for join requests (PRD §8.2 deferred)
