# Squad Grade Rankings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-squad player grades that reward wins against stronger doubles teams and penalise losses against weaker doubles teams.

**Architecture:** Put the rating math in `@picklebaddies/domain` as a pure Elo-style module, then call one shared server helper from both authenticated score entry and score-link score entry. Store each squad player's rollup on `groups/{squadId}/players/{playerId}` and render a new Squad Rankings table inside the squad page.

**Tech Stack:** TypeScript, Next.js App Router, Firebase Admin SDK transactions, Firestore, Vitest, existing inline DuoRally styles.

## Global Constraints

- Grades are per squad only in this version.
- Everyone starts at neutral rating `1000`, visible grade `C`.
- Grade scale is `A+`, `A`, `B+`, `B`, `C+`, `C`, `D+`, `D`; do not show `F`.
- A player is provisional until `3` graded games in that squad.
- Winner-only results affect grades; point scores are optional.
- Doubles rating uses average team strength, including the player's partner and both opponents.
- Both authenticated scoring and public score-link scoring must update squad grades consistently.
- Keep guests and session-only players from breaking the rollup; only write to existing squad-player docs.
- Preserve existing `/groups` routes and Firestore collection names.

---

## File Structure

- Create `packages/domain/src/squad-rating.ts`: pure rating, grade, and provisional helpers.
- Create `packages/domain/src/squad-rating.test.ts`: pure domain tests for rating changes and grade boundaries.
- Modify `packages/domain/src/index.ts`: export the new rating helpers.
- Create `apps/web/src/server/sessions/squad-rating.ts`: Firestore transaction helper for applying a match result to squad-player docs.
- Modify `apps/web/src/server/sessions/score.ts`: call the shared helper in authenticated scoring transactions.
- Modify `apps/web/src/server/sessions/score-link.ts`: call the shared helper in public score-link scoring transactions.
- Modify `apps/web/src/app/(app)/groups/[groupId]/page.tsx`: add the Squad Rankings table using `groups/{squadId}/players` rollup fields.
- Modify `apps/web/src/app/globals.css`: adjust responsive grid columns if the inline table needs mobile support.

### Task 1: Pure Squad Rating Module

**Files:**
- Create: `packages/domain/src/squad-rating.ts`
- Create: `packages/domain/src/squad-rating.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: no app or Firestore code.
- Produces:
  - `SQUAD_RATING_START = 1000`
  - `SQUAD_RATING_PROVISIONAL_GAMES = 3`
  - `type SquadGrade = "A+" | "A" | "B+" | "B" | "C+" | "C" | "D+" | "D"`
  - `gradeFromSquadRating(rating: number): SquadGrade`
  - `isSquadGradeProvisional(gradedGames: number): boolean`
  - `applyDoublesRatingResult(input: DoublesRatingInput): DoublesRatingResult`

- [ ] **Step 1: Write the failing rating tests**

Create `packages/domain/src/squad-rating.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SQUAD_RATING_PROVISIONAL_GAMES,
  SQUAD_RATING_START,
  applyDoublesRatingResult,
  gradeFromSquadRating,
  isSquadGradeProvisional,
} from "./squad-rating.js";

