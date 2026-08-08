# Service layer (PRD §17)

Firestore/Auth calls live here, **never** scattered in components. Keeps the app
testable and the Postgres migration (PRD §29) manageable.

```
firebase/   client init + emulator wiring
auth/       sign-in, sign-out, profile, role resolution (DELTA_SPEC D5)
groups/     create/manage groups, members, venues, courts
players/    group players (manual + guest)
sessions/   create/edit session, join flow, live watchers
leaderboard/ read-model helpers
audit/      audit-log readers
match/      READ-ONLY engine helpers for UI preview (DELTA_SPEC D3 —
            authoritative generation happens server-side in Cloud Functions)
```

Rule (DELTA_SPEC D3): the web app may *preview/estimate* using
`@picklebaddies/match-engine`, but committing a schedule always goes through the
`generateSchedule` / `rebalanceSession` Cloud Functions.
