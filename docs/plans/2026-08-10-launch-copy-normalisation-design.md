# Launch Copy Normalisation Design

## Goal

Make DuoRally's launch copy sound like a client-facing product instead of an internal spec or database model.

## Approved Direction

Use **Squads** as the single user-facing word for the group/team concept. Routes, data models and server actions may continue using `groups` and `squads` internally until a later source-level refactor, but visible navigation, headings, CTAs and guide copy should say Squad or Squads consistently.

Translate raw states into player-readable labels:

- `draft`: Not started
- `scheduled`: Upcoming
- `active`: Playing now
- `paused`: Paused
- `completed`: Finished
- `cancelled`: Cancelled

## Landing

The landing page should lead with the organiser/player outcome, not the internal PRD codename or implementation guarantees. It should avoid phrases such as "Session Chaos Killer" and avoid database-level promises such as "rebalance without touching completed games."

## Court Booking

Court booking is client-facing work. The page should feel like a direct customer workflow:

- Lead with "Where do you want to play?"
- Let users choose sport and search by suburb or venue.
- Drop vanity venue counters.
- Drop the `bestFor` taxonomy chips.
- Keep each venue card practical: venue name, suburb/area, short note, sport labels and booking links.

## Help

Help copy should say the tap, not the mechanism. It should use labels that exist in the app now:

- Start Playing
- Shuffle Next Games
- Squads

Avoid spec-like headings such as "Session rule" and copy like "DuoRally builds court assignments correctly."

## Verification

- Search for the known stale phrases and confirm they are gone from live app copy.
- Typecheck the web app.
- Review the diff to ensure changes stay in copy/UI files and do not rename data models.