describe("squad rating", () => {
  it("starts neutral at grade C and is provisional before 3 graded games", () => {
    expect(SQUAD_RATING_START).toBe(1000);
    expect(gradeFromSquadRating(SQUAD_RATING_START)).toBe("C");
    expect(SQUAD_RATING_PROVISIONAL_GAMES).toBe(3);
    expect(isSquadGradeProvisional(0)).toBe(true);
    expect(isSquadGradeProvisional(2)).toBe(true);
    expect(isSquadGradeProvisional(3)).toBe(false);
  });

  it("gives underdog winners a bigger gain than favourite winners", () => {
    const underdog = applyDoublesRatingResult({
      teamARatings: [920, 940],
      teamBRatings: [1100, 1120],
      winnerTeam: "A",
    });
    const favourite = applyDoublesRatingResult({
      teamARatings: [1100, 1120],
      teamBRatings: [920, 940],
      winnerTeam: "A",
    });

    expect(underdog.teamADelta).toBeGreaterThan(favourite.teamADelta);
    expect(favourite.teamADelta).toBeGreaterThan(0);
  });

  it("penalises losing to a weaker team more than losing to a stronger team", () => {
    const lostToWeaker = applyDoublesRatingResult({
      teamARatings: [1120, 1100],
      teamBRatings: [940, 920],
      winnerTeam: "B",
    });
    const lostToStronger = applyDoublesRatingResult({
      teamARatings: [940, 920],
      teamBRatings: [1120, 1100],
      winnerTeam: "B",
    });

    expect(Math.abs(lostToWeaker.teamADelta)).toBeGreaterThan(Math.abs(lostToStronger.teamADelta));
  });

  it("maps rating boundaries to visible grades", () => {
    expect(gradeFromSquadRating(1300)).toBe("A+");
    expect(gradeFromSquadRating(1210)).toBe("A");
    expect(gradeFromSquadRating(1130)).toBe("B+");
    expect(gradeFromSquadRating(1060)).toBe("B");
    expect(gradeFromSquadRating(1010)).toBe("C+");
    expect(gradeFromSquadRating(960)).toBe("C");
    expect(gradeFromSquadRating(880)).toBe("D+");
    expect(gradeFromSquadRating(820)).toBe("D");
  });
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```bash
pnpm --filter @picklebaddies/domain exec vitest run src/squad-rating.test.ts
```

Expected: FAIL because `squad-rating.ts` does not exist.

- [ ] **Step 3: Implement the pure rating module**

Create `packages/domain/src/squad-rating.ts`:

```ts
export const SQUAD_RATING_START = 1000;
export const SQUAD_RATING_K_FACTOR = 32;
export const SQUAD_RATING_PROVISIONAL_GAMES = 3;

export type SquadGrade = "A+" | "A" | "B+" | "B" | "C+" | "C" | "D+" | "D";

export interface DoublesRatingInput {
  teamARatings: [number, number];
  teamBRatings: [number, number];
  winnerTeam: "A" | "B";
}

export interface DoublesRatingResult {
  teamADelta: number;
  teamBDelta: number;
  nextTeamARatings: [number, number];
  nextTeamBRatings: [number, number];
}

function averagePair(values: [number, number]): number {
  return (values[0] + values[1]) / 2;
}

function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

export function gradeFromSquadRating(rating: number): SquadGrade {
  if (rating >= 1280) return "A+";
  if (rating >= 1200) return "A";
  if (rating >= 1120) return "B+";
  if (rating >= 1040) return "B";
  if (rating >= 1000) return "C+";
  if (rating >= 920) return "C";
  if (rating >= 860) return "D+";
  return "D";
}

export function isSquadGradeProvisional(gradedGames: number): boolean {
  return gradedGames < SQUAD_RATING_PROVISIONAL_GAMES;
}

export function applyDoublesRatingResult(input: DoublesRatingInput): DoublesRatingResult {
  const teamA = averagePair(input.teamARatings);
  const teamB = averagePair(input.teamBRatings);
  const teamAScore = input.winnerTeam === "A" ? 1 : 0;
  const teamBScore = input.winnerTeam === "B" ? 1 : 0;
  const teamADelta = Math.round(SQUAD_RATING_K_FACTOR * (teamAScore - expectedScore(teamA, teamB)));
  const teamBDelta = Math.round(SQUAD_RATING_K_FACTOR * (teamBScore - expectedScore(teamB, teamA)));

  return {
    teamADelta,
    teamBDelta,
    nextTeamARatings: [input.teamARatings[0] + teamADelta, input.teamARatings[1] + teamADelta],
    nextTeamBRatings: [input.teamBRatings[0] + teamBDelta, input.teamBRatings[1] + teamBDelta],
  };
}
```

- [ ] **Step 4: Export the rating module**

Add this line to `packages/domain/src/index.ts`:

```ts
export * from "./squad-rating.js";
```

- [ ] **Step 5: Verify the domain tests**

Run:

```bash
pnpm --filter @picklebaddies/domain exec vitest run src/squad-rating.test.ts
```

Expected: PASS.

### Task 2: Shared Server Rating Transaction Helper

**Files:**
- Create: `apps/web/src/server/sessions/squad-rating.ts`

**Interfaces:**
- Consumes: `applyDoublesRatingResult`, `gradeFromSquadRating`, `SQUAD_RATING_START`, Firestore transaction `t`, Admin DB `db`, `groupId`, team ids, winner, optional score payload.
- Produces: `applySquadRatingForMatch(t, db, input): Promise<void>` and `SquadRatingMatchInput`.

- [ ] **Step 1: Create the server helper**

Create `apps/web/src/server/sessions/squad-rating.ts`:

```ts
import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import {
  SQUAD_RATING_START,
  applyDoublesRatingResult,
  gradeFromSquadRating,
  type ScorePayload,
} from "@picklebaddies/domain";

export interface SquadRatingMatchInput {
  groupId: string;
  teamAIds: [string, string];
  teamBIds: [string, string];
  winnerTeam: "A" | "B";
  payload: ScorePayload;
}

function pointStatsForPlayer(isTeamA: boolean, payload: ScorePayload): { for: number; against: number; diff: number } {
  if (!("teamAScore" in payload)) return { for: 0, against: 0, diff: 0 };
  const pointsFor = isTeamA ? payload.teamAScore : payload.teamBScore;
  const pointsAgainst = isTeamA ? payload.teamBScore : payload.teamAScore;
  return { for: pointsFor, against: pointsAgainst, diff: pointsFor - pointsAgainst };
}

function baseRating(data: FirebaseFirestore.DocumentData | undefined): number {
  const value = Number(data?.squadRating);
  return Number.isFinite(value) && value > 0 ? value : SQUAD_RATING_START;
}

export async function applySquadRatingForMatch(
  t: Transaction,
  db: Firestore,
  input: SquadRatingMatchInput,
): Promise<void> {
  const allIds = [...input.teamAIds, ...input.teamBIds];
  const refs = allIds.map((playerId) => db.doc(`groups/${input.groupId}/players/${playerId}`));
  const docs = await Promise.all(refs.map((ref) => t.get(ref)));
  const existingIndexes = docs
    .map((doc, index) => ({ doc, index }))
    .filter((entry) => entry.doc.exists);

  if (existingIndexes.length !== 4) return;

  const ratings = docs.map((doc) => baseRating(doc.data()));
  const result = applyDoublesRatingResult({
    teamARatings: [ratings[0]!, ratings[1]!],
    teamBRatings: [ratings[2]!, ratings[3]!],
    winnerTeam: input.winnerTeam,
  });
  const nextRatings = [
    ...result.nextTeamARatings,
    ...result.nextTeamBRatings,
  ];

  for (let index = 0; index < refs.length; index++) {
    const isTeamA = index < 2;
    const isWinner = input.winnerTeam === (isTeamA ? "A" : "B");
    const points = pointStatsForPlayer(isTeamA, input.payload);
    const data = docs[index]!.data() ?? {};
    const nextRating = nextRatings[index]!;
    const nextGames = (Number(data.squadGradedGames) || 0) + 1;

    t.set(refs[index]!, {
      squadRating: nextRating,
      squadGrade: gradeFromSquadRating(nextRating),
      squadGradedGames: nextGames,
      squadWins: (Number(data.squadWins) || 0) + (isWinner ? 1 : 0),
      squadLosses: (Number(data.squadLosses) || 0) + (isWinner ? 0 : 1),
      squadPointsFor: (Number(data.squadPointsFor) || 0) + points.for,
      squadPointsAgainst: (Number(data.squadPointsAgainst) || 0) + points.against,
      squadPointDiff: (Number(data.squadPointDiff) || 0) + points.diff,
    }, { merge: true });
  }
}
```

- [ ] **Step 2: Typecheck the helper**

Run:

```bash
node_modules\\.bin\\tsc.cmd -p apps\\web\\tsconfig.json --noEmit
```

Expected: PASS after the domain package export is available. If pnpm package build output is stale, run the domain build first.

### Task 3: Apply Squad Grades From Authenticated Scoring

**Files:**
- Modify: `apps/web/src/server/sessions/score.ts`

**Interfaces:**
- Consumes: `applySquadRatingForMatch(t, db, input)`.
- Produces: authenticated member score entry updates `groups/{groupId}/players/{playerId}` squad ranking fields for first-time completed matches.

- [ ] **Step 1: Import the helper**

Add this import to `apps/web/src/server/sessions/score.ts`:

```ts
import { applySquadRatingForMatch } from "./squad-rating";
```

- [ ] **Step 2: Call the helper for new completed results**

After `teamAIds`, `teamBIds`, `winnerTeam`, `isEdit`, and `payload` are available, and after the existing stat document reads, add:

```ts
if (!isEdit && teamAIds.length === 2 && teamBIds.length === 2) {
  await applySquadRatingForMatch(t, db, {
    groupId: String(session.groupId),
    teamAIds: [teamAIds[0]!, teamAIds[1]!],
    teamBIds: [teamBIds[0]!, teamBIds[1]!],
    winnerTeam,
    payload,
  });
}
```

Place this before match writes so the helper's reads still happen before transaction writes.

- [ ] **Step 3: Avoid edit drift in the first version**

Keep score edits from applying a second squad rating update by using `!isEdit`. Existing session and global stat edit reversal remains unchanged. Add an inline comment:

```ts
// Squad ratings are append-only for first submission in v1; edit replay is a later integrity task.
```

- [ ] **Step 4: Verify**

Run:

```bash
node_modules\\.bin\\tsc.cmd -p apps\\web\\tsconfig.json --noEmit
```

Expected: PASS.

### Task 4: Apply Squad Grades From Score-Link Scoring

**Files:**
- Modify: `apps/web/src/server/sessions/score-link.ts`

**Interfaces:**
- Consumes: `applySquadRatingForMatch(t, db, input)`.
- Produces: public court score-link winner entry updates the same squad-player ranking fields.

- [ ] **Step 1: Import the helper**

Add this import to `apps/web/src/server/sessions/score-link.ts`:

```ts
import { applySquadRatingForMatch } from "./squad-rating";
```

- [ ] **Step 2: Call the helper for score-link results**

After `teamAIds`, `teamBIds`, and `winnerTeam` are available, and after `playerDocs` and `lbDocs` have been read, add:

```ts
if (teamAIds.length === 2 && teamBIds.length === 2) {
  await applySquadRatingForMatch(t, db, {
    groupId: String(session.groupId),
    teamAIds: [teamAIds[0]!, teamAIds[1]!],
    teamBIds: [teamBIds[0]!, teamBIds[1]!],
    winnerTeam,
    payload,
  });
}
```

Place it before `t.update(matchRef, ...)`.

- [ ] **Step 3: Verify**

Run:

```bash
node_modules\\.bin\\tsc.cmd -p apps\\web\\tsconfig.json --noEmit
```

Expected: PASS.

### Task 5: Render Squad Rankings

**Files:**
- Modify: `apps/web/src/app/(app)/groups/[groupId]/page.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: existing `players` state from `watchGroupPlayers(groupId, ...)` plus new optional fields on each player row.
- Produces: a squad-level rankings section with Grade as the last column.

- [ ] **Step 1: Extend the local player row type**

In `apps/web/src/app/(app)/groups/[groupId]/page.tsx`, add optional fields to the existing `PlayerRow` type:

```ts
squadRating?: number;
squadGrade?: string;
squadGradedGames?: number;
squadWins?: number;
squadLosses?: number;
squadPointsFor?: number;
squadPointsAgainst?: number;
squadPointDiff?: number;
```

- [ ] **Step 2: Build sorted squad ranking rows**

Near the existing derived role/member maps, add:

```ts
const squadRankingRows = [...players]
  .filter((player) => !player.isGuest)
  .map((player) => {
    const played = Number(player.squadGradedGames) || 0;
    const wins = Number(player.squadWins) || 0;
    const losses = Number(player.squadLosses) || 0;
    const pointDiff = Number(player.squadPointDiff) || 0;
    const rating = Number(player.squadRating) || 1000;
    return {
      ...player,
      played,
      wins,
      losses,
      pointDiff,
      rating,
      winPct: played > 0 ? Math.round((wins / played) * 100) : 0,
      grade: player.squadGrade || "C",
      provisional: played < 3,
    };
  })
  .sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    return (a.displayName ?? "").localeCompare(b.displayName ?? "");
  });
