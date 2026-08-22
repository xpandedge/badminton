# Admin Score Corrections Design

## Goal

Allow squad owners and admins to correct completed match scores while a session is active or paused, while preserving ordinary member score entry and making every correction traceable.

## Design

Completed match cards show an `Edit score` action only to owners/admins during an active or paused session. The existing score controls are reused for the correction, and the server remains authoritative: a completed match is accepted only when the caller has an owner/admin-level group role. Corrections remain blocked after the session is completed.

Every correction transaction subtracts the previous result from session and global player aggregates before applying the replacement result, updates the match, and writes a session audit log containing the old and new result plus the editor UID, display name, and initials. The match also stores the latest correction metadata so the live results card can show an info icon with a hover/focus description without loading a second data source.

## Verification

Add server-focused tests for member rejection and admin correction metadata, then run the web typecheck and tests. Confirm the existing member score-entry path remains unchanged.
