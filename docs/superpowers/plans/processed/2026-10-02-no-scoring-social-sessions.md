# No Scoring Social Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a session-level No scoring mode that finishes games without recording wins, while the live session leaderboard shows only games played.

**Architecture:** Extend the shared scoring mode union with `no_scoring`, reuse the existing `completeMatchWithoutScore` server action for live session cards, and sort live leaderboards by participation for this mode. Keep the individual score-link page unchanged so it can continue using the existing score-entry UI.

**Tech Stack:** Next.js App Router, React, TypeScript, Firebase Firestore server actions, `@picklebaddies/domain`.

## Global Constraints

- `DELTA_SPEC.md` overrides the PRD for scoring and session mutation behavior.
- `apps/web/src/server/**` remains the authoritative writer for match completion and leaderboard stats.
- No-scoring live games increment `gamesPlayed` only; they do not increment wins, losses, point difference, or global win/loss stats.
- The individual score-link page stays visually and behaviorally unchanged.
- Preserve unrelated dirty changes in dashboard, live session, and `docs/diagrams/`.

---

### Task 1: Add No Scoring As A Session Mode

**Files:**
- Modify: `packages/domain/src/scoring.ts`
- Modify: `apps/web/src/lib/format/status.ts`
- Modify: `apps/web/src/lib/sessions/types.ts`
- Modify: `apps/web/src/app/(app)/sessions/new/page.tsx`

**Interfaces:**
- Produces: `ScoringMode = "winner_only" | "points" | "no_scoring"`
- Produces: visible dropdown option `No scoring`

- [ ] **Step 1: Update the shared type**

```ts
export type ScoringMode = "winner_only" | "points" | "no_scoring";
export const SCORING_MODES: readonly ScoringMode[] = ["winner_only", "points", "no_scoring"];
```

- [ ] **Step 2: Add the label**

```ts
const SCORING_MODE_LABELS: Record<string, string> = {
  points: "Full Score",
  winner_only: "Win / Loss",
  no_scoring: "No scoring",
};
```

- [ ] **Step 3: Update the session creation state and dropdown**

```tsx
const [scoringMode, setScoringMode] = useState<ScoringMode>("points");
```

Add:

```tsx
<option value="no_scoring">No scoring — finish games only</option>
```

### Task 2: Make Live No-Scoring Sessions Finish Games Without Winners

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`

**Interfaces:**
- Consumes: `finishGameWithoutScore(sessionId: string, matchId: string)`
- Produces: live card button `Finish game`

- [ ] **Step 1: Import the finish helper**

```ts
import { enterScore, finishGameWithoutScore } from "@/lib/sessions/scoring";
```

- [ ] **Step 2: Add a guarded handler**

```ts
const finishWithoutScore = async (matchId: string) => {
  if (scoringMatchIdsRef.current.has(matchId)) return;
  scoringMatchIdsRef.current.add(matchId);
  setScoringMatchIds((current) => new Set(current).add(matchId));
  setActionError(null);
  try {
    await finishGameWithoutScore(sessionId, matchId);
  } catch (err: any) {
    setActionError(err.message);
  } finally {
    scoringMatchIdsRef.current.delete(matchId);
    setScoringMatchIds((current) => {
      const next = new Set(current);
      next.delete(matchId);
      return next;
    });
  }
};
```

- [ ] **Step 3: Render a single action for no-scoring scheduled games**

```tsx
if (session!.scoringMode === "no_scoring" && !isEditing) {
  return <button>Finish game</button>;
}
```

### Task 3: Show Participation-Only Live Leaderboard

**Files:**
- Modify: `apps/web/src/lib/sessions/live.ts`
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`

**Interfaces:**
- Consumes: `watchLeaderboard(sessionId, mode, callback)`
- Produces: participation sorting by `gamesPlayed desc -> displayName`

- [ ] **Step 1: Sort no-scoring rows by games played only**

```ts
if (mode === "no_scoring") {
  lb.sort((a, b) => (b.gamesPlayed ?? 0) - (a.gamesPlayed ?? 0) || String(a.displayName ?? "").localeCompare(String(b.displayName ?? "")));
} else {
  lb.sort((a, b) => leaderboardCompare(a, b, mode));
}
```

- [ ] **Step 2: Change the live leaderboard title and columns**

```tsx
const isNoScoringMode = session.scoringMode === "no_scoring";
```

Show `Games played` instead of rank/wins/losses/win percentage for no-scoring mode.

### Task 4: Verify

**Files:**
- Test: `packages/domain/src/scoring.test.ts`
- Test: `apps/web/tsconfig.json`

- [ ] **Step 1: Run focused domain tests**

Run: `pnpm --filter @picklebaddies/domain test -- scoring.test.ts`

- [ ] **Step 2: Run web typecheck**

Run: `apps/web/node_modules/.bin/tsc.cmd --noEmit -p apps/web/tsconfig.json`

- [ ] **Step 3: Check diff hygiene**

Run: `git diff --check`
