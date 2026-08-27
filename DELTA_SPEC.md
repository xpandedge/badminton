# Delta-Spec — Resolutions to PRD Inconsistencies

> Companion to `PRD Social Session Chaos Killer.md`. Resolves the 7 critical
> inconsistencies found in review. Where this file conflicts with the PRD, **this
> file wins**. Section numbers reference the PRD.

---

## D1. Scoring mode (`winner_only` | `points`) — unify

**Decision:** scoring mode is per-session and changes only the score-capture UI and
leaderboard tie-break. Internal model always stores both `winnerTeam` and (optional)
scores.

### submitScore signature (replaces §16.3)
```text
submitScore(sessionId, roundId, matchId, payload)

payload (points mode):       { teamAScore: number, teamBScore: number }
payload (winner_only mode):  { winnerTeam: "A" | "B" }
```
- `points` mode: scores required, winner derived (`teamAScore != teamBScore`, no ties).
- `winner_only` mode: `winnerTeam` required, scores stay `null`.
- Validation rejects scores in winner_only and rejects winnerTeam in points mode.

### Leaderboard tie-break (replaces §12.12 sort)
```text
points mode:       win% → wins → pointDifference → gamesPlayed → displayName
winner_only mode:  win% → wins → gamesPlayed → fewer sitOuts → displayName
```
- Standings lead on **win rate**, not raw wins (revised 2026-08-27): a player who
  sits out rounds is not punished for games they never got. Raw wins is the first
  tie-break, keeping the larger sample ahead at an equal rate.
- `win%` is `wins / gamesPlayed`; a player with no games ranks behind everyone
  who has played, rather than tying at 0%.
- Rates compare cross-multiplied (`b.wins * aGames - a.wins * bGames`) so equal
  ratios such as 1/3 and 2/6 compare exactly, with no floating-point drift.
- In `winner_only`, hide `pointsFor / pointsAgainst / pointDifference` columns.
- Match doc keeps `teamAScore/teamBScore = null` in winner_only; never sort on them.

---

## D2. Courts — session holds court entities, not a count

**Decision:** drop "number only" for live play. Session snapshots actual courts.

### sessions/{sessionId} — replace `numberOfCourts` (§15.7)
```json
{
  "courts": [
    { "courtId": "c1", "name": "Court 1", "courtNumber": 1, "isActive": true }
  ],
  "courtCount": 3
}
```
- `courts[]` is a snapshot copied from `venues/{id}/courts` at session creation
  (denormalised, per §20.1). `courtCount` = count of `isActive` courts (derived,
  stored for quick reads).
- Generator assigns `courtId` only from `isActive` courts.
- **Court unavailable (§23):** set that court `isActive=false` in session.courts →
  rebalance future rounds. Completed matches keep their old courtId.

---

## D3. Generator is a pure shared module

**Decision:** one generator, no DB access, imported by the Cloud Function.

```text
/packages/match-engine        <- pure TS, zero firebase imports
  generate(input): Output      (deterministic, unit-tested)
  rebalance(input): Output
```
- §16.1 `generateSchedule` Cloud Function = thin wrapper: load data → call engine →
  write Firestore in a batch. Engine never touches Firestore.
- §17 frontend `/src/lib/match-generation` = **read-only helpers** (preview/estimate
  rounds for the UI). It MUST NOT be the source of truth — writes always go via the
  Cloud Function. Generation only commits server-side.

---

## D4. Round count uses remaining time on rebalance

**Decision:** two formulas, one for initial, one for rebalance.

```text
initial generate:
  estimated_rounds = floor(session_duration_minutes / estimated_game_minutes)

rebalance (mid-session):
  elapsed_rounds   = count(completed rounds) + count(in_progress rounds)
  remaining_min    = session_duration_minutes - (elapsed_rounds * estimated_game_minutes)
  future_rounds    = max(0, floor(remaining_min / estimated_game_minutes))
```
- Engine input gains `mode: "initial" | "rebalance"` and `elapsedRounds`.
- Replaces the single formula in §14.4.

---

## D5. Two distinct role axes

**Decision:** stop conflating "who controls the group" with "who plays the session."

