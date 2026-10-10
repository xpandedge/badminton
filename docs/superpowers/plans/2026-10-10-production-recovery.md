# Vercel Functional Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. These skills are not listed in the current session; locate them before invoking them, or execute the documented audit directly without claiming skill use.

**Goal:** Recover verified website functionality into main and give every remaining change a safe, documented disposition.

**Architecture:** Use an immutable backup and a clean recovery worktree. A feature-level reconciliation register connects production evidence to source changes and acceptance results.

**Tech Stack:** Git, PowerShell, Next.js, TypeScript, Vitest, Vercel deployment evidence and browser checks.

## Global Constraints

- Scope is the Vercel website's functional changes, including Next.js server actions.
- Preserve all existing work before application-code mutation.
- Never equate the current dirty tree or a deployment's recorded Git SHA with the complete deployed source.
- Preserve live court management and locked match invariants in CLAUDE.md and DELTA_SPEC.md.
- No production data mutation for acceptance; use isolated test data.
- Do not push, release or delete until the concrete result and impact have been reviewed and authorized.
- Keep this plan outside processed until every acceptance criterion is satisfied.

### Task 1: Preserve and inventory

**Files:** Create a private backup outside the source tree; update `docs/plans/2026-10-10-production-reconciliation.md` with its location and verification result, never secret contents.

- [x] Inspect `git status --short`, `git worktree list --porcelain`, `git branch -vv`, `git stash list` and recent history.
- [x] Inspect the second registered worktree using a command-local `safe.directory` exception.
- [ ] Capture refs using `git bundle create <backup>/repository.bundle --all`; verify with `git bundle verify <backup>/repository.bundle`.
- [ ] For each worktree, save HEAD, branch, porcelain status, index and binary patches via Git's `--output` argument, separately for `git diff` and `git diff --cached`.
- [ ] Copy existing tracked files and untracked source with literal-path operations; preserve missing-file records. Inventory ignored files and copy irreplaceable configuration privately; exclude regenerable caches/dependencies only after inspection.
- [ ] Record SHA-256 hashes and restore representative tracked, untracked and deleted-file cases into a temporary directory. Confirm contents and staged/unstaged distinctions can be reconstructed.

### Task 2: Establish production evidence

**Files:** Update the reconciliation document with deployment identifiers and evidence references.

- [ ] Identify the deployment serving `duorally.com.au` and `www.duorally.com.au` using authenticated Vercel inspection. The `vercel` command is absent from PATH in this session; use an installed CLI via its actual path or authenticated dashboard access.
- [ ] Record project, team, deployment ID, URL, state, creation time, build settings and Git metadata. Inspect deployment source availability before assuming it can be recovered.
- [ ] Retrieve available uploaded source into a private evidence directory and hash it. Never place credentials in reports.
- [ ] Search relevant previous task records for feature and deployment evidence; preserve timestamps and distinguish historical releases from the currently aliased deployment.
- [ ] Compare source to main and the dirty snapshot. If source is unavailable, identify exactly which behaviours need browser confirmation; do not mark unknown server behaviour verified from visible UI alone.

### Task 3: Complete the reconciliation register

**Files:** `docs/plans/2026-10-10-production-reconciliation.md`.

- [x] Seed the register with functional changes observed in local diffs.
- [ ] Refresh remote refs and compare remote main, local main and other branch commits. Record whether a main push triggers deployment before pushing anything.
- [ ] Review each changed hunk and every untracked source/test/plan file. Assign all changes to a feature or a nonfunctional category; reconcile counts against the snapshot inventory.
- [ ] For each feature record production evidence, main implementation, local differences, dependent files, disposition, confidence and acceptance steps.
- [ ] Treat repeat-session and public RSVP removals as explicit decisions, not incidental cleanup.
- [ ] Flag the stale scheduler branch as outside website scope; retain its unique commit and inspect remaining files before considering worktree removal.

### Task 4: Reconstruct and validate

**Files:** Application paths identified in the register; new regression tests next to affected logic only when necessary.

- [ ] Create `codex/production-recovery-2026-10-10` in a clean worktree from the verified main baseline using `git worktree add -b`.
- [ ] Apply only evidence-supported feature hunks with their complete dependencies. Keep uncertain work in the backup and a separate branch.
- [ ] Run existing court regression tests, relevant session tests, package typechecks and production build using package scripts. Read package.json for exact current commands; record any environment limitations.
- [ ] Add meaningful regression coverage for recovered logic that lacks it: permission boundaries, locked match preservation and failed-action handling.
- [ ] Validate a preview against the feature register: repeat session, bulk add in draft/live, court add/change/enable/disable, swaps, manual next-game flow, completed-session reopening, RSVP and TV links where included in recovered scope.
- [ ] Use emulator/test sessions for state changes; never exercise permanent deletion on real user sessions.
- [ ] Commit reviewed recovery changes in feature groups; inspect staged diffs before every commit.

### Task 5: Release and disposition

**Files:** Reconciliation document and release evidence.

- [ ] Present the exact recovery diff, preview results, unresolved items, prior deployment and release impact for review.
- [ ] Following release authorization, merge/push the verified candidate to main in the required deployment order and verify the resulting deployment and aliases.
- [ ] Verify the included feature acceptance list in production with authorized test data. Retain the old deployment as a rollback target.
- [ ] Move unfinished changes to named branches with fix notes; retain uncertain changes intact.
- [ ] Present exact obsolete branches/worktrees/files proposed for deletion, with proof of preservation. Remove only approved candidates.
- [ ] Verify clean status, remote main parity, backup availability and complete disposition coverage. Move this plan into processed only after all steps pass.
