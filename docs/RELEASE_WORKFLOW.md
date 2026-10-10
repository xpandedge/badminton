# AI release workflow

Production releases come from the pushed `main` commit. An AI agent must not deploy a local folder directly when it contains any uncommitted or untracked file.

## Every feature

Start from a clean `main` and create an isolated worktree:

```powershell
git fetch origin
git worktree add ..\feature-name -b feature/feature-name origin/main
```

Implement and test only inside that worktree. Commit the reviewed feature, push the branch, and merge it through a pull request. Keep the `main` checkout untouched while feature work is in progress.

## Every release

After the pull request is merged, use a fresh checkout of `main` and run:

```powershell
pwsh -File scripts\preflight-release.ps1
```

The script refuses to continue when the tree is dirty, the branch is not `main`, or the local commit is not exactly the commit on `origin/main`. Vercel production should be triggered by the Git integration from that pushed commit.

Record the commit SHA, Vercel deployment ID, aliases, READY status and the routes checked in the release note. Never reset, clean or delete a dirty worktree to make the preflight pass. Preserve it as a patch or backup branch and classify it separately.

## Recovery

When production and source disagree, create a fresh recovery worktree from `origin/main`, preserve the dirty worktree first, compare deployment evidence by feature, and merge only verified changes. Keep the previous production deployment available for rollback until the recovered release is checked.
