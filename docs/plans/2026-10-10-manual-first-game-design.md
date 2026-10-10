# Manual First-Game Confirmation Design

## Goal

When manual court progression is enabled, the organiser must explicitly start every game, including the first game on each court.

## Current behavior

The live organiser page generates the initial schedule and immediately activates the session. The existing manual progression path only pauses after a completed game and exposes a “Start next game” control.

## Approved behavior

The existing setting remains the switch. In manual mode, starting a session creates the initial player/court schedule but does not expose those games as immediately playable. Each court displays a start control. The organiser starts each court independently; the same rebalance path is used for first and later games. In automatic mode, initial games and subsequent games continue to start automatically.

The setting copy changes to “Ask before starting each game” with supporting text that explicitly includes the first game. No match data is deleted or rewritten by this change.

## Error handling and safeguards

Existing permissions, busy-state guards, court scoping, and rebalance errors remain authoritative. A failed manual start leaves the court waiting and displays the existing action error.

## Validation

Verify the generated schedule, session status, per-court start controls, and automatic-mode behavior with focused tests or static checks. Run the release preflight on a clean `main` branch before pushing and verify the resulting Vercel deployment reaches `READY`.
