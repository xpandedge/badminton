# Quick Session v2 — Design

> Date: 2026-06-08
> Status: approved (brainstorm), pending implementation plan

## Summary

Upgrade the anonymous Quick Session feature into a signed-in, persistent,
fairness-aware flow with a polished UI. Four cohesive changes:

1. **Auth gate** — only signed-in users can use Quick Session.
2. **Rolling court queue** — scoring editability driven by active games (courts),
   not strict round gating.
3. **UI redesign** — adopt the existing volt/ink design system, add animation +
   page background.
4. **Per-user persistent roster + cross-session fairness** — players saved to the
   DB per signed-in user; their accumulated game/partner/opponent history seeds
   future sessions so play is evened out over time.

This is delivered as one spec, built in four phases in the order above.

## Context

- Current Quick Session lives in `apps/web/src/app/quick/page.tsx` (setup) and
  `apps/web/src/app/quick/[sessionId]/page.tsx` (live), with logic in
  `apps/web/src/lib/quick-sessions/**`.
- Today it is anonymous: session is created client-side, persisted to both
  `localStorage` and Firestore (`quickSessions/{id}`), no `ownerUid`.
- Schedule generation calls `generateSchedule` from `@picklebaddies/match-engine`
  **client-side** — Quick Session is the documented exception to the
  "generation commits server-side only" invariant (it is a casual, single-device
  flow). This stays as-is.
- `match-engine` is pure/deterministic. `generateSchedule` is real (not a stub).
  `EngineState` already tracks `gamesPlayed`, `sitOuts`, `partnerCount`,
  `opponentCount` — the exact dimensions cross-session fairness needs.
- Home page (`apps/web/src/app/page.tsx`) already uses a polished design system in
  `apps/web/src/app/globals.css`: tokens (`--volt-*`, `--ink-*`, `--bg`),
  utility classes (`pb-net-bg`, `pb-btn`, `pb-btn-volt`, `pb-input`), and
  keyframes (`pb-rise`, `pb-pop`, `pb-fade`). The quick-session pages currently
  ignore this and use an orphan orange/cream inline palette.

## Phase 1 — Auth gate

- `/quick` and `/quick/[sessionId]` require an authenticated user.
- Reuse `useAuth` (`apps/web/src/lib/auth/useAuth.ts`) / `AuthProvider`.
  Unauthenticated users are redirected to `/sign-in?next=<path>` and returned
  after sign-in.
- Prefer moving the `quick/**` routes under the existing `(app)` route group if
  that group's layout already enforces auth; otherwise add an explicit client
  guard. Decide during planning by inspecting `app/(app)/layout.tsx`.
- New sessions persist `ownerUid`. Existing anonymous sessions (no `ownerUid`)
  remain readable by their creator via the local cache; no migration required.
- Remove the "no login needed" header label.

## Phase 2 — Rolling court queue (live model)

Replace round-gated editability with a per-**match** status derived from a single
ordered queue.

- **Queue order:** sort matches by `roundNumber`, then `matchNumber` (court order).
- **Live window:** the first **N unscored** matches (N = `session.courts`) are
  `live` and editable.
- **Done:** any scored match is `done`. Done matches remain tap-to-edit so scores
  can be corrected.
- **Up next:** matches after the live window are `up_next` and locked (not
  editable).
- When a `live` match receives a score, the next queued match automatically enters
  the live window.

### New pure helper

`computeMatchStates(matches, scores, courts): Map<matchKey, MatchState>` where
`MatchState = "done" | "live" | "up_next"`. Lives in
`apps/web/src/lib/quick-sessions/score.ts`. Replaces `computeRoundStatus`.
Fully unit-tested (TDD) covering: empty scores, partial fill, live window sliding,
court count edge (N >= remaining matches), out-of-order scoring.

UI keeps grouping matches by round visually, but highlights `live` per match and
disables score entry on `up_next`.

## Phase 3 — UI redesign + animation + background

