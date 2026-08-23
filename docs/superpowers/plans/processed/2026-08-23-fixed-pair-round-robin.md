# Fixed-Pair Round Robin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed-pair round robin session format so an organiser can create teams, generate every team-vs-team matchup, score matches, and see a team leaderboard.

**Architecture:** Keep the existing social rotation scheduler unchanged. Add pure round-robin generation in `packages/domain`, persist fixed teams and matches through a new server action, and show team setup/leaderboard in the live organiser page when `sessionFormat` is `fixed_pair_round_robin`.

**Tech Stack:** Next.js 15 App Router, React 19, Firebase Admin/Firestore server actions, Firebase client snapshots, TypeScript, Vitest, `@picklebaddies/domain`.

## Global Constraints

- Existing sessions with no `sessionFormat` behave as social rotation sessions.
- Social rotation schedule generation, rebalance, and auto-fill behavior must remain unchanged.
- Round robin v1 uses fixed teams of exactly two active session players.
- Round robin schedules are generated server-side only.
- Team leaderboard corrections must reverse the old completed score before applying the new score.
- Avoid new dependencies.

---

### Task 1: Pure Round Robin Generator

**Files:**
- Create: `packages/domain/src/round-robin.ts`
- Create: `packages/domain/src/round-robin.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces: `generateFixedPairRoundRobin(input: GenerateFixedPairRoundRobinInput): FixedPairRoundRobinSchedule`
- Produces: `SessionFormat = "social_rotation" | "fixed_pair_round_robin"`

- [ ] Add tests for four teams on two courts: six matches, three display rounds, every matchup once.
- [ ] Add tests for six teams on two courts: fifteen matches, chunked display rounds, no team repeated in a display round.
- [ ] Add tests for odd teams: bye records are emitted and every real matchup still appears once.
- [ ] Implement the circle-method generator with court-count chunking.
- [ ] Export the generator and types from `packages/domain/src/index.ts`.
- [ ] Run `pnpm --filter @picklebaddies/domain test`.

### Task 2: Server Schedule Persistence

**Files:**
- Create: `apps/web/src/server/sessions/round-robin.ts`
- Modify: `apps/web/src/lib/sessions/live.ts`
- Modify: `apps/web/src/server/sessions/actions.ts`

**Interfaces:**
- Consumes: `generateFixedPairRoundRobin`
- Produces: `generateRoundRobinSchedule(data: { sessionId: string; teams: RoundRobinTeamInput[] })`
- Produces: `sessionFormat?: SessionFormat` on created sessions

- [ ] Add optional `sessionFormat` to `CreateSessionInput` and persist `social_rotation` by default.
- [ ] Validate the user can generate schedules for the session squad.
- [ ] Validate the session is draft or scheduled and has no existing schedule.
- [ ] Validate each fixed team has exactly two distinct active players and no player is used twice.
- [ ] Persist `sessions/{sessionId}/roundRobinTeams/{teamId}` docs.
- [ ] Persist generated `matches` docs with existing `teamA`, `teamB`, `teamAIds`, `teamBIds` fields plus round-robin team ids.
- [ ] Seed `teamLeaderboard` docs with zero stats.
- [ ] Write audit and generation-run docs.

### Task 3: Score Team Leaderboard

**Files:**
- Modify: `apps/web/src/server/sessions/score.ts`
- Modify: `apps/web/src/server/sessions/score-link.ts`

**Interfaces:**
- Consumes: match fields `roundRobinTeamAId`, `roundRobinTeamBId`
- Produces: updated `sessions/{sessionId}/teamLeaderboard/{teamId}` rows

- [ ] In normal score entry, read team leaderboard docs when a match has round-robin team ids.
- [ ] On first submission, apply one positive delta to each team.
- [ ] On score edit, reverse the previous payload/winner first, then apply the corrected result.
- [ ] Keep player leaderboard and global player stats unchanged.
- [ ] Skip continuous auto-fill for fixed-pair round robin sessions.

### Task 4: Session Creation And Live UI

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/new/page.tsx`
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`
- Modify: `apps/web/src/lib/sessions/types.ts`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: `generateRoundRobinSchedule`
- Consumes: `watchTeamLeaderboard`

- [ ] Add a session format segmented control with Social session as default and Round robin as the second option.
- [ ] Show a fixed-team builder on the live page before generation for round-robin sessions.
- [ ] Prevent duplicate player selection in team rows.
- [ ] Generate round-robin matches and start the session from the existing Start Playing action.
- [ ] Show team leaderboard rows for round-robin sessions.
- [ ] Keep the existing player leaderboard for social rotation sessions.

### Task 5: Verification, Commit, Push, Deploy

**Files:**
- Modify: plan location after verification to `docs/superpowers/plans/processed/2026-08-23-fixed-pair-round-robin.md`

- [ ] Run `pnpm --filter @picklebaddies/domain test`.
- [ ] Run `pnpm --filter @picklebaddies/domain build`.
- [ ] Run `pnpm --filter @picklebaddies/web build`.
- [ ] Inspect `git diff` for unrelated changes.
- [ ] Commit with a clear message and `Co-Authored-By: Claude Opus 4.8`.
- [ ] Push `main` to origin.
- [ ] Deploy production with Vercel and verify the production alias is READY.
