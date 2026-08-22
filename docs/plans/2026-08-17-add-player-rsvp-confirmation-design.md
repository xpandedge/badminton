# Add Player RSVP Confirmation Design

## Goal

When an organiser/admin adds a squad player to a session, that player should also be marked as confirmed for that session.

## Recommended Approach

Use the existing `addGroupMemberToSession(sessionId, targetPlayerId)` server action as the single source of truth. It is already called by the session roster page, the live setup page, self-join, and Add all. Updating this action keeps the UI simple: if an organiser puts someone into "In this session", DuoRally treats that as confirmed attendance.

## Behaviour

- Adding a regular squad player writes an RSVP response of `in` and status `going`.
- Adding a casual squad player writes an RSVP response of `casual_joined` and status `going`.
- The RSVP doc records `adminOverride: "confirmed"` and `adminOverrideBy` so the roster shows it was organiser-confirmed.
- Existing RSVP counters are adjusted only when the saved RSVP status changes.
- If the player is already in the session, the current duplicate error stays unchanged.
- Removing a player from the session does not automatically mark them away, because roster adjustments and attendance changes are separate admin decisions.

## UI

No new controls are needed. The existing `Add` and `Add all` buttons keep their current placement and copy. The result is easier to understand: adding a player to the session means they are in.

## Verification

Run the web TypeScript check after implementation. If existing tests are available for session player actions, add or update a focused test for RSVP creation/counting.
