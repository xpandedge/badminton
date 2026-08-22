# Live Score And Rebalance Safety Design

## Goal

Prevent accidental score submissions on the next visible court card, make the current assignment label clearer, and remove manual shuffle prompts after roster or court changes.

## Approved Behavior

- A visible unscored court card is the current assignment for that court. It may be labelled "Ready to score" instead of "Upcoming".
- Tapping `A Wins`, `B Wins`, or `Save Score` immediately locks that match's score controls in the UI and shows a saving state until the server action finishes.
- Manual player swaps from the dropdown are allowed for the visible unscored card and must not trigger an immediate algorithmic shuffle of that same card.
- When a player or court changes during a live session, DuoRally may refresh future assignments in the background, but it must not disturb currently visible unscored court cards.
- The primary "Shuffle Next Games" live control is removed from organisers' routine workflow.
- The next assignment after a score is entered should still come from the scheduling algorithm and consider the current active player pool.

## Architecture

The live page keeps a small pending-score map keyed by match id. Score buttons and point inputs read that map to disable only the affected card while the submit action is in flight.

Roster and court changes call the existing rebalance entry point without showing a confirmation modal. The server-side rebalance behavior is narrowed so automatic rebalances do not cancel current scheduled court assignments. The existing score transaction remains responsible for creating the next fair assignment when a court is freed.

## Error Handling

If score submission fails, the pending state is cleared and the existing live-page error banner shows the server message. If background rebalance fails after a player or court change, the page keeps the roster/court update and shows the existing error banner.

## Verification

- Typecheck the web app or run the closest available TypeScript check.
- Run a focused live-edit Playwright test when the local Firebase test environment is available.
- Manually inspect the live page code paths for pending score reset on success and failure.
