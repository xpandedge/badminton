# TV Display Implementation Plan

> Execute inline, preserving unrelated workspace edits. Native Cast and pairing are separate milestones.

**Goal:** Deliver the approved four-panel rotating TV board and a safe rehearsal surface.

**Architecture:** Pure presentation state consumes the existing board DTO; a client display polls the existing server action. A fixture-driven demo exercises the same renderer without database writes.

**Tech Stack:** Next.js, React, CSS modules, Vitest, Playwright.

## Constraints
- No scheduler mutations or invented Playing status.
- Existing fifteen-second refresh until cached snapshots are implemented.
- First-load/reconnect snapshots establish a baseline.
- Ten-second ordinary pages; twenty-second priority groups; four panels maximum.
- No native Cast, pairing, deployment or hardware certification in this milestone.

## Tasks
- [x] Extend board DTO with optional round ordering and availability without changing phone-board behaviour.
- [x] Write failing tests for `currentTvMatches`, `advanceTv`, and `tvPage` in `apps/web/src/lib/sessions/tv.test.ts`: six-court rotation, simultaneous assignments, refresh stability, cancellation, future rounds and recovery baseline.
- [x] Implement pure TV state in `apps/web/src/lib/sessions/tv.ts` and rerun Vitest.
- [x] Add shared `TvBoard` renderer and CSS, live route, demo route, and public-board entry link.
- [x] Add browser checks for demo rotation, interruptions, pause, disconnect and viewport overflow; run typecheck and targeted tests.
- [x] Record actual verification and hardware checklist. Keep this plan unprocessed until venue acceptance.

## Local verification, 2026-10-03
- Seven pure logic tests passed, including a regression ensuring later announcements receive twenty seconds each.
- Four Playwright browser tests passed: timed rotation/priority/reconnect/pause and 720p/1080p/4K layout checks.
- Web TypeScript check passed. Visual inspection confirmed the two-court layout and rehearsal footer fit.
- Initial rerun was blocked by an approval-system usage limit; retry after the user's continue instruction succeeded.
- A subsequent run encountered missing Next.js development assets (404s); restarting the local server restored the assets and all four browser tests passed.
- Actual television, native Cast, AirPlay, production session access, access-revocation integration and three-hour soak tests remain unverified.
- Not deployed. Local preview: http://127.0.0.1:3000/tv/demo. Session route: /board/[code]/tv, reachable from Show on TV on the public board.
- Native Cast receiver URL does not exist yet. Do not use the TV route as the receiver URL in the Cast console.

## Hardware acceptance
Record model, OS/firmware, connection method and network for each trial. Test built-in Samsung/LG browsers, physical Google Cast receiver with supported sender, Android mirroring and iPhone AirPlay separately. Verify pairing only when milestone 2 exists, Cast launching only when milestone 3 exists. Run three hours, disconnect Wi-Fi, replace assignments, pause, end session, lock sender and reconnect. Check real viewing-distance legibility. Desktop simulation cannot certify any of these devices.
