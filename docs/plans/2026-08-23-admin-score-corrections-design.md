# Admin Score Corrections Design

## Goal

Allow squad owners to correct completed match scores at any time, allow non-owner admins to correct them while a session is active or paused, preserve ordinary member score entry, and make every correction traceable.

## Design

Completed match cards show an `Edit score` action to owners at any time and to non-owner admins while the session is active or paused. The existing score controls are reused for the correction, and the server remains authoritative: a completed match is accepted only when the caller is an owner, or is an admin-level caller while the session is active/paused. Cancelled matches remain immutable.

Every correction transaction subtracts the previous result from session and global player aggregates before applying the replacement result, updates the match, and writes a session audit log containing the old and new result plus the editor UID, display name, and initials. The match also stores the latest correction metadata so the live results card can show an info icon with a hover/focus description without loading a second data source.

## Verification

Add server-focused tests for member rejection and admin correction metadata, then run the web typecheck and tests. Confirm the existing member score-entry path remains unchanged.
