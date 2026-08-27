# Player Gender Capture Design

## Context

DuoRally needs to start capturing player gender so mixed games and balanced mixed-session formats can be implemented later. The first release should collect reliable data without changing the matchmaking algorithm yet.

Gender is a player-level attribute, not a squad-level attribute. A signed-in player may belong to several squads, and the value should not drift between groups. Squads can later add a separate setting such as mixed-game balancing or mixed-format preference when scheduling starts using this data.

## Options

1. Store gender only on `users/{uid}`.
   - Lowest implementation cost.
   - Weak for guest players and future scheduling, which reads player and session-player records more often than account-only profiles.

2. Store gender on player records and mirror it from account profile.
   - Best fit for future scheduling and guest support.
   - Slightly more data fan-out, but consistent with how display names already work.

3. Add group-level gender settings now.
   - Useful later for enabling mixed-game formats per squad.
   - Too early for this release because the scheduler behavior is not being changed yet.

Recommended approach: option 2 now, with option 3 deferred until mixed-game scheduling is designed.

## Data Model

Use a constrained string union:

- `male`
- `female`
- `non_binary`

Display labels:

- `Male`
- `Female`
- `Non-binary`

Signed-in players store gender on:

- `users/{uid}.gender`
- `players/{uid}.gender`

Guest players store gender on:

- `players/{guestId}.gender`
- squad/session player records where that guest is added

Session player records may also carry gender for both registered and guest players where the server action has access to it. This keeps future scheduling work close to the session roster without needing extra profile reads.

## UX

For signed-in players, extend the existing account dialog from name-only to profile details. The player can edit their name and gender in the same place.

If a signed-in player does not have gender saved, show a modal after login and keep showing it until a value is saved. The modal must clearly state the reason, for example:

> We ask this so DuoRally can support mixed games and balanced session formats later.

For guest players, require gender when an admin adds the guest. Guests do not have a login flow, so the add-guest form is the capture point.

Gender should not be added to public player labels or ranking displays in this release.

## Validation

Server actions must validate that gender is one of the allowed values. Client controls should use a select or segmented control with only the allowed options.

Existing users and players without gender remain valid in stored data, but signed-in users are prompted after login until they complete it. Existing guest records without gender remain valid historical data; newly added guests require gender.

## Out Of Scope

- Changing matchmaking or team balancing.
- Adding mixed-game group settings.
- Backfilling gender for existing guest players.
- Displaying gender in rankings, scoreboards, or public player views.

## Acceptance Criteria

- Signed-in users can save gender from account/profile settings.
- Signed-in users without gender see a clear login prompt until they save a value.
- Admin add-guest flows require gender.
- Gender is stored on the canonical player/profile records needed for future scheduling.
- Existing active sessions and historical results are preserved.
