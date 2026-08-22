# Manual Swap Fairness Design

## Goal

Make a manual player replacement count toward future rotation fairness without changing any other game currently displayed.

## Behaviour

- The selected match changes immediately to show the replacement player.
- Every other scheduled match remains unchanged.
- Fairness uses actual completed and currently assigned matches after the swap.
- The incoming player owns the committed game; the outgoing player no longer does.
- If the incoming player had a generated sit-out for that cycle, that sit-out moves to the outgoing player.
- Newly generated games use the engine's lowest game-load selection before grouping players by partners, opponents, and skill.
- A player already assigned to another displayed court cannot be used as a replacement.

## Verification

- Match-engine coverage confirms an overplayed player is excluded when four lower-load players are available.
- TypeScript validates the transactional swap changes.
- Existing continuous scheduling keeps displayed scheduled matches locked in place.
