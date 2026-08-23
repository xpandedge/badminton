# Session Auto-Complete Design

## Goal

Prevent sessions from remaining visibly active forever when an organiser forgets to press Complete.

## Design

Record `startedAt` when a session first transitions into `active`; pausing and resuming do not reset it. Extend the existing once-daily `purgeArchivedSquads` scheduled function with a bounded, retry-safe scan that changes only `active` or `paused` sessions at least 24 hours past their start to `completed`. The scan writes a `session_auto_completed` audit entry and leaves match documents, scores, and player statistics unchanged. Existing sessions without `startedAt` use their last `updatedAt` as a conservative migration fallback.

No new scheduled function is introduced. The trade-off is that cleanup happens during the existing daily run, so automatic completion can occur within roughly 24 to 48 hours after the recorded start.

## Verification

Run functions and web typechecks and tests, build the functions package, and verify that the existing daily scheduled export remains the only scheduler changed.
