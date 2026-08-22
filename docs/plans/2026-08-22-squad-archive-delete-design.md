# Squad Archive and Delete Design

## Goal

Give squad owners a destructive action that archives a squad immediately, allows restoration for two days, and permanently purges the squad and its related data after the deadline.

## Scope

- Only the current squad owner can archive or restore a squad.
- Archiving requires the existing danger confirmation dialog.
- Archived squads are hidden from normal squad lists and locked against new members, sessions, and administration.
- The owner can restore the squad during the two-day window.
- A scheduled Firebase cleanup function permanently deletes expired archived squads and their related data.
- Active and historical sessions remain readable during the archive window, then are purged with the squad.

## Data Model

Archived group documents store:

- `archivedAt`: server timestamp when the owner archived the squad.
- `purgeAfter`: server timestamp two days after `archivedAt`.
- `archivedBy`: UID of the owner who archived it.

Restoring clears all three fields. The purge job only processes documents with a `purgeAfter` at or before the current time.

## Security and Integrity

- Server actions re-read the member document and require the caller role to be `owner`.
- Archived squads reject mutations and new membership changes.
- Purge is idempotent and deletes in bounded batches so retries do not recreate or partially restore data.
- Existing completed results remain untouched until the owner lets the two-day window expire.

## User Experience

- Owner sees **Archive squad** in the squad management surface.
- Confirmation explains that the squad becomes unavailable immediately and will be permanently deleted in two days.
- Archived owner view shows the deadline and a **Restore squad** action.
- Successful archive redirects to the dashboard; successful restore returns the squad to normal.
- Errors use the existing toast pattern.

## Verification

- Server action tests cover owner success, non-owner rejection, archive metadata, restore, and archived mutation rejection.
- Cleanup tests cover expiry filtering, deletion of nested data, and safe repeat execution.
- Web tests cover owner-only rendering, confirmation cancellation, archive success, restore success, and error states.
- Run workspace typecheck and unit tests before committing.
