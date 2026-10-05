# Live Courts Implementation Plan

**Goal:** Add and edit courts from the live session.

**Architecture:** A focused client component calls a transactional server action. Pure court-list validation preserves IDs and active counts; existing match snapshots remain unchanged.

**Tech Stack:** Next.js, React, TypeScript, Firebase Admin, Vitest.

## Constraints
- Owners/admins only; active and paused sessions only.
- Keep existing unrelated working-tree edits intact.
- Preserve completed and in-progress matches.

## Tasks
- [x] Add `lib/sessions/courts.test.ts`: exercise addition with inactive courts, identity-preserving rename, invalid numbers, duplicate names/numbers and re-enabling.
- [x] Add `lib/sessions/courts.ts`: export `changeCourts(courts, change, newId)` returning validated court snapshots.
- [x] Add `server/sessions/courts.ts`: authenticated transaction, role/status checks, active count, audit record.
- [x] Add `components/LiveCourts.tsx`: labelled add/edit forms, enable and existing disable actions, busy/error handling, optional update-games callback.
- [x] Replace live court section with component; correct existing disable active count.
- [x] Run focused Vitest and web typecheck; inspect diff. Leave deployment and authenticated browser acceptance explicitly unverified.

Validation: 15 focused tests passed; web TypeScript passed. Committed directly on main and pushed to origin/main as f8ba8d7 on 2026-10-05 (the checkout was already on main, so no separate branch merge was needed). Production deployment dpl_CKEt7PzTyWzja73hrq1HtK4xTPoj reached READY, and duorally.com.au plus www.duorally.com.au were verified as its aliases. The remote production build passed. Authenticated browser acceptance remains unverified; retain this plan here pending that acceptance. Its location does not mean the implementation is uncommitted or safe to remove.