### Axis A — group membership (`groups/{id}/members`, §15.3)
```text
role: owner | organiser | member
```
Drives permissions (create/edit session, generate, score). Matches §19 rules.

### Axis B — session participation (`sessions/{id}/players`, §15.8)
```text
participantType: registered_user | guest
```
A `player`/`guest` in §11 = a session participant, NOT a group role. A group `member`
who is also playing gets a session-player doc too. Permissions come from Axis A;
visibility (own match view) comes from Axis B.

---

## D6. Join / guest path — never let clients write player docs directly

**Decision:** all joins go through a Cloud Function. No public write to
`sessions/{id}/players`.

### New Cloud Function
```text
requestJoin(joinCode, { displayName, isGuest, userId? })
  - validate joinCode + session.joinEnabled
  - rate-limit by IP / code
  - create sessions/{id}/joinRequests/{reqId}  status="pending"
  - return reqId
```
### New collection
```text
/sessions/{sessionId}/joinRequests/{reqId}
  { displayName, isGuest, userId|null, status: pending|approved|rejected, createdAt }
```
- Organiser approves → Cloud Function promotes joinRequest to a `sessions/{id}/players`
  doc with `status: registered`.
- Security rules: `joinRequests` create allowed via function only; `players`
  collection stays organiser/function-write-only (keeps §19.3 intact).
- Resolves §12.1 / §12.5 / §19.8 conflict.

---

## D7. Player status semantics — session-level, not per-round

**Decision:** `sessions/{id}/players.status` describes **session availability**, never
"is playing this exact round."

```text
invited | registered | checked_in | active | waiting | left | removed | no_show

active   = checked in AND available for scheduling
waiting  = present but voluntarily benched (do not schedule until set active)
left/removed/no_show = exclude from all future rounds (per §13 rule)
```
- Per-round play vs sit-out is **derived** from `rounds/{r}/matches` (playing) and
  `sitOuts` (sitting). Never stored on the player.
- `sitOutCount` increments only when a round is marked `completed` (D-minor below).

---

---

## D8. Next.js server tier replaces Cloud Functions as authoritative write layer (supersedes PRD §16, §29)

**Decision:** For the Squads/Sessions/Scoring/Leaderboard feature set, authoritative mutations
(generate, rebalance, score, squad/session lifecycle) run in **Next.js server-only modules**
(`apps/web/src/server/**`) behind `verifySession()`, not in Firebase Cloud Functions.

### New invariant (replaces PRD §16's Cloud Function placement)
```text
apps/web/src/server/**   <- authoritative writers (firebase-admin, server-only)
  server/firebase/admin.ts     <- lazy getAdminApp/getAdminDb/getAdminAuth singleton
  server/auth/dal.ts           <- verifySession() / requireSession() using __session cookie
  server/result.ts             <- ActionResult<T> discriminated union + ok()/err() helpers
  server/lib/mapping.ts        <- mapSessionToEngineInput()
  server/squads/actions.ts     <- createSquad, rotateInviteCode, joinSquad
  server/sessions/actions.ts   <- createSession, updateSessionStatus
  server/sessions/generate.ts  <- generateSchedule (F-H4 transaction guard)
  server/sessions/rebalance.ts <- rebalanceSession (F-C3, D4, stat reconciliation)
  server/sessions/score.ts     <- submitScore (F-H5, F-C2, global stat increment)
  server/sessions/players.ts   <- updatePlayerStatus, addLatePlayer
  server/players/actions.ts    <- ensureGlobalPlayer, createGuestPlayer
apps/web/src/app/(app)/leaderboard/page.tsx  <- server component, queries players/ collection
scripts/backfill-global-stats.ts             <- one-shot idempotent stats backfill
```

### What doesn't change
- `match-engine` stays pure — zero Firebase/I/O imports (D3 unchanged).
- `@picklebaddies/domain` stays the shared predicate source used by both UI and server actions.
- Clients never write matches/leaderboards directly (unchanged invariant).
- Emulators: set `FIRESTORE_EMULATOR_HOST` + `FIREBASE_AUTH_EMULATOR_HOST` for local dev (no real project needed).

