# DuoRally TV and Google Cast setup

## Routes
- `/tv`: open on the television browser to create a pairing code.
- `/board/<existing-board-code>/connect`: open on the organiser's phone to claim a TV or start Google Cast.
- `/board/<existing-board-code>/tv`: direct read-only TV layout using existing public-board access.
- `/cast/receiver`: dedicated Google Cast Custom Web Receiver URL. Register the complete **hosted HTTPS URL**, not localhost.
- `/tv/demo`: fictional rehearsal for layout and rotation only.

## Google Cast Developer Console
Select Custom Receiver. Name: **DuoRally**. Receiver Application URL: the hosted origin plus `/cast/receiver`. Guest Mode unchecked, Google Cast for Audio unchecked, Android TV Package Name blank.

After saving, copy the Application ID into the deployment environment variable `NEXT_PUBLIC_GOOGLE_CAST_APP_ID`, then redeploy. The sender is intentionally disabled while this value is absent. Register development receiver devices under the same Google developer account for unpublished-app testing. Follow Google guidance for device registration/reboot.

The receiver URL must be publicly reachable without Vercel authentication. A protected preview cannot be loaded by the Chromecast. Prefer a stable dedicated preview alias or the production domain after explicitly approved production deployment. Do not disable deployment protection without approval.

The current web sender uses Google Cast's browser SDK; it does not provide native iPhone-to-Chromecast casting. iPhone users can use TV-browser pairing or compatible AirPlay mirroring. Native iOS Cast integration is separate work.

## Access and lifetime
Pairing challenge: eight hex characters, ten minutes, one atomic claim. The claim requires a signed-in group owner/admin. Display token: random 256-bit capability; only its hash is stored. It expires after twelve hours and grants read-only board access. Neither pairing nor Cast transmits the score code to the receiver. Turning the session board off denies subsequent display reads. Receiver polls every fifteen seconds once connected; pending pairings poll every three seconds.

Firestore denies client access to `tvDisplays` and `tvPairCodes` through the default deny-all rule. Server expiry is enforced independently of cleanup. Configure Firestore TTL on each collection's `deleteAfter` field for automatic cleanup; without TTL, expired documents remain stored but grant no access.

## Physical-device test checklist
Record TV model, firmware, sender OS/browser, receiver generation and network. Use a test session with fictional players.
1. TV browser: open `/tv`; claim using an organiser account; verify an ordinary member cannot claim it.
2. Cast: register the actual device, enable the issued App ID, use a supported sender on the same Wi-Fi, select the receiver and verify the board appears.
3. Check 2/4/6 courts, long names, six simultaneous new assignments, pause, session end, stale banner, and board access revocation.
4. Lock or disconnect the sender. Browser/receiver playback should continue independently; mirroring is not expected to do so.
5. Disconnect and restore TV internet, restart TV/receiver, and confirm clear recovery or re-pair instructions.
6. Run for three hours, check viewing-distance readability and device sleep behaviour.

Desktop and SDK-mock tests do not certify physical Chromecast, Samsung/LG browsers or AirPlay.
