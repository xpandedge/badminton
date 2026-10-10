# Vercel functional recovery design

Approved approach: preserve existing work, reconstruct verified production functionality on a clean recovery branch, then classify the remaining changes. The user cannot enumerate the features; discovery is part of the work.

## Scope and outcome

Cover the Vercel website, including its Next.js server actions and dependencies. Firebase rules, indexes, functions and infrastructure changes are outside scope. Main must retain verified production functionality. Every leftover change must have a recorded disposition and recoverable copy before cleanup.

## Evidence and recovery

Capture the current domain-to-deployment mapping, deployment ID, available uploaded source, build metadata and relevant previous task records. A Git SHA attached to a dirty CLI deployment does not identify its complete source. If source retrieval is unavailable, combine historical source snapshots with behavioural checks and explicitly retain uncertainty.

Compare production evidence, committed main and local work at feature and hunk level. Preserve committed features when local changes remove them unless evidence establishes an intentional removal. Classify each item as recover, keep, fix separately, delete candidate or uncertain/preserve. Include dependencies rather than cherry-picking UI alone.

Before editing application code, preserve Git refs and objects, index state, staged and unstaged patches, untracked source and relevant ignored files. Store credentials/configuration privately, never in committed documentation. Verify backup hashes and a sample restoration. A branch alone is not a backup of dirty work.

Reconstruct on a clean recovery worktree. Validate relevant tests, types, build and preview behaviour. Keep authenticated acceptance and externally dependent behaviour explicitly pending until observed. Use test data, not destructive actions against real sessions.

## Release and cleanup

Inspect automatic deployment behaviour before any push to main. Record the candidate commit and previous production deployment before release. Release only after recovery evidence and preview acceptance are complete and the user has authorized the concrete release. Verify production after release; retain rollback information.

Separate unfinished work onto named branches with notes. Delete candidates require a concrete reviewed list; uncertainty is never grounds for deletion. Do not reset or remove the original dirty worktrees before preservation and reconciliation are verified.

Future production releases must originate from a clean, pushed commit, with a recorded commit SHA and deployment ID. Keep experiments in separate worktrees. This proposal does not itself change CI or deployment settings.
