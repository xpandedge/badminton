# Implementation plans

Work is milestone-driven. Each milestone has one plan file here. A plan's **location is its status** — no separate tracker to keep in sync.

```
docs/superpowers/plans/
  2026-06-06-m2-groups-players.md     <- pending / in progress  (lives here)
  ...
  processed/
    2026-06-06-m1-auth-roles.md       <- done & verified        (moved here)
```

## The rule

A plan stays in `plans/` while it is pending or in progress. **When — and only when — every task in it is implemented, all its tests pass, and its acceptance criteria are met, move the file into `plans/processed/`** (preserve the filename). Do it as the final commit of the milestone:

```bash
git mv docs/superpowers/plans/<file>.md docs/superpowers/plans/processed/<file>.md
git commit -m "chore(plans): mark <milestone> processed"
```

So at any moment:
- files in `plans/` = not yet implemented (the backlog),
- files in `plans/processed/` = shipped and verified.

Do **not** move a plan on partial completion. If a milestone is split mid-way, leave it in `plans/` and note progress via the task checkboxes inside the file.

## Order

M0 (foundation) is done. Intended sequence: **M1 → M2 → M3 → M4 → M5 → M6 → M7.** M4 (the match engine) is the risk core — its pure logic can be built in parallel with M2/M3 since it has no Firebase dependency, but everything downstream (M5/M6) depends on it.

## Authoring

New/updated plans follow the `superpowers:writing-plans` format: bite-sized TDD tasks, exact paths, real code, exact commands. Deep detail is refined just-in-time at the top of each milestone; downstream plans capture intent, file structure, signatures, and acceptance mapping, and get sharpened before execution.
