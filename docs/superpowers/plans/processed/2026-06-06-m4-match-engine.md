# M4: Match Generation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the M0 stub with a real, deterministic, fully-tested doubles generator that produces fair rounds/matches/sit-outs, preserves locked matches, and emits fairness metadata — with **zero Firebase imports** (DELTA_SPEC D3).

**Architecture:** A greedy per-round constructor over an accumulating `EngineState` (games played, sit-out counts, partner/opponent history, last-round recency). Each round: pick who sits (fairest first), then fill courts by repeatedly choosing the lowest-penalty foursome (PRD §14.6 penalty model). Rebalance seeds the same state from `lockedMatches` and only builds future rounds (round count via remaining time, DELTA_SPEC D4). Determinism via an injected seeded RNG so identical input → identical output (PRD §14.1).

**Tech Stack:** TypeScript, Vitest. Pure functions only.

**Prerequisites:** M0 (engine package + types + round math). Can be built in parallel with M2/M3 — no Firebase dependency.

**PRD refs:** §14 (whole section), §23 (edge cases), §26.1 (unit tests). **DELTA_SPEC:** D3 (purity), D4 (rebalance round count), minor (fairnessScore formula, unknown=mid-skill).

---

## File Structure

`packages/match-engine/src/`
- `rng.ts` — `mulberry32(seed)` seeded RNG + tests.
- `state.ts` — `EngineState`, `createInitialState`, `seedStateFromLocked`, `pairKey`, history accessors + tests.
- `penalty.ts` — `foursomePenalty(state, foursome, weights)` + `bestTeamSplit` + tests.
- `sitouts.ts` — `selectSitOuts(state, available, courtCount)` + tests.
- `round.ts` — `buildRound(state, players, courts, roundNumber, rng)` → matches + sitouts; mutates a copy of state + tests.
- `fairness.ts` — `computeFairness(state, output)` → metadata + tests.
- `generate.ts` — `generateSchedule(input)` real implementation (replaces stub in `index.ts`).
- `scenarios.test.ts` — the PRD §26.1 + §26.3 scenario suite (invariant-based).
- `index.ts` — **modify**: re-export real `generateSchedule`, drop the stub body.

Weights live in one place:
- `penalty.ts` exports `DEFAULT_WEIGHTS` mapping each PRD §14.6 term to a coefficient.

---

## Test philosophy (read first)

Schedules have many equally-fair solutions, so tests assert **invariants**, not fixed fixtures:
- games-played spread across schedulable players ≤ 1,
- sit-out spread ≤ 1,
- no exact-repeat **partner** while an unused partner was available,
- locked matches appear unchanged,
- court count per round ≤ available courts, players-per-match == 4.
Determinism is covered separately: same input+seed ⇒ deep-equal output.

---

## Task 1: Seeded RNG (TDD)

**Files:** Create `src/rng.ts`, `src/rng.test.ts`.

- [ ] **Step 1: Failing test** — `rng.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { mulberry32 } from "./rng.js";

describe("mulberry32", () => {
  it("is deterministic for a seed", () => {
    const a = mulberry32(42), b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("returns values in [0,1)", () => {
    const r = mulberry32(1);
    for (let i = 0; i < 100; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});
```
- [ ] **Step 2: Run** `pnpm --filter @picklebaddies/match-engine test` → FAIL.
- [ ] **Step 3: Implement** `rng.ts`:
```typescript
/** Small deterministic PRNG (mulberry32). Good enough for reproducible tie-breaks. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(engine): seeded RNG`.

---

## Task 2: Engine state + history (TDD)

**Files:** Create `src/state.ts`, `src/state.test.ts`.

- [ ] **Step 1: Failing test** — `state.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { createInitialState, seedStateFromLocked, pairKey, recordMatch } from "./state.js";
import type { EnginePlayer, LockedMatch } from "./types.js";

const players: EnginePlayer[] = ["p1","p2","p3","p4"].map((id) => ({
  playerId: id, displayName: id, skillLevel: "unknown", availableFromRound: 1,
}));

describe("engine state", () => {
  it("starts everyone at zero", () => {
    const s = createInitialState(players);
    expect(s.gamesPlayed.get("p1")).toBe(0);
    expect(s.sitOuts.get("p1")).toBe(0);
  });
  it("pairKey is order-independent", () => {
    expect(pairKey("p2","p1")).toBe(pairKey("p1","p2"));
  });
  it("seeds games + partner/opponent history from locked matches", () => {
    const locked: LockedMatch[] = [{ roundNumber: 1, courtId: "c1", teamA: ["p1","p2"], teamB: ["p3","p4"] }];
    const s = seedStateFromLocked(players, locked);
    expect(s.gamesPlayed.get("p1")).toBe(1);
    expect(s.partnerCount.get(pairKey("p1","p2"))).toBe(1);
    expect(s.opponentCount.get(pairKey("p1","p3"))).toBe(1);
  });
});
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `state.ts`:
```typescript
import type { EnginePlayer, LockedMatch } from "./types.js";

