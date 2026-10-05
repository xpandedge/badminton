# TV display milestone 1

Approved direction: one landscape screen, up to four courts per page, ten-second rotation, and priority for newly confirmed current assignments. Keep dark green, white and lime styling from the reviewed mockup. Two courts use two larger panels.

This milestone adds `/board/[code]/tv`, a link from the public board, and `/tv/demo` with fictional local data for rehearsal. It reuses existing read-only board access; separate display tokens, TV pairing and native Cast receivers are subsequent milestones. No native casting capability is implied.

Current scheduling uses `scheduled` for current assignments. Display these as **On court**, not **Playing**. Only newly observed current assignments receive a **New assignment / Head to court** announcement, held for twenty seconds of visible display time. Expiry means the announcement finished, not that play started. First load and recovery establish a baseline instead of announcing old assignments. This avoids adding a game-start mutation to the scoring lifecycle.

For round robin, select only the earliest scheduled round across courts, with in-progress matches preferred. For continuous socials select each court's current assignment independently of cycle number. Preserve ten-second page timers across data refreshes. Queue simultaneous new assignments in groups of four; keep each group prominent for twenty seconds, then resume ordinary rotation. Remove cancelled/replaced assignments immediately. Pause announcements during paused, disconnected or stale states.

Use the existing fifteen-second polling interval in milestone 1 to avoid increasing collection reads before the compact cached snapshot milestone. Keep the last board with a stale warning after transient errors. Clear it for explicit revoked/not-found access. Poll serially and reject late updates after unmount. The TV page does not pause fetching solely because a source tab is hidden, since that tab may be cast.

Testing: pure fake-time state-machine tests, browser demo at 720p/1080p/4K, rotation and priority e2e tests, typecheck. Real TVs, Chromecast and AirPlay require physical validation and are not certified by desktop tests.

## Cast console settings supplied by the user
- Name: DuoRally.
- Receiver Application URL: hosted custom receiver URL, still to be built; the TV page alone is not a Cast receiver.
- Guest Mode: unchecked initially.
- Google Cast for Audio: unchecked; this requires a screen.
- Android TV Package Name: blank.