### Cloud Functions: frozen for MVP
- Existing callables (`generateSchedule`, `rebalanceSession`, `submitScore`, etc.) are reference
  implementations only — not extended. Each is deleted/disabled in the same sprint its Next.js
  equivalent ships (decided: no dual-writer window).
- Functions may still be needed for future work that cannot run in a request lifecycle
  (scheduled jobs, storage triggers). Evaluate per-task.

### Auth transport (decided)
- **`__session` cookie (auto):** On `onIdTokenChanged`, client writes the current Firebase ID token
  to an `__session` cookie; server reads it. Token refreshed on `onIdTokenChanged`; cleared on sign-out.
- Sensitive mutations call `verifyIdToken(token, /*checkRevoked*/ true)`.

### Role model (revised 2026-08-09)
- Group permissions use **three user-facing roles: `owner | admin | member`**. Stored `organiser`
  records are treated as legacy `admin` records until they are updated.
- Owners appoint or remove admins. Owners and admins manage the group and run sessions. Members
  can view, RSVP, and enter scores but cannot create, generate, rebalance, or control sessions.
- A group has one owner and may have multiple admins. Roles remain per-group, so one account may
  administer multiple groups.
- `participantType` axis (Axis B of D5) is unchanged.

---

## D9. Sport config — badminton and pickleball (added 2026-06-15)

**Decision:** sport is chosen once at session creation; it drives default scoring and UI labels only. The engine is sport-agnostic.

### `packages/domain/src/sport.ts`
```ts
type Sport = "badminton" | "pickleball";
// badminton: defaultScoringMode "points", defaultTargetScore 21
// pickleball: defaultScoringMode "points", defaultTargetScore 11
```
- `sessions/{id}.sport` stores the chosen sport.
- `getSportConfig(sport)` returns label, default scoring mode, default target score, and terminology (game/court names).
- Session creation pre-fills `scoringMode` from sport config; organiser can override.
- No engine changes — sport is pure UX/defaults.

---

## D10. Global player identity and leaderboard (added 2026-06-15)

**Decision:** all-time stats live in `players/{playerId}`, server-write-only, updated atomically with per-session stats on every `submitScore`.

### `players/{playerId}` schema
```json
{
  "uid": "string (= playerId)",
  "displayName": "string",
  "isGuest": false,
  "totalGames": 0,
  "totalWins": 0,
  "totalLosses": 0,
  "totalPointsFor": 0,
  "totalPointsAgainst": 0,
  "totalPointDiff": 0,
  "totalSitOuts": 0,
  "totalSessions": 0,
  "lastPlayedAt": null,
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp"
}
```
- `playerId` = Firebase uid for auth users; `guest_{firestoreId}` for guests.
- Created/ensured by `ensureGlobalPlayer` server action (called fire-and-forget from `AuthProvider` after sign-in).
- Updated inside the **same Firestore transaction** as `sessions/{id}/players` in `submitScore`. Edit-rescoring reverses prior global delta before applying new one.
- Firestore rules: `allow write: if false` (server tier only). Client reads are allowed (`signedIn()`).
- Global leaderboard: `/leaderboard` server component queries `players/` ordered by `totalWins desc → totalPointDiff desc → totalGames desc`, limit 100, filters `totalGames > 0`.

---

## Minor resolutions (folded in)
- **Skill map:** keep `unknown=2` (= intermediate) but document: unknown players are
  treated as mid-skill for balancing only; never shown as "intermediate" in UI.
- **Stat triple-write:** `submitScore` updates `sessions/{id}/players`, `sessions/{id}/leaderboard`, AND `players/{id}` in ONE transaction. All three or none.
- **`paused`:** `pauseSession` / `resumeSession` implemented in session lifecycle actions.
- **advanceRound:** unscored matches on advance → `cancelled` (don't count in stats).
- **fairnessScore:** `1 - (normalised penalty sum)`, clamped 0–1. Surfaced in the live console header (Fairness % chip from `generationRuns` metadata). Never gates generation.
- **sitOutCount during rebalance:** count only sit-outs in `completed` rounds, so deleting/regenerating future rounds can't rewrite history.