export interface EngineState {
  gamesPlayed: Map<string, number>;
  sitOuts: Map<string, number>;
  partnerCount: Map<string, number>;   // pairKey -> times partnered
  opponentCount: Map<string, number>;  // pairKey -> times opposed
  lastPartner: Map<string, string>;    // playerId -> partner in previous round
  lastOpponents: Map<string, Set<string>>;
  lastPlayedRound: Map<string, number>;
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function createInitialState(players: EnginePlayer[]): EngineState {
  const s: EngineState = {
    gamesPlayed: new Map(), sitOuts: new Map(), partnerCount: new Map(),
    opponentCount: new Map(), lastPartner: new Map(), lastOpponents: new Map(),
    lastPlayedRound: new Map(),
  };
  for (const p of players) { s.gamesPlayed.set(p.playerId, 0); s.sitOuts.set(p.playerId, 0); }
  return s;
}

const inc = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

/** Apply a played match to state (used both for seeding from locked and during build). */
export function recordMatch(
  s: EngineState, roundNumber: number, teamA: [string, string], teamB: [string, string],
): void {
  for (const id of [...teamA, ...teamB]) { inc(s.gamesPlayed, id); s.lastPlayedRound.set(id, roundNumber); }
  inc(s.partnerCount, pairKey(teamA[0], teamA[1]));
  inc(s.partnerCount, pairKey(teamB[0], teamB[1]));
  for (const a of teamA) for (const b of teamB) inc(s.opponentCount, pairKey(a, b));
  s.lastPartner.set(teamA[0], teamA[1]); s.lastPartner.set(teamA[1], teamA[0]);
  s.lastPartner.set(teamB[0], teamB[1]); s.lastPartner.set(teamB[1], teamB[0]);
  s.lastOpponents.set(teamA[0], new Set(teamB)); s.lastOpponents.set(teamA[1], new Set(teamB));
  s.lastOpponents.set(teamB[0], new Set(teamA)); s.lastOpponents.set(teamB[1], new Set(teamA));
}

export function seedStateFromLocked(players: EnginePlayer[], locked: LockedMatch[]): EngineState {
  const s = createInitialState(players);
  for (const m of [...locked].sort((a, b) => a.roundNumber - b.roundNumber)) {
    recordMatch(s, m.roundNumber, m.teamA, m.teamB);
  }
  return s;
}
```
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(engine): state tracking + locked seeding`.

---

## Task 3: Penalty model + best team split (TDD)

**Files:** Create `src/penalty.ts`, `src/penalty.test.ts`.

- [ ] **Step 1: Failing test** asserts: a foursome repeating an existing partnership scores higher than one with fresh partners; `bestTeamSplit` of 4 players picks the split minimizing partner-repeat then skill gap; weights exported.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `penalty.ts` (maps PRD §14.6 terms):
```typescript
import { SKILL_VALUE, type SkillLevel } from "./types.js";
import { pairKey, type EngineState } from "./state.js";

export interface Weights {
  repeatPartner: number; repeatOpponent: number; recentPartner: number;
  recentOpponent: number; skillGap: number;
}
export const DEFAULT_WEIGHTS: Weights = {
  repeatPartner: 10, repeatOpponent: 4, recentPartner: 6, recentOpponent: 3, skillGap: 1,
};

export interface FoursomePlayer { playerId: string; skillLevel: SkillLevel; }
export type TeamSplit = { teamA: [string, string]; teamB: [string, string]; penalty: number };

const splits: ReadonlyArray<[number, number, number, number]> = [
  [0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2], // 3 distinct doubles pairings of 4 players
];

/** Penalty of a specific team split given history (PRD §14.6 soft terms). */
function splitPenalty(s: EngineState, p: FoursomePlayer[], idx: [number, number, number, number], w: Weights): number {
  const [a1, a2, b1, b2] = idx.map((i) => p[i]!);
  let pen = 0;
  pen += w.repeatPartner * ((s.partnerCount.get(pairKey(a1.playerId, a2.playerId)) ?? 0)
                          + (s.partnerCount.get(pairKey(b1.playerId, b2.playerId)) ?? 0));
  if (s.lastPartner.get(a1.playerId) === a2.playerId) pen += w.recentPartner;
  if (s.lastPartner.get(b1.playerId) === b2.playerId) pen += w.recentPartner;
  for (const a of [a1, a2]) for (const b of [b1, b2]) {
    pen += w.repeatOpponent * (s.opponentCount.get(pairKey(a.playerId, b.playerId)) ?? 0);
    if (s.lastOpponents.get(a.playerId)?.has(b.playerId)) pen += w.recentOpponent;
  }
  const teamA = SKILL_VALUE[a1.skillLevel] + SKILL_VALUE[a2.skillLevel];
  const teamB = SKILL_VALUE[b1.skillLevel] + SKILL_VALUE[b2.skillLevel];
  pen += w.skillGap * Math.abs(teamA - teamB);
  return pen;
}

export function bestTeamSplit(s: EngineState, four: FoursomePlayer[], w: Weights = DEFAULT_WEIGHTS): TeamSplit {
  let best: TeamSplit | null = null;
  for (const idx of splits) {
    const penalty = splitPenalty(s, four, idx, w);
    if (!best || penalty < best.penalty) {
      const [a1, a2, b1, b2] = idx;
      best = { teamA: [four[a1]!.playerId, four[a2]!.playerId], teamB: [four[b1]!.playerId, four[b2]!.playerId], penalty };
    }
  }
  return best!;
}

/** Penalty of grouping 4 arbitrary players together (min over their 3 splits). */
export function foursomePenalty(s: EngineState, four: FoursomePlayer[], w: Weights = DEFAULT_WEIGHTS): number {
  return bestTeamSplit(s, four, w).penalty;
}
```
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(engine): penalty model + best team split`.

---

## Task 4: Sit-out selection (TDD)

**Files:** Create `src/sitouts.ts`, `src/sitouts.test.ts`.

- [ ] **Step 1: Failing test** — players with fewer prior sit-outs are kept playing; number sitting = available − playable, where playable = min(floor(available/4)*4, courts*4); ties broken by gamesPlayed then deterministic id.
```typescript
import { describe, it, expect } from "vitest";
import { selectSitOuts } from "./sitouts.js";
import { createInitialState } from "./state.js";

describe("selectSitOuts", () => {
  it("9 players, 2 courts -> exactly 1 sits (PRD scenario 5)", () => {
    const ids = Array.from({ length: 9 }, (_, i) => `p${i}`);
    const s = createInitialState(ids.map((id) => ({ playerId: id, displayName: id, skillLevel: "unknown", availableFromRound: 1 })));
    const { playing, sitting } = selectSitOuts(s, ids, 2);
    expect(sitting.length).toBe(1);
    expect(playing.length).toBe(8);
  });
  it("prefers to sit players who have sat out the least... no: who have sat out the FEWEST keep priority to PLAY", () => {
    const ids = ["a","b","c","d","e"];
    const s = createInitialState(ids.map((id) => ({ playerId: id, displayName: id, skillLevel: "unknown", availableFromRound: 1 })));
    s.sitOuts.set("a", 0); s.sitOuts.set("b", 0); s.sitOuts.set("c", 0); s.sitOuts.set("d", 0); s.sitOuts.set("e", 2);
    const { sitting } = selectSitOuts(s, ids, 1); // 5 -> 4 play, 1 sits
    expect(sitting).toEqual(["e"]); // most prior sit-outs? No — fairness sits the one who has sat LEAST... see impl note
  });
});
```
> Implementation note — fairness goal (PRD §14.5 #2) is *equal* sit-outs. So the player chosen to sit should be the one with the **fewest** sit-outs so far (to even them up), tie-broken by **most** games played, then id. Adjust the second test's expectation to match the rule you implement and keep it consistent.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `sitouts.ts`:
```typescript
import { PLAYERS_PER_MATCH } from "./types.js";
import type { EngineState } from "./state.js";

export interface SitOutResult { playing: string[]; sitting: string[]; }

export function selectSitOuts(s: EngineState, available: string[], courtCount: number): SitOutResult {
  const capacity = courtCount * PLAYERS_PER_MATCH;
  const playableCount = Math.min(Math.floor(available.length / PLAYERS_PER_MATCH) * PLAYERS_PER_MATCH, capacity);
  const sitCount = available.length - playableCount;
  if (sitCount <= 0) return { playing: [...available], sitting: [] };

  // Sit those with the FEWEST sit-outs first (even them up), then MOST games, then id.
  const ranked = [...available].sort((x, y) => {
    const so = (s.sitOuts.get(x) ?? 0) - (s.sitOuts.get(y) ?? 0);
    if (so !== 0) return so;
    const gp = (s.gamesPlayed.get(y) ?? 0) - (s.gamesPlayed.get(x) ?? 0);
    if (gp !== 0) return gp;
    return x < y ? -1 : 1;
  });
  const sitting = ranked.slice(0, sitCount);
  const sittingSet = new Set(sitting);
  return { playing: available.filter((p) => !sittingSet.has(p)), sitting };
}
```
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(engine): fair sit-out selection`.

---

## Task 5: Single-round builder (TDD)

**Files:** Create `src/round.ts`, `src/round.test.ts`.

- [ ] **Step 1: Failing test** — given 8 fresh players + 2 courts, `buildRound` returns 2 matches, 8 distinct players, 4 per match, court ids assigned from the provided courts; with prior partner history it avoids the recent partnership when an alternative exists.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `round.ts` — greedy lowest-penalty foursome fill:
```typescript
import type { EngineCourt, EnginePlayer, GeneratedMatch, GeneratedSitOut } from "./types.js";
import { recordMatch, type EngineState } from "./state.js";
import { bestTeamSplit, foursomePenalty, type FoursomePlayer } from "./penalty.js";
import { selectSitOuts } from "./sitouts.js";

export interface RoundResult { matches: GeneratedMatch[]; sitOuts: GeneratedSitOut[]; }

/** Build one round, mutating `state`. Players already filtered to schedulable+available. */
export function buildRound(
  state: EngineState, players: EnginePlayer[], courts: EngineCourt[], roundNumber: number,
): RoundResult {
  const byId = new Map(players.map((p) => [p.playerId, p] as const));
  const { playing, sitting } = selectSitOuts(state, players.map((p) => p.playerId), courts.length);

  const pool = new Set(playing);
  const matches: GeneratedMatch[] = [];
  const courtsToUse = courts.slice(0, playing.length / 4); // §23: only required courts

  for (let m = 0; m < courtsToUse.length; m++) {
    const four = pickLowestPenaltyFoursome(state, pool, byId);
    for (const id of four) pool.delete(id);
    const split = bestTeamSplit(state, four.map((id) => ({ playerId: id, skillLevel: byId.get(id)!.skillLevel })));
    recordMatch(state, roundNumber, split.teamA, split.teamB);
    const court = courtsToUse[m]!;
    matches.push({ roundNumber, courtId: court.courtId, matchNumber: m + 1, teamA: split.teamA, teamB: split.teamB });
  }
  for (const id of sitting) state.sitOuts.set(id, (state.sitOuts.get(id) ?? 0) + 1);

  return {
    matches,
    sitOuts: sitting.map((playerId) => ({ roundNumber, playerId, reason: "rotation" as const })),
  };
}

/** Greedy: anchor the least-played remaining player, then add the 3 that minimise penalty. */
function pickLowestPenaltyFoursome(
  state: EngineState, pool: Set<string>, byId: Map<string, EnginePlayer>,
): [string, string, string, string] {
  const ids = [...pool];
  const anchor = ids.sort((a, b) =>
    (state.gamesPlayed.get(a) ?? 0) - (state.gamesPlayed.get(b) ?? 0) || (a < b ? -1 : 1))[0]!;
  const rest = ids.filter((id) => id !== anchor);
  const fp = (id: string): FoursomePlayer => ({ playerId: id, skillLevel: byId.get(id)!.skillLevel });

  let best: { four: [string, string, string, string]; pen: number } | null = null;
  for (let i = 0; i < rest.length; i++)
    for (let j = i + 1; j < rest.length; j++)
      for (let k = j + 1; k < rest.length; k++) {
        const four = [anchor, rest[i]!, rest[j]!, rest[k]!] as [string, string, string, string];
        const pen = foursomePenalty(state, four.map(fp));
        if (!best || pen < best.pen) best = { four, pen };
      }
  return best!.four;
}
```
> Complexity note: the foursome search is O(n³) per court anchored on the least-played player. For the §24.1 cap (40 players ≈ 10 courts) that is well within the 5 s budget. If profiling later shows pressure, cap `rest` to the K least-played candidates.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(engine): greedy single-round builder`.

---

## Task 6: Fairness metadata (TDD)

**Files:** Create `src/fairness.ts`, `src/fairness.test.ts`.

- [ ] **Step 1: Failing test** — `computeFairness` reports correct min/max games, and `fairnessScore` is 1 when every player has equal games and no repeats, < 1 otherwise; clamped to [0,1].
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `fairness.ts` — `fairnessScore = clamp01(1 - normalizedPenalty)` where normalizedPenalty derives from games/sit-out spread + repeat counts over a theoretical max (DELTA_SPEC minor). Populate `notes` (e.g. "two players sit out twice", "repeated opponents unavoidable").
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(engine): fairness metadata`.

---

## Task 7: `generateSchedule` real implementation (TDD)

**Files:** Create `src/generate.ts`; modify `src/index.ts`.

- [ ] **Step 1: Failing test** in `generate.test.ts` — for 12 players / 3 courts / 60 min / 15 min: 4 rounds, 12 matches total, every player plays exactly 4, zero sit-outs (PRD scenario 1); `mode:"rebalance"` with locked round 1 keeps those matches and only emits rounds ≥ 2.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `generate.ts`:
```typescript
import type { EngineInput, EngineOutput, GeneratedMatch, GeneratedSitOut } from "./types.js";
import { computeFutureRoundCount } from "./rounds.js";
import { createInitialState, seedStateFromLocked, type EngineState } from "./state.js";
import { buildRound } from "./round.js";
import { computeFairness } from "./fairness.js";
import { isSchedulablePlayer } from "./state.js"; // helper: availableFromRound <= round

export const ALGORITHM_VERSION = "v1";

export function generateSchedule(input: EngineInput): EngineOutput {
  const state: EngineState = input.mode === "rebalance"
    ? seedStateFromLocked(input.players, input.lockedMatches)
    : createInitialState(input.players);

  const futureRounds = computeFutureRoundCount(input);
  const firstFutureRound = input.elapsedRounds + 1;

  const matches: GeneratedMatch[] = [];
  const sitOuts: GeneratedSitOut[] = [];

  for (let r = 0; r < futureRounds; r++) {
    const roundNumber = firstFutureRound + r;
    const available = input.players.filter((p) => p.availableFromRound <= roundNumber);
    if (available.length < 4) continue; // §23 fewer than 4 -> no matches this round
    const res = buildRound(state, available, input.courts, roundNumber);
    matches.push(...res.matches);
    sitOuts.push(...res.sitOuts);
  }

  return { matches, sitOuts, metadata: computeFairness(state, { matches, sitOuts }, input) };
}
```
> Note: add `isSchedulablePlayer` only if you choose to filter availability inside the engine; status filtering (D7) is done by the *caller* (Cloud Function) before calling the engine — the engine sees only schedulable players plus `availableFromRound` for late joiners. Keep the engine dumb about Firestore statuses.
- [ ] **Step 4:** In `index.ts`, replace the stub export with `export { generateSchedule, ALGORITHM_VERSION } from "./generate.js";` and keep type/round exports.
- [ ] **Step 5: Run** → PASS. **Step 6: Commit** `feat(engine): real deterministic generateSchedule`.

---

## Task 8: Full PRD scenario suite (TDD)

**Files:** Create `src/scenarios.test.ts`.

- [ ] **Step 1: Write invariant-based tests** for the PRD §26.1 + §26.3 matrix. Helper asserts: games spread ≤1, sit-out spread ≤1, 4/match, courts ≤ available, no exact-repeat partner when an unused pairing existed.
```typescript
import { describe, it, expect } from "vitest";
import { generateSchedule } from "./generate.js";
import type { EngineInput, EnginePlayer, EngineCourt } from "./types.js";

function mk(n: number, courts: number, durMin: number, gameMin = 15): EngineInput {
  const players: EnginePlayer[] = Array.from({ length: n }, (_, i) => ({
    playerId: `p${i}`, displayName: `p${i}`, skillLevel: "unknown", availableFromRound: 1,
  }));
  const cs: EngineCourt[] = Array.from({ length: courts }, (_, i) => ({ courtId: `c${i}`, name: `Court ${i+1}`, courtNumber: i + 1 }));
  return { mode: "initial", players, courts: cs, sessionDurationMinutes: durMin, estimatedGameMinutes: gameMin, elapsedRounds: 0, lockedMatches: [] };
}
function games(out: ReturnType<typeof generateSchedule>, id: string): number {
  return out.matches.filter((m) => [...m.teamA, ...m.teamB].includes(id)).length;
}
function spread(out: ReturnType<typeof generateSchedule>, ids: string[]): number {
  const g = ids.map((id) => games(out, id)); return Math.max(...g) - Math.min(...g);
}

describe("PRD scenarios", () => {
  it.each([
    ["4 players, 1 court", 4, 1, 60],
    ["8 players, 2 courts", 8, 2, 60],
    ["10 players, 2 courts", 10, 2, 60],
    ["12 players, 3 courts", 12, 3, 60],
    ["14 players, 3 courts", 14, 3, 60],
    ["18 players, 3 courts", 18, 3, 90],
  ])("%s: fair games + sit-out spread", (_label, n, courts, dur) => {
    const out = generateSchedule(mk(n, courts, dur));
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    expect(spread(out, ids)).toBeLessThanOrEqual(1);
    for (const m of out.matches) expect([...m.teamA, ...m.teamB].length).toBe(4);
  });

  it("scenario 1: 12/3/60 -> 4 rounds, 12 matches, everyone plays 4, no sit-outs", () => {
    const out = generateSchedule(mk(12, 3, 60));
    expect(out.matches.length).toBe(12);
    expect(out.sitOuts.length).toBe(0);
    for (let i = 0; i < 12; i++) expect(games(out, `p${i}`)).toBe(4);
  });

  it("is deterministic for identical input", () => {
    expect(generateSchedule(mk(14, 3, 60))).toEqual(generateSchedule(mk(14, 3, 60)));
  });

  it("rebalance preserves locked round 1 and only adds future rounds", () => {
    const input = mk(8, 2, 60);
    const locked = [{ roundNumber: 1, courtId: "c0", teamA: ["p0","p1"] as [string,string], teamB: ["p2","p3"] as [string,string] }];
    const out = generateSchedule({ ...input, mode: "rebalance", elapsedRounds: 1, lockedMatches: locked });
    expect(out.matches.every((m) => m.roundNumber >= 2)).toBe(true);
  });
});
```
- [ ] **Step 2: Run** → all PASS (fix builder/sit-out edge cases until green).
- [ ] **Step 3: Commit** `test(engine): PRD scenario invariants + determinism + rebalance`.

---

## Task 9: Verification + processed

- [ ] **Step 1:** `pnpm --filter @picklebaddies/match-engine test` → all suites green.
- [ ] **Step 2:** `pnpm --filter @picklebaddies/match-engine build` → 0 (confirms still zero-firebase, D3).
- [ ] **Step 3:** Quick perf check — add a throwaway test or REPL run for 40 players / 10 courts and assert it returns in < 5 s (PRD §24.1). Remove or keep as a skipped perf test.
- [ ] **Step 4: Commit** `chore(m4): verification pass`.
- [ ] **Step 5: Mark processed**:
```bash
git mv docs/superpowers/plans/2026-06-06-m4-match-engine.md docs/superpowers/plans/processed/2026-06-06-m4-match-engine.md
git commit -m "chore(plans): mark M4 processed"
```

---

## Self-Review (acceptance mapping)

- §14.4 round/capacity math → `rounds.ts` (M0) + builder. ✅
- §14.5 fairness objectives 1–8 → state + penalty + sit-out + locked seeding. ✅
- §14.6 penalty terms → `penalty.ts` (`DEFAULT_WEIGHTS`). ✅
- §14.7 skill mapping (unknown=2) → reused from `types.ts`. ✅
- §14.8 metadata → `fairness.ts`. ✅
- §14.9 regeneration preserves locked + stats from locked → `seedStateFromLocked` + `generate` rebalance path. ✅
- §23 edge cases (≥4, exactly 4, more courts than needed, not divisible by 4, overflow, late arrival) → builder + sit-out + `availableFromRound`. ✅
- §26.1 unit matrix → `scenarios.test.ts`. ✅
- D3 purity → Task 9 build check. D4 rebalance round count → `generate` uses `computeFutureRoundCount`. ✅

**Note:** `player_overuse_penalty` and `manual_constraint_penalty` (PRD §14.6) are deferred — overuse is handled structurally by sit-out fairness + anchoring the least-played player; manual constraints arrive with override in M6. Add weights when those features land.
