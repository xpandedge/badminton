# Home Session RSVP Design

## Goal

Let every squad member RSVP from Home so the session roster is ready before game day.

## Behaviour

- Home lists upcoming sessions from every squad the signed-in user belongs to, even before they RSVP.
- Each draft or scheduled session card shows a Going / Not going segmented control.
- Going adds or reactivates the signed-in user's registered squad player in the session roster.
- Not going marks that session player unavailable when a roster record exists.
- RSVP controls disappear after play starts; active and completed cards retain their normal session actions.
- Owners and admins can RSVP as players independently of their management role.
- The selected state updates immediately and rolls back if the server rejects the change.
- Existing player identity, skill and statistics are preserved when an RSVP changes.

## Data Integrity

- RSVP status, roster membership and aggregate counts update in one Firestore transaction.
- Registered squad players use their account ID, preventing duplicate session-player records.
- RSVP changes are rejected once a session is active, completed or cancelled.