```

- [ ] **Step 3: Add the ranking section before Members**

Before the current `{/* Members list */}` section, render a new section headed `Squad Rankings`. Use the grid class `pb-squad-ranking-grid` and columns matching:

```tsx
<span>#</span>
<span>Player</span>
<span style={{ textAlign: "right" }}>Played</span>
<span style={{ textAlign: "right" }}>Won</span>
<span style={{ textAlign: "right" }}>Lost</span>
<span style={{ textAlign: "right" }}>Win%</span>
<span style={{ textAlign: "right" }}>+/-</span>
<span style={{ textAlign: "right" }}>Grade</span>
```

For each row, show a compact grade pill:

```tsx
<span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
  <strong>{row.grade}</strong>
  {row.provisional && (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5625rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
      Provisional
    </span>
  )}
</span>
```

- [ ] **Step 4: Add responsive grid CSS**

In `apps/web/src/app/globals.css`, add:

```css
.pb-squad-ranking-grid {
  display: grid;
  grid-template-columns: 34px minmax(120px, 1fr) repeat(6, minmax(46px, auto));
  gap: 0.5rem;
  align-items: center;
}

@media (max-width: 720px) {
  .pb-squad-ranking-grid {
    grid-template-columns: 30px minmax(92px, 1fr) repeat(2, minmax(44px, auto));
  }

  .pb-squad-ranking-grid > :nth-child(3),
  .pb-squad-ranking-grid > :nth-child(5),
  .pb-squad-ranking-grid > :nth-child(6),
  .pb-squad-ranking-grid > :nth-child(7) {
    display: none;
  }
}
```

On mobile this keeps `#`, `Player`, `Won`, and `Grade` visible.

- [ ] **Step 5: Verify**

Run:

```bash
node_modules\\.bin\\tsc.cmd -p apps\\web\\tsconfig.json --noEmit
```

Expected: PASS. Then inspect `/groups/{groupId}` on a narrow viewport and confirm text does not overlap.

## Self-Review

- Spec coverage: per-squad grades, neutral start, doubles team-average strength, winner-only results, provisional threshold of 3 games, grade scale, and last-column Grade display are covered.
- Placeholder scan: no unfinished marker text or generic "add tests" placeholders remain.
- Type consistency: `applySquadRatingForMatch`, `SquadRatingMatchInput`, `applyDoublesRatingResult`, and `gradeFromSquadRating` are named consistently across tasks.
- Known limitation: score edits do not replay squad Elo in v1. The plan avoids double-applying edits and keeps this limitation explicit for a later integrity task.
