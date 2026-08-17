# Session RSVP Roster Design

## Goal

Replace the current WhatsApp-style regular/casual attendance list with a live, shareable DuoRally RSVP roster for a specific session.

## Session-Specific Roster

The roster is always tied to one session. It is not a generic squad list.

Every roster view and public RSVP link must show:

- session name
- squad name
- venue name
- date and time
- current capacity settings

Example heading:

`Thursday 13/08, 7pm-9pm at Northside Badminton Brendale`

The page should make it obvious that names are being added for that session only.

## Player Types

Admins can mark signed-in squad players as:

- `regular`
- `casual`

Regular players are expected to play by default. Casual players opt in.

## Squad Defaults And Session Overrides

The squad stores default RSVP settings:

- total player capacity, for example `11`
- casual confirmed slots, for example `3`
- waitlist enabled
- optional RSVP cutoff time

Each new session copies those defaults. Admins can override the values for a specific session because court count, booking length, or organiser preference may change.

## Regular Flow

Regulars are in by default for each eligible session.

They only need to act if they are away:

- default state: `In`
- primary action: `I'm away`
- if away: `I'm back in`

Regulars who mark away release a spot for casuals.

## Casual Flow

Casuals must opt in.

Signed-in casual squad players can RSVP through the app or the shareable session RSVP link.

Name-only casuals can open the same public link and enter their display name. Name entry is open and instant. Anyone with the link can view the roster and add a casual name.

Public casuals can remove themselves through the same page. This is trust-based in v1. No login, email, phone, or removal token is required.

Duplicate casual names are blocked within the same session, case-insensitive. If two people have the same first name, they should enter a clearer display name such as `Sam T`.

## Roster Buckets

The session RSVP page shows display names only, grouped as:

- Regulars in
- Regulars away
- Casuals confirmed
- Casuals waiting

Do not show email, phone, account IDs, or private profile details on the public page.

## Capacity Logic

Casual confirmed capacity equals configured casual slots plus released regular spots, capped by total session capacity.

Example:

- total capacity: `11`
- regulars: `8`
- casual confirmed slots: `3`
- regulars away: `2`
- casuals confirmed can become `5`
- remaining casuals go to waiting

If a regular marks `I'm back in`, the last promoted casual moves back to waiting unless an admin manually overrides the roster.

## Admin Controls

Admins can:

- mark squad players as regular or casual
- configure squad RSVP defaults in the system
- override capacity rules on a specific session
- copy/share the session RSVP link
- promote/demote casuals
- remove name-only casuals
- remove duplicate or inappropriate entries

The admin configuration UI must expose the numbers directly:

- total player capacity
- casual confirmed slots
- waitlist on/off
- optional RSVP cutoff

These values should not be hard-coded. A squad can have recurring defaults, and each session can override them.

## Scheduling Boundary

Only confirmed players should be copied into `sessions/{sessionId}/players` for scheduling.

Waitlisted casuals must not become schedulable players until they are confirmed.

The current live scheduler already excludes `waiting` status from schedulable players, but the RSVP design should still keep intake data separate enough that waitlist entries cannot accidentally appear on court.

## Copy Tone

Use friendly, session-specific language:

- `You're in by default`
- `I'm away`
- `I'm back in`
- `Join casual list`
- `Confirmed`
- `Waiting`
- `This list is for Thursday 13/08 only`

Avoid SaaS/admin wording in player-facing surfaces.
