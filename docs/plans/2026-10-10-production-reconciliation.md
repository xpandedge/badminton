# Production reconciliation: initial local audit

Date: 2026-10-10. Status: preliminary, production not yet verified. Application files have not been changed by this audit. No backup or source recovery has yet been completed.

## Observed repository state

- Local main: `f98c8fd4d4f60de26d8a35c839b34c0c97bc5de4`, one commit ahead of cached origin/main. Remote not refreshed.
- 23 modified tracked files before audit documentation, plus untracked test, diagrams and plans.
- Second worktree: `C:/Users/sanju/AppData/Local/Temp/duorally-cleanup-push-c2d3005`, branch `codex/remove-stale-scheduler-functions`, HEAD `786d0c3`. Status reports widespread tracked deletions and untracked node_modules; do not merge these deletions or assume the directory is safe to remove.
- Other branch: `codex/support-button-deploy`, HEAD `bdd50d1`. Cached tracking state is not proof its changes are disposable.
- No stashes returned by git stash list.
- Linked Vercel project name: picklebaddies. Current domain/deployment mapping has not been verified. Initial inspection failed because vercel is not on PATH.

## Feature register

All production entries remain unknown until deployment evidence is gathered. File paths below are repository-relative.

| Feature | Local evidence relative to HEAD | Preliminary disposition | Key source paths |
|---|---|---|---|
| Bulk guest entry | Added on session detail and live pages | Preserve; verify production and partial failure handling | apps/web/src/app/(app)/sessions/[sessionId]/page.tsx; apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx |
| Repeat session | Committed UI and handlers removed locally; server action still exists | Preserve committed implementation; investigate removal intent | apps/web/src/app/(app)/sessions/[sessionId]/page.tsx; apps/web/src/server/sessions/actions.ts; apps/web/src/lib/sessions/repeat.test.ts |
| Permanent session deletion | New UI, wrapper and recursive server deletion | Preserve candidate; review permissions and aggregate-stat implications without deleting real data | apps/web/src/app/(app)/groups/[groupId]/page.tsx; apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx; apps/web/src/lib/sessions/live.ts; apps/web/src/server/sessions/actions.ts |
| Manual player assignment and cross-court swaps | Creation flag and changes to replacement handling | Preserve candidate; verify locked-match protections and intentional behaviour | apps/web/src/app/(app)/sessions/new/page.tsx; apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx; apps/web/src/server/sessions/players.ts |
| Manual court progression | Flag prevents automatic filling; optional courtId scopes rebalance; next-game handler added | Preserve candidate; verify complete dependency chain | apps/web/src/lib/sessions/types.ts; apps/web/src/lib/sessions/rebalance.ts; apps/web/src/server/sessions/actions.ts; apps/web/src/server/sessions/rebalance.ts; apps/web/src/server/sessions/scheduling.ts |
| Reopen completed sessions | Status transition to active enables manual controls | Preserve candidate; review lifecycle and stats behaviour | apps/web/src/server/sessions/actions.ts; apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx |
| Rebalance confirmations and summary | Several confirmation dialogs and summary state removed | Investigate whether intentional and deployed | apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx |
| Live court clarity and ordering | Single court input, ordering changes, return updated courts from server | Keep committed court management; separately verify these refinements | apps/web/src/components/LiveCourts.tsx; apps/web/src/lib/sessions/courts.ts; apps/web/src/server/sessions/courts.ts; corresponding tests |
| Dashboard action and TV access | Open session label; manager TV link; live TV link opens new tab | Preserve candidate; verify production | apps/web/src/app/(app)/dashboard/page.tsx; apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx |
| Public RSVP restrictions | Known-player join/away and guest removal UI removed; directs users to organiser | Investigate intent; neither restore nor discard automatically | apps/web/src/app/rsvp/[rsvpCode]/page.tsx |
| Other public page changes | Board, marketing routes, sitemap and landing copy modified | Preserve; complete hunk review | apps/web/src/app/board/[code]/page.tsx; apps/web/src/app/pickleball-rotation-app/page.tsx; apps/web/src/app/racquet-sports-rotation-app/page.tsx; apps/web/src/app/sitemap.ts; apps/web/src/components/landing/PainSection.tsx |

## Outstanding evidence

1. Immutable backup and restore verification for both worktrees.
2. Current remote state, production deployment and available source.
3. Full hunk/untracked-file coverage and previous task records.
4. Preview tests and authenticated feature acceptance.
5. Concrete recover/fix/delete decisions. No deletion is approved by this preliminary register.
