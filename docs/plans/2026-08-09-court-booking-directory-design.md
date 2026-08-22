# Court Booking Directory Design

## Goal

Redesign the court booking page as a fast, mobile-first directory for Brisbane pickleball and badminton venues. The page remains links-only: organisers leave PickleBaddies to reserve and pay on each venue's booking site.

## Approach

Use two sport tabs, Pickleball and Badminton, because organisers usually know which sport they need before choosing a venue. Keep Sam's Indoor Sports Centre and add the researched Brisbane venues alongside it. Venue data stays local to the page because there is no app-owned booking state or Firestore write path.

## UI

Each venue appears as a compact branded booking card with a code-generated logo mark, location, sport tags, short booking note, and direct booking links. Pickleball uses the existing volt accent. Badminton uses the existing blue sport accent. Brand-specific colors are limited to each venue mark and action strip so the page still feels like PickleBaddies.

## Interaction

The tab switch happens client-side with large tap targets. Cards animate lightly on hover/focus and keep links as native anchors opening in a new tab. Mobile layout stacks actions to avoid cramped buttons.

## Verification

Run the web package typecheck after implementation. If possible, run the Next build or inspect locally in browser for mobile spacing.
