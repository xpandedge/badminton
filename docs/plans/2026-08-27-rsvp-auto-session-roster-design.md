# RSVP Auto Session Roster Design

## Goal

Automatically keep the pre-session court roster aligned with confirmed RSVP changes so organisers do not need to manually add players before play.

## Scope

This applies to RSVP changes made through the signed-in app and the public session RSVP link while the session status is `draft` or `scheduled`.

- A confirmed regular or casual RSVP creates or reactivates a session player with `status: "active"`.
- A confirmed public casual RSVP creates or reactivates a guest session player with `status: "active"`.
- An RSVP of away, removed, or not going marks an existing session player as `left` rather than deleting it.
- Waiting casuals remain outside the schedulable player roster until confirmed.
- Active and paused sessions are not changed by RSVP actions.

## Admin Controls

The existing live-session controls remain authoritative. Admins can remove a player, re-activate a player, or add a late player as they do today. The existing `Sync confirmed roster` action remains available as a repair/backfill operation for sessions whose RSVP records predate this behavior.

Before play starts, each active player chip in `Get players on court` includes an admin-only `x` control. The control marks that player `removed` through the existing status action, so the player disappears from the active court-ready list while their session history remains intact. The chip control is hidden for active and paused sessions.

## Data Flow

Each RSVP mutation will use the existing Firestore transaction for that mutation and update the related `sessions/{sessionId}/players/{playerId}` document when the session is pre-start. New session players receive the same initial stat fields used by the existing sync and add-player actions. Existing player records retain their IDs and statistics when reactivated or marked left.

The public RSVP path will resolve the session and inspect its status before writing. If the session is active or paused, it will update the RSVP record only. This prevents an RSVP click from changing current or already planned court assignments.

## Error Handling

Missing sessions or players return the existing `ActionResult` errors. Transaction failures continue to surface through the existing action error handling. A failed roster write must fail the RSVP mutation rather than leaving an RSVP that appears confirmed but is absent from the pre-session roster.

## Testing

Add focused server tests covering:

- regular RSVP in creates an active session player;
- regular RSVP away marks the existing session player left;
- public casual RSVP creates and removes the corresponding guest session player;
- waiting casuals are not added as active session players;
- active and paused sessions do not change session players from RSVP actions;
- existing player statistics are retained when a player returns.