- Rebuild both quick pages on the volt/ink design system from `globals.css`
  (tokens + `pb-*` utility classes), removing the orphan inline orange palette.
- Page background: `pb-net-bg` plus a subtle gradient, matching the home page feel.
- Animation:
  - Staggered `pb-rise` entrance on round/match cards.
  - `pb-pop` on score save.
  - A soft, looping pulse on `live` match cards (new keyframe if needed).
- Setup page gains a roster picker UI: saved players shown as selectable chips,
  plus the existing add-new-player input.
- Keep mobile-first layout. No functional regressions to setup/score flows.

## Phase 4 — Per-user roster + cross-session fairness

### Data model (Firestore)

`users/{uid}/players/{playerId}`:

```
{
  id: string,
  name: string,
  skillLevel: SkillLevel,
  stats: {
    totalGames: number,
    totalSitOuts: number,
    sessionsPlayed: number,
    partnerCounts: Record<playerId, number>,   // times partnered
    opponentCounts: Record<playerId, number>,  // times opposed
    lastPlayedAt: number                        // epoch ms
  }
}
```

`quickSessions/{sessionId}` gains:
- `ownerUid: string`
- `rosterPlayerIds: string[]` (the `users/{uid}/players` ids used this session)
- `statsCommitted: boolean` (idempotency guard for the finish aggregation)

### Flow

- **On generate:** upsert each picked/new player into the owner's roster
  (`users/{uid}/players`), capturing their `playerId`. The session stores those
  ids in `rosterPlayerIds`. New players start with zeroed stats.
- **On finish:** an explicit **"Finish session"** button commits stats. Guarded by
  `statsCommitted` so it runs at most once. For each player it folds the session's
  outcome into their `stats`:
  - `totalGames += games this session`
  - `totalSitOuts += sit-outs this session`
  - `sessionsPlayed += 1`
  - merge this session's partner/opponent pair counts into the maps
  - `lastPlayedAt = now`

  Aggregation is computed from `session.matches` + `session.sitOuts` (the source of
  truth for who played whom), independent of scores.

### Engine priors (pure, no I/O)

Extend `EngineInput` with an optional per-player priors block:

```
priors?: Record<playerId, {
  gamesPlayed: number,
  partnerCounts: Record<playerId, number>,
  opponentCounts: Record<playerId, number>
}>
```

Seed `EngineState` from `priors` (new path alongside `createInitialState` /
`seedStateFromLocked`, e.g. `seedStateFromPriors`). The existing penalty math then
naturally evens out games + partner variety + opponent variety across sessions.

**Anti-starvation normalization:** seeding raw lifetime `gamesPlayed` would
permanently bench veterans. Therefore:
- `gamesPlayed` prior is normalized as `(prior − rosterMin)` where `rosterMin` is
  the minimum `gamesPlayed` among players present this session, then **capped at the
  generated round count**. This nudges fairness toward under-played players without
  starvation.
- `partnerCounts` / `opponentCounts` seed directly — they are soft penalties and
  already bounded/decayed by the penalty function.

The web layer builds `priors` from the roster stats docs of the selected players
and passes them into `generateSchedule`. Only `partnerCounts` / `opponentCounts`
entries between players *present in this session* are relevant; others are ignored.

### Firestore rules

`users/{uid}/players/**` is owner-only read/write (`request.auth.uid == uid`).
`quickSessions/{id}` writes restricted to `ownerUid`. Add rules tests.

## Testing

- `match-engine`: unit tests for `seedStateFromPriors` and prior normalization
  (TDD). Determinism preserved.
- `quick-sessions`: unit tests for `computeMatchStates` (Phase 2) and the stats
  aggregation reducer (Phase 4), both pure functions.
- Firestore rules tests for the new collections (Phase 1 + 4).
- Manual: full flow on Auth + Firestore emulators.

## Non-goals

- No group sharing of rosters (per-user only).
- No server-side (Cloud Function) generation for Quick Session — stays client-side.
- No global/cross-user player directory.
- No automatic stats commit without the explicit Finish action.
```

