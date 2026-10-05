# TV Pairing and Google Cast Implementation Plan

**Goal:** Connect the approved TV renderer from smart-TV browsers and a custom Google Cast receiver.

**Architecture:** Server-issued random read-only display tokens map to sessions in server-only Firestore collections. TV browser opens `/tv`, generates an expiring eight-character pairing code, and an authenticated group owner/admin claims it on `/board/[code]/connect`. A Cast sender uses the same token type and a registered application ID; `/cast/receiver` accepts only a validated token via a custom namespace. Receiver independently polls the board.

**Tech stack:** Next.js server actions, firebase-admin, React, Google Cast Application Framework, Vitest, existing Playwright suite.

## Constraints
- Do not transmit the scoring code to the TV receiver. Store only the display token hash server-side.
- Pairing codes expire in ten minutes, claim once atomically, and are rate limited. Display grants expire after twelve hours and check session boardEnabled on each read.
- Google Cast application ID must be supplied by the user after receiver registration. Never invent an ID.
- TV display, browser pairing and web Cast are distinct from a native iOS sender.
- No physical-device certification without actual hardware testing.
- Deployment defaults to preview; do not change production without explicit production instruction.

## Steps
- [x] Implement and test parsing/claim validation and server actions for creating, claiming and reading grants.
- [x] Reuse existing board data mapping internally after grant checks; no new unauthenticated session-id loader. The server resolves the current scoreCode internally and never returns it to receivers.
- [x] Add browser pairing screen, authenticated phone connection form and live token reader.
- [x] Add Cast receiver SDK bootstrap and web sender with environment-configured receiver ID.
- [x] Run unit, type and browser verification; document hardware and setup checks.
- [x] Prepare a scoped hosted preview, leaving unrelated dirty work out. Record the receiver URL, pending app ID, and protection/access constraints.

## Verification and deployment
- 14 unit tests passed: seven TV scheduling/presentation, three message/claim contracts, four server authorization/grant tests using a Firestore mock.
- Six browser tests passed: four board tests, organiser sign-in rejection, and simulated Cast receiver bootstrap/message validation. The initial connection assertion timed out during cold server-action compilation; a warm rerun with a 30-second allowance passed.
- TypeScript and git diff --check passed.
- Clean archive of HEAD a453669 plus only TV source/test changes deployed as preview. Vercel Linux production build succeeded and deployment reached READY.
- Deployment: dpl_G1GS8KkPRMPR8yLyEWsdQ2Q2Xmnq.
- Preview: https://picklebaddies-pzdq96rz4-xpandedge-6820s-projects.vercel.app
- Receiver on preview: https://picklebaddies-pzdq96rz4-xpandedge-6820s-projects.vercel.app/cast/receiver
- Project protection is `all_except_custom_domains`; this preview requires Vercel login and is not usable by a Chromecast. No protection settings changed and no production deployment performed.
- Proposed production receiver after explicit approval: https://duorally.com.au/cast/receiver
- Google Cast Application ID still needed from the user's registration form. `NEXT_PUBLIC_GOOGLE_CAST_APP_ID` is unset, so the web Cast sender remains disabled.
- Physical TV/Chromecast/AirPlay, real authenticated pairing, and soak testing are outstanding. Preview deployment did not certify them. Firestore TTL cleanup is documented, not configured.

## Approved production release
- User approved production deployment after reviewing the scoped preview.
- The same isolated TV source was built with production configuration and reached READY: `dpl_CgMYgfKsF5zgC5KjZ9oqS7qyK4aC`.
- Deployment: https://picklebaddies-94l663xvj-xpandedge-6820s-projects.vercel.app
- Vercel confirmed alias https://duorally.com.au.
- Browser verified https://duorally.com.au/cast/receiver loads the DuoRally receiver page without a Vercel login. This confirms public routing, not physical Cast operation.
- Receiver Application URL for Google: https://duorally.com.au/cast/receiver
- Application ID is still pending from the user; native casting remains disabled until configured and redeployed.
- No Git push was requested or performed; unrelated dirty workspace work was excluded from the deployment archive.
