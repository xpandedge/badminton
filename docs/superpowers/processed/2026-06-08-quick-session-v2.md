# Quick Session v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Quick Session with an auth gate, rolling-court-queue live model, volt/ink UI redesign with animations, and a per-user persistent roster with cross-session fairness seeding.

**Architecture:** Four independent phases executed in order. Phase 1 adds an auth guard layout; Phase 2 replaces round-gated scoring with a per-match queue driven by court count; Phase 3 migrates both pages to the existing volt/ink design system; Phase 4 adds Firestore-backed per-user player roster and seeds the match engine with cross-session fairness priors.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Firestore, `@picklebaddies/match-engine` (vitest), `@picklebaddies/web` (vitest)

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `apps/web/src/app/quick/layout.tsx` | Auth guard for all /quick routes |
| `apps/web/src/lib/quick-sessions/queue.ts` | `computeMatchStates` — rolling court queue logic |
| `apps/web/src/lib/quick-sessions/queue.test.ts` | Unit tests for queue |
| `apps/web/src/lib/quick-sessions/stats.ts` | Pure `computeSessionStats` — fold session into player deltas |
| `apps/web/src/lib/quick-sessions/stats.test.ts` | Unit tests for stats aggregation |
| `apps/web/src/lib/quick-sessions/roster.ts` | Firestore CRUD for `users/{uid}/players/{id}` |
| `packages/match-engine/src/priors.ts` | `seedStateFromPriors` + `normalizePriorGames` |
| `packages/match-engine/src/priors.test.ts` | Unit tests for priors seeding |

### Modified files
| File | Change |
|---|---|
| `apps/web/src/lib/quick-sessions/types.ts` | Add `PlayerStats`, `RosterPlayer`; extend `QuickSession` |
| `apps/web/src/lib/quick-sessions/firestore.ts` | Add `commitSessionStats` |
| `apps/web/src/lib/quick-sessions/engine.ts` | Accept `priors` param in `buildEngineInput` |
| `apps/web/src/app/quick/page.tsx` | Full redesign + roster picker + priors wiring |
| `apps/web/src/app/quick/[sessionId]/page.tsx` | Rolling queue + UI redesign + Finish button |
| `apps/web/src/app/globals.css` | Add `pb-pulse` keyframe |
| `packages/match-engine/src/types.ts` | Add `PlayerPriors`; add `priors?` to `EngineInput` |
| `packages/match-engine/src/generate.ts` | Use `seedStateFromPriors` when `input.priors` present; compute `futureRounds` first |
| `packages/match-engine/src/index.ts` | Export `pairKey`, `seedStateFromPriors`, `PlayerPriors` |

---

## Task 1: Auth guard layout for /quick routes

**Files:**
- Create: `apps/web/src/app/quick/layout.tsx`

- [ ] **Step 1: Create the layout file**

```tsx
// apps/web/src/app/quick/layout.tsx
"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";

export default function QuickLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/sign-in?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "grid", placeItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
          <div style={{ width: 44, height: 44, borderRadius: "var(--r-md)", background: "var(--volt-500)", display: "grid", placeItems: "center", animation: "pb-pop 600ms var(--ease-out) infinite alternate" }}>
            <svg width="26" height="26" viewBox="0 0 40 40" fill="none">
              <rect x="5" y="3" width="19" height="25" rx="9" transform="rotate(-15 14 15)" fill="none" stroke="#16241C" strokeWidth="3" />
              <circle cx="28" cy="28" r="8" fill="#16241C" />
              <circle cx="26" cy="26" r="3" fill="#C6F135" />
            </svg>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
```

- [ ] **Step 2: Verify the app still builds**

```bash
pnpm --filter @picklebaddies/web build
```

Expected: no TypeScript errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/quick/layout.tsx
git commit -m "feat(quick): add auth guard layout — redirect unauthenticated users to sign-in

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Extend QuickSession type + attach ownerUid on generate

**Files:**
- Modify: `apps/web/src/lib/quick-sessions/types.ts`
- Modify: `apps/web/src/app/quick/page.tsx` (ownerUid wiring only — full redesign in Task 5)

- [ ] **Step 1: Update types.ts**

Replace the entire file content:

```ts
// apps/web/src/lib/quick-sessions/types.ts
import type { GeneratedMatch, GeneratedSitOut, SkillLevel } from "@picklebaddies/match-engine";

export type { SkillLevel };

export interface QuickPlayer {
  id: string;
  name: string;
  skillLevel: SkillLevel;
}

export interface PlayerStats {
  totalGames: number;
  totalSitOuts: number;
  sessionsPlayed: number;
  partnerCounts: Record<string, number>;
  opponentCounts: Record<string, number>;
  lastPlayedAt: number;
}

export interface RosterPlayer extends QuickPlayer {
  stats: PlayerStats;
}

export interface QuickSessionSetup {
  name: string;
  courts: number;
  rounds: number;
}

export interface QuickScore {
  teamAScore: number;
  teamBScore: number;
}

export interface QuickSession {
  id: string;
  name: string;
  courts: number;
  players: QuickPlayer[];
  matches: GeneratedMatch[];
  sitOuts: GeneratedSitOut[];
  scores: Record<string, QuickScore>;
  createdAt: number;
  ownerUid?: string;
  rosterPlayerIds?: string[];
  statsCommitted?: boolean;
}

export type RoundStatus = "done" | "playing" | "up_next";
```

- [ ] **Step 2: Wire ownerUid in the setup page**

In `apps/web/src/app/quick/page.tsx`, add the `useAuth` import and attach `ownerUid` when creating the session. Find the `handleGenerate` function and update the session object:

```tsx
// At top of file, add:
import { useAuth } from "@/lib/auth/useAuth";

// Inside QuickSessionPage component, add after existing state declarations:
const { user } = useAuth();

// Inside handleGenerate, update the session object:
const session: QuickSession = {
  id: generateId(),
  name: setup.name,
  courts: setup.courts,
  players,
  matches: output.matches,
  sitOuts: output.sitOuts,
  scores: {},
  createdAt: Date.now(),
  ownerUid: user?.uid,
  rosterPlayerIds: players.map((p) => p.id),
  statsCommitted: false,
};
```

- [ ] **Step 3: Verify build**

```bash
pnpm --filter @picklebaddies/web build
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/quick-sessions/types.ts apps/web/src/app/quick/page.tsx
git commit -m "feat(quick): extend QuickSession with ownerUid, rosterPlayerIds, statsCommitted

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Rolling court queue — computeMatchStates (TDD)

**Files:**
- Create: `apps/web/src/lib/quick-sessions/queue.ts`
- Create: `apps/web/src/lib/quick-sessions/queue.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/quick-sessions/queue.test.ts
import { describe, it, expect } from "vitest";
import { computeMatchStates } from "./queue";
import type { QuickScore } from "./types";
import type { GeneratedMatch } from "@picklebaddies/match-engine";

function match(roundNumber: number, courtId: string, matchNumber = 1): GeneratedMatch {
  return { roundNumber, courtId, matchNumber, teamA: ["p1", "p2"], teamB: ["p3", "p4"] };
}

function score(a = 11, b = 5): QuickScore { return { teamAScore: a, teamBScore: b }; }

const key = (r: number, c: string) => `r${r}_${c}`;

describe("computeMatchStates", () => {
  it("all up_next when no scores and courts=2", () => {
    const matches = [match(1, "court-1", 1), match(1, "court-2", 2), match(2, "court-1", 3)];
    const states = computeMatchStates(matches, {}, 2);
    expect(states.get(key(1, "court-1"))).toBe("live");
    expect(states.get(key(1, "court-2"))).toBe("live");
    expect(states.get(key(2, "court-1"))).toBe("up_next");
  });

  it("live window slides when first match scored", () => {
    const matches = [match(1, "court-1", 1), match(1, "court-2", 2), match(2, "court-1", 3)];
    const scores = { [key(1, "court-1")]: score() };
    const states = computeMatchStates(matches, scores, 2);
    expect(states.get(key(1, "court-1"))).toBe("done");
    expect(states.get(key(1, "court-2"))).toBe("live");
    expect(states.get(key(2, "court-1"))).toBe("live");
  });

  it("all done when all scored", () => {
    const matches = [match(1, "court-1", 1), match(1, "court-2", 2)];
    const scores = {
      [key(1, "court-1")]: score(),
      [key(1, "court-2")]: score(),
    };
    const states = computeMatchStates(matches, scores, 2);
    expect(states.get(key(1, "court-1"))).toBe("done");
    expect(states.get(key(1, "court-2"))).toBe("done");
  });

  it("courts=1 means only 1 live at a time", () => {
    const matches = [match(1, "court-1", 1), match(2, "court-1", 2), match(3, "court-1", 3)];
    const states = computeMatchStates(matches, {}, 1);
    expect(states.get(key(1, "court-1"))).toBe("live");
    expect(states.get(key(2, "court-1"))).toBe("up_next");
    expect(states.get(key(3, "court-1"))).toBe("up_next");
  });

  it("courts >= remaining matches → all live", () => {
    const matches = [match(1, "court-1", 1), match(2, "court-1", 2)];
    const states = computeMatchStates(matches, {}, 4);
    expect(states.get(key(1, "court-1"))).toBe("live");
    expect(states.get(key(2, "court-1"))).toBe("live");
  });

  it("sorted by roundNumber then matchNumber", () => {
    // Court-2 round-1 matchNumber=2, court-1 round-1 matchNumber=1 → court-1 queues first
    const matches = [match(1, "court-2", 2), match(1, "court-1", 1)];
    const scores = { [key(1, "court-1")]: score() };
    const states = computeMatchStates(matches, scores, 1);
    expect(states.get(key(1, "court-1"))).toBe("done");
    expect(states.get(key(1, "court-2"))).toBe("live");
  });

  it("handles empty matches", () => {
    const states = computeMatchStates([], {}, 2);
    expect(states.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @picklebaddies/web exec vitest run src/lib/quick-sessions/queue.test.ts
```

Expected: FAIL — `queue` module not found.

- [ ] **Step 3: Implement computeMatchStates**

```ts
// apps/web/src/lib/quick-sessions/queue.ts
import type { GeneratedMatch } from "@picklebaddies/match-engine";
import type { QuickScore } from "./types";
import { computeMatchKey } from "./score";

export type MatchState = "done" | "live" | "up_next";

export function computeMatchStates(
  matches: GeneratedMatch[],
  scores: Record<string, QuickScore>,
  courts: number
): Map<string, MatchState> {
  const sorted = [...matches].sort((a, b) =>
    a.roundNumber !== b.roundNumber ? a.roundNumber - b.roundNumber : a.matchNumber - b.matchNumber
  );

  const result = new Map<string, MatchState>();
  let liveCount = 0;

  for (const m of sorted) {
    const key = computeMatchKey(m.roundNumber, m.courtId);
    if (scores[key] !== undefined) {
      result.set(key, "done");
    } else if (liveCount < courts) {
      result.set(key, "live");
      liveCount++;
    } else {
      result.set(key, "up_next");
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @picklebaddies/web exec vitest run src/lib/quick-sessions/queue.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/quick-sessions/queue.ts apps/web/src/lib/quick-sessions/queue.test.ts
git commit -m "feat(quick): add computeMatchStates — rolling court queue model

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Wire rolling queue into the live session page

**Files:**
- Modify: `apps/web/src/app/quick/[sessionId]/page.tsx`

Replace `computeRoundStatus` usage with `computeMatchStates`. Keep the existing UI unchanged (visual redesign is Task 6). Focus on correctness only.

- [ ] **Step 1: Update imports and remove round status logic**

In `apps/web/src/app/quick/[sessionId]/page.tsx`, change the import block:

```tsx
// Replace:
import { computeMatchKey, getWinner, computeRoundStatus } from "@/lib/quick-sessions/score";
// With:
import { computeMatchKey, getWinner } from "@/lib/quick-sessions/score";
import { computeMatchStates } from "@/lib/quick-sessions/queue";
```

- [ ] **Step 2: Update the render loop to use match-level states**

Replace the entire body of `LiveSessionPage` return statement (the section that maps over `roundNumbers`) with this version. This keeps the same outer structure but derives the round badge from per-match states:

```tsx
// Before the return, compute states once:
const matchStates = computeMatchStates(session.matches, session.scores, session.courts);

// Helper to compute a round's badge status from match states
function roundBadge(roundMatches: GeneratedMatch[]): "done" | "playing" | "up_next" {
  const states = roundMatches.map((m) => matchStates.get(computeMatchKey(m.roundNumber, m.courtId)));
  if (states.every((s) => s === "done")) return "done";
  if (states.some((s) => s === "live")) return "playing";
  return "up_next";
}
```

In the JSX, update the round section:

```tsx
{roundNumbers.map((roundNumber) => {
  const roundMatches = session.matches.filter((m) => m.roundNumber === roundNumber);
  const roundSitOuts = session.sitOuts.filter((s) => s.roundNumber === roundNumber);
  const badge = roundBadge(roundMatches);

  return (
    <div key={roundNumber} style={{ opacity: badge === "up_next" ? 0.5 : 1, transition: "opacity 0.2s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: "#8a7a60", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Round {roundNumber}</span>
        <div style={{ height: 1, flex: 1, background: "#f0e8d0" }} />
        {badge === "done" && <span style={{ fontSize: 10, color: "#3a7a1a", background: "#edfae0", border: "1px solid #b0d890", borderRadius: 8, padding: "2px 8px" }}>Done</span>}
        {badge === "playing" && <span style={{ fontSize: 10, color: "#8a5a00", background: "#fff3d0", border: "1px solid #f0c060", borderRadius: 8, padding: "2px 8px" }}>Playing</span>}
        {badge === "up_next" && <span style={{ fontSize: 10, color: "#b0a080", background: "#f5f0e8", border: "1px solid #e0d0b0", borderRadius: 8, padding: "2px 8px" }}>Up next</span>}
      </div>

      {roundMatches.map((match) => {
        const key = computeMatchKey(match.roundNumber, match.courtId);
        const matchState = matchStates.get(key) ?? "up_next";
        return (
          <MatchCard
            key={key}
            match={match}
            playerNames={playerNames}
            score={session.scores[key]}
            isLive={matchState === "live"}
            isUpNext={matchState === "up_next"}
            onTap={() => setActiveMatch(match)}
          />
        );
      })}

      {roundSitOuts.length > 0 && (
        <p style={{ fontSize: 11, color: "#b0a080", margin: "4px 0 0", paddingLeft: 4, fontStyle: "italic" }}>
          Sitting out: {roundSitOuts.map((s) => playerNames[s.playerId] ?? s.playerId).join(", ")}
        </p>
      )}
    </div>
  );
})}
```

- [ ] **Step 3: Update MatchCard to accept isUpNext**

Update the `MatchCardProps` interface and component signature:

```tsx
interface MatchCardProps {
  match: GeneratedMatch;
  playerNames: Record<string, string>;
  score: QuickScore | undefined;
  isLive: boolean;
  isUpNext: boolean;
  onTap: () => void;
}

function MatchCard({ match, playerNames, score, isLive, isUpNext, onTap }: MatchCardProps) {
```

In the card's button rendering, change `{isLive && !score && (` to also handle tap-to-edit for scored matches:

```tsx
{isLive && !score && (
  <button onClick={onTap} style={{ marginTop: 10, width: "100%", background: "#fef3e0", border: "1px solid #f0c060", borderRadius: 7, color: "#8a4000", fontSize: 13, fontWeight: 700, padding: 8, cursor: "pointer" }}>
    Tap to enter score
  </button>
)}
{score && !isUpNext && (
  <button onClick={onTap} style={{ marginTop: 6, width: "100%", background: "none", border: "none", color: "#b0a080", fontSize: 11, cursor: "pointer", padding: "4px 0" }}>
    Edit score
  </button>
)}
```

Remove the `computeRoundStatus` function declaration if it was inlined (it was imported, so nothing to remove beyond the import change in Step 1).

- [ ] **Step 4: Build to verify no TypeScript errors**

```bash
pnpm --filter @picklebaddies/web build
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/quick/\[sessionId\]/page.tsx
git commit -m "feat(quick): use rolling court queue for match editability

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Add pb-pulse keyframe + redesign setup page

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/quick/page.tsx`

- [ ] **Step 1: Add pb-pulse keyframe to globals.css**

After the `pb-fade` keyframe block (around line 164), insert:

```css
@keyframes pb-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(198, 241, 53, 0.45); }
  50%       { box-shadow: 0 0 0 8px rgba(198, 241, 53, 0); }
}
```

- [ ] **Step 2: Replace setup page with redesigned version**

Replace the entire content of `apps/web/src/app/quick/page.tsx`:

```tsx
// apps/web/src/app/quick/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import { generateSchedule } from "@picklebaddies/match-engine";
import type { QuickPlayer, QuickSessionSetup, QuickSession } from "@/lib/quick-sessions/types";
import { buildEngineInput } from "@/lib/quick-sessions/engine";
import { saveSessionToStorage } from "@/lib/quick-sessions/storage";
import { saveSessionToFirestore } from "@/lib/quick-sessions/firestore";

const SKILL_OPTIONS = ["unknown", "beginner", "intermediate", "advanced"] as const;

function generateId(): string {
  return crypto.randomUUID().split("-")[0]!;
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="pb-btn pb-btn-secondary"
        style={{ width: 40, height: 40, padding: 0, borderRadius: "var(--r-md)", fontSize: 20, fontWeight: 900 }}
      >
        −
      </button>
      <div style={{ background: "var(--surface-sunken)", border: "1.5px solid var(--border)", borderRadius: "var(--r-md)", padding: "8px 0", fontSize: 16, fontWeight: 800, color: "var(--text-1)", flex: 1, textAlign: "center" }}>
        {value}
      </div>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="pb-btn pb-btn-volt"
        style={{ width: 40, height: 40, padding: 0, borderRadius: "var(--r-md)", fontSize: 20, fontWeight: 900 }}
      >
        +
      </button>
    </div>
  );
}

export default function QuickSessionPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState("Quick Session");
  const [courts, setCourts] = useState(2);
  const [rounds, setRounds] = useState(3);
  const [players, setPlayers] = useState<QuickPlayer[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [playerSkill, setPlayerSkill] = useState<QuickPlayer["skillLevel"]>("unknown");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addPlayer() {
    const trimmed = playerName.trim();
    if (!trimmed) return;
    setPlayers((prev) => [...prev, { id: crypto.randomUUID(), name: trimmed, skillLevel: playerSkill }]);
    setPlayerName("");
    setPlayerSkill("unknown");
  }

  function removePlayer(id: string) {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleGenerate() {
    if (players.length < 4) return;
    setGenerating(true);
    setError(null);
    try {
      const setup: QuickSessionSetup = { name: name.trim() || "Quick Session", courts, rounds };
      const engineInput = buildEngineInput(setup, players);
      const output = generateSchedule(engineInput);

      const session: QuickSession = {
        id: generateId(),
        name: setup.name,
        courts: setup.courts,
        players,
        matches: output.matches,
        sitOuts: output.sitOuts,
        scores: {},
        createdAt: Date.now(),
        ownerUid: user?.uid,
        rosterPlayerIds: players.map((p) => p.id),
        statsCommitted: false,
      };

      saveSessionToStorage(session);
      await saveSessionToFirestore(session);
      router.push(`/quick/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate. Try again.");
      setGenerating(false);
    }
  }

  const canGenerate = players.length >= 4 && !generating;
  const need = Math.max(0, 4 - players.length);

  return (
    <div
      className="pb-net-bg"
      style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", flexDirection: "column" }}
    >
      {/* Header */}
      <div style={{ background: "var(--surface)", padding: "14px 20px", borderBottom: "1px solid var(--border)", animation: "pb-rise 300ms var(--ease-out) both" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "var(--r-md)", background: "var(--volt-500)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 40 40" fill="none">
              <path d="M20 5 L35 20 L20 35 L5 20 Z" fill="none" stroke="var(--ink-800)" strokeWidth="3" />
              <circle cx="20" cy="20" r="5" fill="var(--ink-800)" />
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 15, color: "var(--text-1)", letterSpacing: "-0.01em" }}>Quick Session</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>casual · no group needed</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: "16px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 640, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>

        {/* Session config */}
        <div style={{ background: "var(--surface)", borderRadius: "var(--r-xl)", padding: 18, border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", animation: "pb-rise 350ms 50ms var(--ease-out) both" }}>
          <div style={{ fontSize: 10, color: "var(--volt-600)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14, fontFamily: "var(--font-mono)", fontWeight: 700 }}>Setup</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-2)", marginBottom: 5, fontWeight: 600 }}>Session name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pb-input"
                style={{ width: "100%", padding: "10px 14px", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-2)", marginBottom: 5, fontWeight: 600 }}>Courts</label>
              <Stepper value={courts} min={1} max={8} onChange={setCourts} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-2)", marginBottom: 5, fontWeight: 600 }}>Rounds</label>
              <Stepper value={rounds} min={1} max={10} onChange={setRounds} />
            </div>
          </div>
        </div>

        {/* Players */}
        <div style={{ background: "var(--surface)", borderRadius: "var(--r-xl)", padding: 18, border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", animation: "pb-rise 350ms 100ms var(--ease-out) both" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "var(--volt-600)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--font-mono)", fontWeight: 700 }}>Players</div>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>{players.length} added</span>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPlayer()}
              placeholder="Name…"
              className="pb-input"
              style={{ flex: 1, padding: "10px 14px" }}
            />
            <select
              value={playerSkill}
              onChange={(e) => setPlayerSkill(e.target.value as QuickPlayer["skillLevel"])}
              className="pb-input"
              style={{ padding: "10px 10px", fontSize: 13 }}
            >
              {SKILL_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <button
              onClick={addPlayer}
              disabled={!playerName.trim()}
              className={`pb-btn ${playerName.trim() ? "pb-btn-volt" : "pb-btn-secondary"}`}
              style={{ padding: "0 18px", borderRadius: "var(--r-lg)", fontSize: 14, fontWeight: 800, flexShrink: 0 }}
            >
              Add
            </button>
          </div>

          {players.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {players.map((p, i) => (
                <span
                  key={p.id}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: "var(--volt-50)", border: "1px solid var(--volt-200)",
                    borderRadius: "var(--r-pill)", padding: "5px 10px 5px 12px",
                    fontSize: 13, color: "var(--ink-800)", fontWeight: 600,
                    animation: `pb-pop 250ms ${i * 30}ms var(--ease-spring) both`,
                  }}
                >
                  {p.name}
                  <button
                    onClick={() => removePlayer(p.id)}
                    style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}
                    aria-label={`Remove ${p.name}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          {players.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0, fontStyle: "italic" }}>Add at least 4 players to start.</p>
          )}
        </div>

        {error && (
          <div className="pb-error">{error}</div>
        )}

        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={`pb-btn ${canGenerate ? "pb-btn-volt" : "pb-btn-secondary"}`}
          style={{ padding: 18, fontSize: 16, borderRadius: "var(--r-xl)", animation: "pb-rise 350ms 150ms var(--ease-out) both" }}
        >
          {generating ? "Generating…" : `Generate ${rounds} Round${rounds !== 1 ? "s" : ""} →`}
        </button>

        {need > 0 && (
          <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-3)", margin: 0, fontFamily: "var(--font-mono)" }}>
            {need} more player{need !== 1 ? "s" : ""} needed
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build to verify**

```bash
pnpm --filter @picklebaddies/web build
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/src/app/quick/page.tsx
git commit -m "feat(quick): redesign setup page with volt/ink system + animations

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Redesign live session page + animations

**Files:**
- Modify: `apps/web/src/app/quick/[sessionId]/page.tsx`

- [ ] **Step 1: Replace entire live session page**

```tsx
// apps/web/src/app/quick/[sessionId]/page.tsx
"use client";

import { useState, useEffect, use } from "react";
import type { QuickSession, QuickScore } from "@/lib/quick-sessions/types";
import { loadSessionFromStorage, updateSessionInStorage } from "@/lib/quick-sessions/storage";
import { loadSessionFromFirestore, saveScoreToFirestore } from "@/lib/quick-sessions/firestore";
import { computeMatchKey, getWinner } from "@/lib/quick-sessions/score";
import { computeMatchStates } from "@/lib/quick-sessions/queue";
import type { GeneratedMatch } from "@picklebaddies/match-engine";

interface ScoreModalProps {
  match: GeneratedMatch;
  playerNames: Record<string, string>;
  initialScore?: QuickScore;
  onSave: (teamAScore: number, teamBScore: number) => Promise<void>;
  onClose: () => void;
}

function ScoreModal({ match, playerNames, initialScore, onSave, onClose }: ScoreModalProps) {
  const [scoreA, setScoreA] = useState(initialScore ? String(initialScore.teamAScore) : "");
  const [scoreB, setScoreB] = useState(initialScore ? String(initialScore.teamBScore) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const teamA = `${playerNames[match.teamA[0]] ?? "?"} & ${playerNames[match.teamA[1]] ?? "?"}`;
  const teamB = `${playerNames[match.teamB[0]] ?? "?"} & ${playerNames[match.teamB[1]] ?? "?"}`;

  async function handleSave() {
    const a = parseInt(scoreA, 10);
    const b = parseInt(scoreB, 10);
    if (isNaN(a) || isNaN(b) || a < 0 || b < 0) { setErr("Enter valid scores."); return; }
    if (a === b) { setErr("Scores can't tie — one team must win."); return; }
    setSaving(true);
    try { await onSave(a, b); onClose(); }
    catch { setErr("Save failed. Try again."); setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,36,28,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 999, padding: "0 0 20px" }}>
      <div style={{ background: "var(--surface)", borderRadius: "var(--r-2xl) var(--r-2xl) var(--r-lg) var(--r-lg)", padding: 20, width: "100%", maxWidth: 480, margin: "0 16px", border: "1.5px solid var(--border-strong)", boxShadow: "var(--shadow-lg)", animation: "pb-rise 220ms var(--ease-spring) both" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: "var(--volt-600)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-mono)" }}>
            Court {match.courtId.replace("court-", "")}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "var(--text-3)", cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          {[{ label: teamA, value: scoreA, set: setScoreA }, { label: teamB, value: scoreB, set: setScoreB }].map((side, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              {i === 1 && <span style={{ fontSize: 16, color: "var(--text-3)", fontWeight: 700, display: "block", margin: "0 -6px 8px" }}>vs</span>}
              <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{side.label}</div>
              <input
                type="number" min={0} value={side.value}
                onChange={(e) => side.set(e.target.value)}
                placeholder="0"
                className="pb-input"
                style={{ width: "100%", textAlign: "center", fontSize: 28, fontWeight: 900, padding: "10px 0", boxSizing: "border-box" }}
              />
            </div>
          ))}
        </div>

        {err && <p style={{ fontSize: 12, color: "var(--danger)", margin: "0 0 10px", textAlign: "center" }}>{err}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="pb-btn pb-btn-volt"
          style={{ padding: 14, fontSize: 15 }}
        >
          {saving ? "Saving…" : "Save Score"}
        </button>
      </div>
    </div>
  );
}

interface MatchCardProps {
  match: GeneratedMatch;
  playerNames: Record<string, string>;
  score: QuickScore | undefined;
  state: "done" | "live" | "up_next";
  animationDelay?: number;
  onTap: () => void;
}

function MatchCard({ match, playerNames, score, state, animationDelay = 0, onTap }: MatchCardProps) {
  const teamA = `${playerNames[match.teamA[0]] ?? "?"} & ${playerNames[match.teamA[1]] ?? "?"}`;
  const teamB = `${playerNames[match.teamB[0]] ?? "?"} & ${playerNames[match.teamB[1]] ?? "?"}`;
  const winner = score ? getWinner(score.teamAScore, score.teamBScore) : null;
  const isLive = state === "live";
  const isDone = state === "done";

  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: "var(--r-lg)",
        padding: 14,
        border: isLive ? "2px solid var(--volt-400)" : "1px solid var(--border)",
        marginBottom: 8,
        boxShadow: isLive ? "var(--shadow-volt)" : "var(--shadow-xs)",
        animation: `pb-rise 300ms ${animationDelay}ms var(--ease-out) both, ${isLive ? "pb-pulse 2s 500ms ease-in-out infinite" : "none"}`,
        transition: "box-shadow 0.2s, border-color 0.2s",
      }}
    >
      <div style={{ fontSize: 9, color: isLive ? "var(--volt-600)" : "var(--text-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
        {isLive ? "⚡ " : ""}Court {match.courtId.replace("court-", "")}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 700, color: score ? (winner === "a" ? "var(--text-1)" : "var(--text-3)") : "var(--text-1)" }}>
          {teamA}
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {(["a", "b"] as const).map((side, i) => {
            const s = side === "a" ? score?.teamAScore : score?.teamBScore;
            const isWinner = winner === side;
            return (
              <>
                {i === 1 && <span style={{ fontSize: 13, color: "var(--text-3)" }}>–</span>}
                <div
                  key={side}
                  style={{
                    background: score ? (isWinner ? "var(--volt-100)" : "var(--surface-sunken)") : "var(--surface-sunken)",
                    border: score ? (isWinner ? "2px solid var(--volt-500)" : "1px solid var(--border)") : isLive ? "2px dashed var(--volt-400)" : "1px dashed var(--border)",
                    borderRadius: "var(--r-sm)",
                    padding: "6px 12px",
                    fontSize: 18,
                    fontWeight: 900,
                    color: score ? (isWinner ? "var(--ink-800)" : "var(--text-3)") : "var(--text-3)",
                    minWidth: 36,
                    textAlign: "center",
                  }}
                >
                  {s !== undefined ? s : "—"}
                </div>
              </>
            );
          })}
        </div>
        <div style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 700, color: score ? (winner === "b" ? "var(--text-1)" : "var(--text-3)") : "var(--text-1)" }}>
          {teamB}
        </div>
      </div>

      {isLive && !score && (
        <button
          onClick={onTap}
          className="pb-btn pb-btn-volt"
          style={{ marginTop: 12, padding: "10px 0", fontSize: 13 }}
        >
          Enter score
        </button>
      )}
      {isDone && (
        <button
          onClick={onTap}
          style={{ marginTop: 6, width: "100%", background: "none", border: "none", color: "var(--text-3)", fontSize: 11, cursor: "pointer", padding: "4px 0" }}
        >
          Edit score
        </button>
      )}
    </div>
  );
}

export default function LiveSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const [session, setSession] = useState<QuickSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeMatch, setActiveMatch] = useState<GeneratedMatch | null>(null);

  useEffect(() => {
    async function load() {
      let s = loadSessionFromStorage(sessionId);
      if (!s) s = await loadSessionFromFirestore(sessionId);
      if (!s) { setNotFound(true); setLoading(false); return; }
      setSession(s);
      setLoading(false);
    }
    load();
  }, [sessionId]);

  async function handleSaveScore(match: GeneratedMatch, teamAScore: number, teamBScore: number) {
    if (!session) return;
    const score = { teamAScore, teamBScore };
    const key = computeMatchKey(match.roundNumber, match.courtId);
    const updated: QuickSession = { ...session, scores: { ...session.scores, [key]: score } };
    setSession(updated);
    updateSessionInStorage(sessionId, () => updated);
    await saveScoreToFirestore(sessionId, match.roundNumber, match.courtId, score);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "grid", placeItems: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-3)" }}>Loading session…</span>
      </div>
    );
  }

  if (notFound || !session) {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <p style={{ color: "var(--danger)", fontSize: 15, fontWeight: 700, margin: 0 }}>Session not found.</p>
        <a href="/quick" style={{ color: "var(--volt-600)", fontSize: 14, textDecoration: "none" }}>Start a new session →</a>
      </div>
    );
  }

  const playerNames: Record<string, string> = Object.fromEntries(session.players.map((p) => [p.id, p.name]));
  const roundNumbers = [...new Set(session.matches.map((m) => m.roundNumber))].sort((a, b) => a - b);
  const matchStates = computeMatchStates(session.matches, session.scores, session.courts);
  const totalMatches = session.matches.length;
  const doneCount = [...matchStates.values()].filter((s) => s === "done").length;
  const allDone = doneCount === totalMatches;

  function roundBadge(roundMatches: GeneratedMatch[]): "done" | "playing" | "up_next" {
    const states = roundMatches.map((m) => matchStates.get(computeMatchKey(m.roundNumber, m.courtId)));
    if (states.every((s) => s === "done")) return "done";
    if (states.some((s) => s === "live")) return "playing";
    return "up_next";
  }

  let cardDelay = 0;

  return (
    <div className="pb-net-bg" style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: "var(--surface)", padding: "12px 20px", borderBottom: "1px solid var(--border)", animation: "pb-rise 300ms var(--ease-out) both" }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 15, color: "var(--text-1)" }}>{session.name}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 3 }}>
          <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
            {session.players.length} players · {session.courts} courts · {roundNumbers.length} rounds
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
              {doneCount}/{totalMatches} done
            </span>
            <span style={{ fontSize: 11, color: "var(--volt-600)", background: "var(--volt-50)", border: "1px solid var(--volt-200)", borderRadius: "var(--r-sm)", padding: "2px 8px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
              {sessionId}
            </span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 640, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        {roundNumbers.map((roundNumber) => {
          const roundMatches = session.matches.filter((m) => m.roundNumber === roundNumber);
          const roundSitOuts = session.sitOuts.filter((s) => s.roundNumber === roundNumber);
          const badge = roundBadge(roundMatches);

          return (
            <div key={roundNumber} style={{ opacity: badge === "up_next" ? 0.55 : 1, transition: "opacity 0.3s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--font-mono)", fontWeight: 700 }}>Round {roundNumber}</span>
                <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
                {badge === "done" && <span style={{ fontSize: 10, color: "var(--success, #2d7a3a)", background: "var(--success-bg, #edfae0)", border: "1px solid var(--success-border, #b0d890)", borderRadius: "var(--r-pill)", padding: "2px 10px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>Done</span>}
                {badge === "playing" && <span style={{ fontSize: 10, color: "var(--volt-700)", background: "var(--volt-50)", border: "1px solid var(--volt-200)", borderRadius: "var(--r-pill)", padding: "2px 10px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>Playing</span>}
                {badge === "up_next" && <span style={{ fontSize: 10, color: "var(--text-3)", background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: "var(--r-pill)", padding: "2px 10px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>Up next</span>}
              </div>

              {roundMatches.map((match) => {
                const key = computeMatchKey(match.roundNumber, match.courtId);
                const state = matchStates.get(key) ?? "up_next";
                const delay = cardDelay;
                cardDelay += 40;
                return (
                  <MatchCard
                    key={key}
                    match={match}
                    playerNames={playerNames}
                    score={session.scores[key]}
                    state={state}
                    animationDelay={delay}
                    onTap={() => setActiveMatch(match)}
                  />
                );
              })}

              {roundSitOuts.length > 0 && (
                <p style={{ fontSize: 11, color: "var(--text-3)", margin: "4px 0 0", paddingLeft: 4, fontStyle: "italic" }}>
                  Sitting out: {roundSitOuts.map((s) => playerNames[s.playerId] ?? s.playerId).join(", ")}
                </p>
              )}
            </div>
          );
        })}

        {allDone && (
          <div style={{ textAlign: "center", padding: "24px 16px", animation: "pb-pop 400ms var(--ease-spring) both" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 16, color: "var(--text-1)", marginBottom: 4 }}>All done!</div>
            <p style={{ color: "var(--text-3)", fontSize: 13, margin: "0 0 16px" }}>Commit stats to carry fairness into the next session.</p>
            <a href="/quick" className="pb-btn pb-btn-secondary" style={{ display: "inline-flex", width: "auto", padding: "10px 24px", textDecoration: "none", borderRadius: "var(--r-pill)" }}>
              New session →
            </a>
          </div>
        )}
      </div>

      {activeMatch && (
        <ScoreModal
          match={activeMatch}
          playerNames={playerNames}
          initialScore={session.scores[computeMatchKey(activeMatch.roundNumber, activeMatch.courtId)]}
          onSave={(a, b) => handleSaveScore(activeMatch, a, b)}
          onClose={() => setActiveMatch(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

```bash
pnpm --filter @picklebaddies/web build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/quick/\[sessionId\]/page.tsx
git commit -m "feat(quick): redesign live session page — volt/ink system, pulse animation, rolling queue UI

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Roster types + Firestore CRUD

**Files:**
- Create: `apps/web/src/lib/quick-sessions/roster.ts`

- [ ] **Step 1: Create roster.ts**

```ts
// apps/web/src/lib/quick-sessions/roster.ts
import {
  collection, doc, getDocs, setDoc, getDoc,
} from "firebase/firestore";
import { getFirebaseServices } from "@/lib/firebase/client";
import type { QuickPlayer, RosterPlayer, PlayerStats } from "./types";

function emptyStats(): PlayerStats {
  return {
    totalGames: 0,
    totalSitOuts: 0,
    sessionsPlayed: 0,
    partnerCounts: {},
    opponentCounts: {},
    lastPlayedAt: 0,
  };
}

function rosterRef(uid: string) {
  const { db } = getFirebaseServices();
  return collection(db, "users", uid, "players");
}

function playerRef(uid: string, playerId: string) {
  const { db } = getFirebaseServices();
  return doc(db, "users", uid, "players", playerId);
}

export async function loadRoster(uid: string): Promise<RosterPlayer[]> {
  const snap = await getDocs(rosterRef(uid));
  return snap.docs.map((d) => d.data() as RosterPlayer);
}

export async function upsertRosterPlayer(uid: string, player: QuickPlayer): Promise<RosterPlayer> {
  const ref = playerRef(uid, player.id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const existing = snap.data() as RosterPlayer;
    if (existing.name !== player.name || existing.skillLevel !== player.skillLevel) {
      await setDoc(ref, { ...existing, name: player.name, skillLevel: player.skillLevel }, { merge: true });
      return { ...existing, name: player.name, skillLevel: player.skillLevel };
    }
    return existing;
  }
  const fresh: RosterPlayer = { ...player, stats: emptyStats() };
  await setDoc(ref, fresh);
  return fresh;
}

export async function upsertAllRosterPlayers(uid: string, players: QuickPlayer[]): Promise<RosterPlayer[]> {
  return Promise.all(players.map((p) => upsertRosterPlayer(uid, p)));
}
```

- [ ] **Step 2: Build to verify**

```bash
pnpm --filter @picklebaddies/web build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/quick-sessions/roster.ts
git commit -m "feat(quick): add roster Firestore CRUD for users/{uid}/players

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Stats aggregation pure function (TDD)

**Files:**
- Create: `apps/web/src/lib/quick-sessions/stats.ts`
- Create: `apps/web/src/lib/quick-sessions/stats.test.ts`
- Modify: `apps/web/src/lib/quick-sessions/firestore.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/quick-sessions/stats.test.ts
import { describe, it, expect } from "vitest";
import { computeSessionDelta } from "./stats";
import type { GeneratedMatch, GeneratedSitOut } from "@picklebaddies/match-engine";

function match(r: number, c: string, tA: [string, string], tB: [string, string]): GeneratedMatch {
  return { roundNumber: r, courtId: c, matchNumber: 1, teamA: tA, teamB: tB };
}

function sitOut(r: number, playerId: string): GeneratedSitOut {
  return { roundNumber: r, playerId, reason: "rotation" };
}

describe("computeSessionDelta", () => {
  it("counts games per player", () => {
    const matches = [match(1, "c1", ["a", "b"], ["c", "d"])];
    const delta = computeSessionDelta(matches, []);
    expect(delta.gamesPerPlayer.get("a")).toBe(1);
    expect(delta.gamesPerPlayer.get("b")).toBe(1);
    expect(delta.gamesPerPlayer.get("c")).toBe(1);
    expect(delta.gamesPerPlayer.get("d")).toBe(1);
  });

  it("counts sit-outs per player", () => {
    const delta = computeSessionDelta([], [sitOut(1, "x"), sitOut(2, "x"), sitOut(1, "y")]);
    expect(delta.sitOutsPerPlayer.get("x")).toBe(2);
    expect(delta.sitOutsPerPlayer.get("y")).toBe(1);
  });

  it("counts partner pairs symmetrically (one entry per pair)", () => {
    const matches = [match(1, "c1", ["a", "b"], ["c", "d"])];
    const delta = computeSessionDelta(matches, []);
    const abKey = "a|b";
    const cdKey = "c|d";
    expect(delta.partnerCounts.get(abKey)).toBe(1);
    expect(delta.partnerCounts.get(cdKey)).toBe(1);
  });

  it("counts opponent pairs", () => {
    const matches = [match(1, "c1", ["a", "b"], ["c", "d"])];
    const delta = computeSessionDelta(matches, []);
    expect(delta.opponentCounts.get("a|c")).toBe(1);
    expect(delta.opponentCounts.get("a|d")).toBe(1);
    expect(delta.opponentCounts.get("b|c")).toBe(1);
    expect(delta.opponentCounts.get("b|d")).toBe(1);
  });

  it("accumulates across multiple matches", () => {
    const matches = [
      match(1, "c1", ["a", "b"], ["c", "d"]),
      match(2, "c1", ["a", "b"], ["c", "d"]),
    ];
    const delta = computeSessionDelta(matches, []);
    expect(delta.gamesPerPlayer.get("a")).toBe(2);
    expect(delta.partnerCounts.get("a|b")).toBe(2);
    expect(delta.opponentCounts.get("a|c")).toBe(2);
  });

  it("empty session produces empty delta", () => {
    const delta = computeSessionDelta([], []);
    expect(delta.gamesPerPlayer.size).toBe(0);
    expect(delta.sitOutsPerPlayer.size).toBe(0);
    expect(delta.partnerCounts.size).toBe(0);
    expect(delta.opponentCounts.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm --filter @picklebaddies/web exec vitest run src/lib/quick-sessions/stats.test.ts
```

Expected: FAIL — `stats` module not found.

- [ ] **Step 3: Implement computeSessionDelta**

```ts
// apps/web/src/lib/quick-sessions/stats.ts
import type { GeneratedMatch, GeneratedSitOut } from "@picklebaddies/match-engine";

export interface SessionDelta {
  gamesPerPlayer: Map<string, number>;
  sitOutsPerPlayer: Map<string, number>;
  partnerCounts: Map<string, number>;
  opponentCounts: Map<string, number>;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function inc(m: Map<string, number>, k: string) {
  m.set(k, (m.get(k) ?? 0) + 1);
}

export function computeSessionDelta(
  matches: GeneratedMatch[],
  sitOuts: GeneratedSitOut[]
): SessionDelta {
  const gamesPerPlayer = new Map<string, number>();
  const sitOutsPerPlayer = new Map<string, number>();
  const partnerCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();

  for (const m of matches) {
    for (const id of [...m.teamA, ...m.teamB]) inc(gamesPerPlayer, id);
    inc(partnerCounts, pairKey(m.teamA[0], m.teamA[1]));
    inc(partnerCounts, pairKey(m.teamB[0], m.teamB[1]));
    for (const a of m.teamA) for (const b of m.teamB) inc(opponentCounts, pairKey(a, b));
  }

  for (const s of sitOuts) inc(sitOutsPerPlayer, s.playerId);

  return { gamesPerPlayer, sitOutsPerPlayer, partnerCounts, opponentCounts };
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
pnpm --filter @picklebaddies/web exec vitest run src/lib/quick-sessions/stats.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Add commitSessionStats to firestore.ts**

Append to `apps/web/src/lib/quick-sessions/firestore.ts`:

```ts
import {
  doc, getDoc, setDoc, updateDoc, writeBatch,
} from "firebase/firestore";
// (add writeBatch to the existing import — merge with current import line)
import { computeSessionDelta } from "./stats";
import type { PlayerStats, RosterPlayer, QuickSession } from "./types";

export async function commitSessionStats(
  session: QuickSession,
  ownerUid: string
): Promise<void> {
  const { db } = getFirebaseServices();

  // idempotency guard
  const sessionSnap = await getDoc(doc(db, "quickSessions", session.id));
  if (sessionSnap.data()?.statsCommitted === true) return;

  const delta = computeSessionDelta(session.matches, session.sitOuts);
  const now = Date.now();
  const rosterIds = session.rosterPlayerIds ?? session.players.map((p) => p.id);

  for (const playerId of rosterIds) {
    const ref = doc(db, "users", ownerUid, "players", playerId);
    const snap = await getDoc(ref);
    if (!snap.exists()) continue;
    const existing = snap.data() as RosterPlayer;
    const s = existing.stats;

    const mergedPartner = { ...s.partnerCounts };
    delta.partnerCounts.forEach((v, k) => {
      if (k.includes(playerId)) mergedPartner[k] = (mergedPartner[k] ?? 0) + v;
    });
    const mergedOpponent = { ...s.opponentCounts };
    delta.opponentCounts.forEach((v, k) => {
      if (k.includes(playerId)) mergedOpponent[k] = (mergedOpponent[k] ?? 0) + v;
    });

    const updated: PlayerStats = {
      totalGames: s.totalGames + (delta.gamesPerPlayer.get(playerId) ?? 0),
      totalSitOuts: s.totalSitOuts + (delta.sitOutsPerPlayer.get(playerId) ?? 0),
      sessionsPlayed: s.sessionsPlayed + 1,
      partnerCounts: mergedPartner,
      opponentCounts: mergedOpponent,
      lastPlayedAt: now,
    };

    await updateDoc(ref, { stats: updated });
  }

  await updateDoc(doc(db, "quickSessions", session.id), { statsCommitted: true });
}
```

- [ ] **Step 6: Update the import in firestore.ts to include writeBatch**

The full import line at top of `apps/web/src/lib/quick-sessions/firestore.ts` should be:

```ts
import { doc, getDoc, setDoc, updateDoc, writeBatch } from "firebase/firestore";
```

(Note: `writeBatch` is imported but not used directly here — `commitSessionStats` uses sequential `updateDoc` for clarity. Remove `writeBatch` from this import if TypeScript warns about unused imports.)

Actually, `commitSessionStats` uses `updateDoc` in a loop, so `writeBatch` is unused. Keep the import clean:

```ts
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
```

- [ ] **Step 7: Build to verify**

```bash
pnpm --filter @picklebaddies/web build
```

Expected: clean build.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/quick-sessions/stats.ts apps/web/src/lib/quick-sessions/stats.test.ts apps/web/src/lib/quick-sessions/firestore.ts
git commit -m "feat(quick): add session stats aggregation + commitSessionStats

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Engine priors — seedStateFromPriors (TDD)

**Files:**
- Modify: `packages/match-engine/src/types.ts`
- Create: `packages/match-engine/src/priors.ts`
- Create: `packages/match-engine/src/priors.test.ts`
- Modify: `packages/match-engine/src/generate.ts`
- Modify: `packages/match-engine/src/index.ts`

- [ ] **Step 1: Add PlayerPriors to types.ts**

Append to `packages/match-engine/src/types.ts` (before the closing line):

```ts
export interface PlayerPriors {
  gamesPlayed: number;
  partnerCounts: Record<string, number>;
  opponentCounts: Record<string, number>;
}
```

Also add `priors?` to `EngineInput`:

```ts
export interface EngineInput {
  mode: GenerationMode;
  players: EnginePlayer[];
  courts: EngineCourt[];
  sessionDurationMinutes: number;
  estimatedGameMinutes: number;
  elapsedRounds: number;
  lockedMatches: LockedMatch[];
  seed?: number;
  priors?: Record<string, PlayerPriors>;  // add this line
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// packages/match-engine/src/priors.test.ts
import { describe, it, expect } from "vitest";
import { seedStateFromPriors, normalizePriorGames } from "./priors";
import type { EnginePlayer, PlayerPriors } from "./types";

function player(id: string): EnginePlayer {
  return { playerId: id, displayName: id, skillLevel: "unknown", availableFromRound: 1 };
}

const p = ["a", "b", "c", "d"].map(player);

describe("normalizePriorGames", () => {
  it("subtracts roster min and caps at futureRounds", () => {
    const priors: Record<string, PlayerPriors> = {
      a: { gamesPlayed: 10, partnerCounts: {}, opponentCounts: {} },
      b: { gamesPlayed: 8, partnerCounts: {}, opponentCounts: {} },
      c: { gamesPlayed: 6, partnerCounts: {}, opponentCounts: {} },
      d: { gamesPlayed: 6, partnerCounts: {}, opponentCounts: {} },
    };
    const result = normalizePriorGames(priors, ["a", "b", "c", "d"], 3);
    // min = 6; a=4→capped3, b=2, c=0, d=0
    expect(result.get("a")).toBe(3);
    expect(result.get("b")).toBe(2);
    expect(result.get("c")).toBe(0);
    expect(result.get("d")).toBe(0);
  });

  it("players missing from priors default to 0 games (treated as min)", () => {
    const priors: Record<string, PlayerPriors> = {
      a: { gamesPlayed: 4, partnerCounts: {}, opponentCounts: {} },
    };
    const result = normalizePriorGames(priors, ["a", "b"], 5);
    // b missing → 0, a=4, min=0; a normalized to 4, capped at 5
    expect(result.get("a")).toBe(4);
    expect(result.get("b")).toBe(0);
  });

  it("all equal prior games → all zero", () => {
    const priors: Record<string, PlayerPriors> = {
      a: { gamesPlayed: 5, partnerCounts: {}, opponentCounts: {} },
      b: { gamesPlayed: 5, partnerCounts: {}, opponentCounts: {} },
    };
    const result = normalizePriorGames(priors, ["a", "b"], 3);
    expect(result.get("a")).toBe(0);
    expect(result.get("b")).toBe(0);
  });
});

describe("seedStateFromPriors", () => {
  it("seeds gamesPlayed from normalized priors", () => {
    const priors: Record<string, PlayerPriors> = {
      a: { gamesPlayed: 5, partnerCounts: {}, opponentCounts: {} },
      b: { gamesPlayed: 3, partnerCounts: {}, opponentCounts: {} },
      c: { gamesPlayed: 3, partnerCounts: {}, opponentCounts: {} },
      d: { gamesPlayed: 3, partnerCounts: {}, opponentCounts: {} },
    };
    const state = seedStateFromPriors(p, priors, 4);
    // min=3; a=2, b/c/d=0
    expect(state.gamesPlayed.get("a")).toBe(2);
    expect(state.gamesPlayed.get("b")).toBe(0);
  });

  it("seeds partnerCounts for players in session only", () => {
    const priors: Record<string, PlayerPriors> = {
      a: { gamesPlayed: 0, partnerCounts: { "a|b": 3, "a|z": 7 }, opponentCounts: {} },
      b: { gamesPlayed: 0, partnerCounts: { "a|b": 3 }, opponentCounts: {} },
      c: { gamesPlayed: 0, partnerCounts: {}, opponentCounts: {} },
      d: { gamesPlayed: 0, partnerCounts: {}, opponentCounts: {} },
    };
    const state = seedStateFromPriors(p, priors, 3);
    expect(state.partnerCount.get("a|b")).toBe(3);
    // "a|z" excluded because z not in session
    expect(state.partnerCount.has("a|z")).toBe(false);
  });

  it("seeds opponentCounts for players in session only", () => {
    const priors: Record<string, PlayerPriors> = {
      a: { gamesPlayed: 0, partnerCounts: {}, opponentCounts: { "a|c": 2 } },
      b: { gamesPlayed: 0, partnerCounts: {}, opponentCounts: {} },
      c: { gamesPlayed: 0, partnerCounts: {}, opponentCounts: {} },
      d: { gamesPlayed: 0, partnerCounts: {}, opponentCounts: {} },
    };
    const state = seedStateFromPriors(p, priors, 3);
    expect(state.opponentCount.get("a|c")).toBe(2);
  });

  it("players absent from priors start with zero counts", () => {
    const state = seedStateFromPriors(p, {}, 3);
    expect(state.gamesPlayed.get("a")).toBe(0);
    expect(state.partnerCount.size).toBe(0);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
pnpm --filter @picklebaddies/match-engine exec vitest run src/priors.test.ts
```

Expected: FAIL — `priors` module not found.

- [ ] **Step 4: Implement priors.ts**

```ts
// packages/match-engine/src/priors.ts
import type { EnginePlayer, PlayerPriors } from "./types.js";
import { createInitialState, pairKey, type EngineState } from "./state.js";

export function normalizePriorGames(
  priors: Record<string, PlayerPriors>,
  playerIds: string[],
  futureRounds: number
): Map<string, number> {
  const raw = playerIds.map((id) => priors[id]?.gamesPlayed ?? 0);
  const min = Math.min(...raw);
  return new Map(
    playerIds.map((id, i) => [id, Math.min((raw[i]! - min), futureRounds)])
  );
}

export function seedStateFromPriors(
  players: EnginePlayer[],
  priors: Record<string, PlayerPriors>,
  futureRounds: number
): EngineState {
  const state = createInitialState(players);
  const playerIds = players.map((p) => p.playerId);
  const playerSet = new Set(playerIds);
  const normalizedGames = normalizePriorGames(priors, playerIds, futureRounds);

  for (const p of players) {
    state.gamesPlayed.set(p.playerId, normalizedGames.get(p.playerId) ?? 0);

    const prior = priors[p.playerId];
    if (!prior) continue;

    for (const [key, count] of Object.entries(prior.partnerCounts)) {
      const [a, b] = key.split("|");
      if (a && b && playerSet.has(a) && playerSet.has(b)) {
        state.partnerCount.set(pairKey(a, b), count);
      }
    }

    for (const [key, count] of Object.entries(prior.opponentCounts)) {
      const [a, b] = key.split("|");
      if (a && b && playerSet.has(a) && playerSet.has(b)) {
        state.opponentCount.set(pairKey(a, b), count);
      }
    }
  }

  return state;
}
```

- [ ] **Step 5: Run tests to confirm pass**

```bash
pnpm --filter @picklebaddies/match-engine exec vitest run src/priors.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 6: Update generate.ts to use priors**

In `packages/match-engine/src/generate.ts`, reorder so `futureRounds` is computed first, then use it for priors:

```ts
import type { EngineInput, EngineOutput, GeneratedMatch, GeneratedSitOut } from "./types.js";
import { DEFAULT_SEED, PLAYERS_PER_MATCH } from "./types.js";
import { computeFutureRoundCount } from "./rounds.js";
import { createInitialState, seedStateFromLocked, type EngineState } from "./state.js";
import { seedStateFromPriors } from "./priors.js";
import { buildRound } from "./round.js";
import { computeFairness } from "./fairness.js";
import { seededOrder } from "./rng.js";

export { ALGORITHM_VERSION } from "./types.js";

export function generateSchedule(input: EngineInput): EngineOutput {
  const futureRounds = computeFutureRoundCount(input);

  const state: EngineState =
    input.mode === "rebalance"
      ? seedStateFromLocked(input.players, input.lockedMatches)
      : input.priors
        ? seedStateFromPriors(input.players, input.priors, futureRounds)
        : createInitialState(input.players);

  const order = seededOrder(input.players.map((p) => p.playerId), input.seed ?? DEFAULT_SEED);

  const lockedRounds = new Set(input.lockedMatches.map((m) => m.roundNumber));
  const maxLockedRound = input.lockedMatches.reduce((mx, m) => Math.max(mx, m.roundNumber), 0);
  const firstFutureRound = Math.max(input.elapsedRounds + 1, maxLockedRound + 1);

  const matches: GeneratedMatch[] = [];
  const sitOuts: GeneratedSitOut[] = [];

  for (let r = 0; r < futureRounds; r++) {
    const roundNumber = firstFutureRound + r;
    if (lockedRounds.has(roundNumber)) continue;
    const available = input.players.filter((p) => p.availableFromRound <= roundNumber);
    if (available.length < PLAYERS_PER_MATCH) continue;
    const res = buildRound(state, available, input.courts, roundNumber, order);
    matches.push(...res.matches);
    sitOuts.push(...res.sitOuts);
  }

  return { matches, sitOuts, metadata: computeFairness(state, { matches, sitOuts }, input) };
}
```

- [ ] **Step 7: Export from index.ts**

Update `packages/match-engine/src/index.ts`:

```ts
// Public API of the pure match engine (DELTA_SPEC D3).
export * from "./types.js";
export { computeFutureRoundCount, maxPlayersPerRound } from "./rounds.js";
export { mulberry32, seededOrder } from "./rng.js";
export { generateSchedule, ALGORITHM_VERSION } from "./generate.js";
export { pairKey } from "./state.js";
export { seedStateFromPriors, normalizePriorGames } from "./priors.js";
```

- [ ] **Step 8: Run all engine tests**

```bash
pnpm --filter @picklebaddies/match-engine test
```

Expected: all tests PASS (including existing generate/round/fairness tests).

- [ ] **Step 9: Commit**

```bash
git add packages/match-engine/src/types.ts packages/match-engine/src/priors.ts packages/match-engine/src/priors.test.ts packages/match-engine/src/generate.ts packages/match-engine/src/index.ts
git commit -m "feat(engine): add PlayerPriors + seedStateFromPriors for cross-session fairness

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Roster picker in setup page + priors wiring

**Files:**
- Modify: `apps/web/src/lib/quick-sessions/engine.ts`
- Modify: `apps/web/src/app/quick/page.tsx`

- [ ] **Step 1: Update engine.ts to accept and pass priors**

```ts
// apps/web/src/lib/quick-sessions/engine.ts
import type { EngineInput, PlayerPriors } from "@picklebaddies/match-engine";
import type { QuickPlayer, QuickSessionSetup } from "./types";

export function buildEngineInput(
  setup: QuickSessionSetup,
  players: QuickPlayer[],
  priors?: Record<string, PlayerPriors>
): EngineInput {
  return {
    mode: "initial",
    players: players.map((p) => ({
      playerId: p.id,
      displayName: p.name,
      skillLevel: p.skillLevel,
      availableFromRound: 1,
    })),
    courts: Array.from({ length: setup.courts }, (_, i) => ({
      courtId: `court-${i + 1}`,
      name: `Court ${i + 1}`,
      courtNumber: i + 1,
    })),
    sessionDurationMinutes: setup.rounds,
    estimatedGameMinutes: 1,
    elapsedRounds: 0,
    lockedMatches: [],
    priors,
  };
}
```

- [ ] **Step 2: Replace setup page with roster-aware version**

Replace the entire content of `apps/web/src/app/quick/page.tsx`:

```tsx
// apps/web/src/app/quick/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import { generateSchedule, type PlayerPriors } from "@picklebaddies/match-engine";
import type { QuickPlayer, QuickSessionSetup, QuickSession, RosterPlayer } from "@/lib/quick-sessions/types";
import { buildEngineInput } from "@/lib/quick-sessions/engine";
import { saveSessionToStorage } from "@/lib/quick-sessions/storage";
import { saveSessionToFirestore } from "@/lib/quick-sessions/firestore";
import { loadRoster, upsertAllRosterPlayers } from "@/lib/quick-sessions/roster";

const SKILL_OPTIONS = ["unknown", "beginner", "intermediate", "advanced"] as const;

function generateId(): string {
  return crypto.randomUUID().split("-")[0]!;
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="pb-btn pb-btn-secondary"
        style={{ width: 40, height: 40, padding: 0, borderRadius: "var(--r-md)", fontSize: 20, fontWeight: 900 }}
      >
        −
      </button>
      <div style={{ background: "var(--surface-sunken)", border: "1.5px solid var(--border)", borderRadius: "var(--r-md)", padding: "8px 0", fontSize: 16, fontWeight: 800, color: "var(--text-1)", flex: 1, textAlign: "center" }}>
        {value}
      </div>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="pb-btn pb-btn-volt"
        style={{ width: 40, height: 40, padding: 0, borderRadius: "var(--r-md)", fontSize: 20, fontWeight: 900 }}
      >
        +
      </button>
    </div>
  );
}

export default function QuickSessionPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState("Quick Session");
  const [courts, setCourts] = useState(2);
  const [rounds, setRounds] = useState(3);
  const [players, setPlayers] = useState<QuickPlayer[]>([]);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [playerName, setPlayerName] = useState("");
  const [playerSkill, setPlayerSkill] = useState<QuickPlayer["skillLevel"]>("unknown");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadRoster(user.uid)
      .then(setRoster)
      .finally(() => setRosterLoading(false));
  }, [user]);

  function toggleRosterPlayer(rp: RosterPlayer) {
    const already = players.find((p) => p.id === rp.id);
    if (already) {
      setPlayers((prev) => prev.filter((p) => p.id !== rp.id));
    } else {
      setPlayers((prev) => [...prev, { id: rp.id, name: rp.name, skillLevel: rp.skillLevel }]);
    }
  }

  function addPlayer() {
    const trimmed = playerName.trim();
    if (!trimmed) return;
    setPlayers((prev) => [...prev, { id: crypto.randomUUID(), name: trimmed, skillLevel: playerSkill }]);
    setPlayerName("");
    setPlayerSkill("unknown");
  }

  function removePlayer(id: string) {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  }

  function buildPriors(): Record<string, PlayerPriors> | undefined {
    const rosterMap = new Map(roster.map((r) => [r.id, r]));
    const result: Record<string, PlayerPriors> = {};
    let hasPriors = false;
    for (const p of players) {
      const rp = rosterMap.get(p.id);
      if (rp && (rp.stats.totalGames > 0 || Object.keys(rp.stats.partnerCounts).length > 0)) {
        result[p.id] = {
          gamesPlayed: rp.stats.totalGames,
          partnerCounts: rp.stats.partnerCounts,
          opponentCounts: rp.stats.opponentCounts,
        };
        hasPriors = true;
      }
    }
    return hasPriors ? result : undefined;
  }

  async function handleGenerate() {
    if (players.length < 4) return;
    setGenerating(true);
    setError(null);
    try {
      const setup: QuickSessionSetup = { name: name.trim() || "Quick Session", courts, rounds };
      const priors = buildPriors();
      const engineInput = buildEngineInput(setup, players, priors);
      const output = generateSchedule(engineInput);

      const session: QuickSession = {
        id: generateId(),
        name: setup.name,
        courts: setup.courts,
        players,
        matches: output.matches,
        sitOuts: output.sitOuts,
        scores: {},
        createdAt: Date.now(),
        ownerUid: user?.uid,
        rosterPlayerIds: players.map((p) => p.id),
        statsCommitted: false,
      };

      // Upsert new players into roster
      if (user) {
        await upsertAllRosterPlayers(user.uid, players);
      }

      saveSessionToStorage(session);
      await saveSessionToFirestore(session);
      router.push(`/quick/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate. Try again.");
      setGenerating(false);
    }
  }

  const canGenerate = players.length >= 4 && !generating;
  const need = Math.max(0, 4 - players.length);
  const rosterNotInSession = roster.filter((r) => !players.find((p) => p.id === r.id));

  return (
    <div
      className="pb-net-bg"
      style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", flexDirection: "column" }}
    >
      {/* Header */}
      <div style={{ background: "var(--surface)", padding: "14px 20px", borderBottom: "1px solid var(--border)", animation: "pb-rise 300ms var(--ease-out) both" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "var(--r-md)", background: "var(--volt-500)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 40 40" fill="none">
              <path d="M20 5 L35 20 L20 35 L5 20 Z" fill="none" stroke="var(--ink-800)" strokeWidth="3" />
              <circle cx="20" cy="20" r="5" fill="var(--ink-800)" />
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 15, color: "var(--text-1)", letterSpacing: "-0.01em" }}>Quick Session</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>casual · fairness-aware</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: "16px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 640, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>

        {/* Session config */}
        <div style={{ background: "var(--surface)", borderRadius: "var(--r-xl)", padding: 18, border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", animation: "pb-rise 350ms 50ms var(--ease-out) both" }}>
          <div style={{ fontSize: 10, color: "var(--volt-600)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14, fontFamily: "var(--font-mono)", fontWeight: 700 }}>Setup</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-2)", marginBottom: 5, fontWeight: 600 }}>Session name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pb-input"
                style={{ width: "100%", padding: "10px 14px", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-2)", marginBottom: 5, fontWeight: 600 }}>Courts</label>
              <Stepper value={courts} min={1} max={8} onChange={setCourts} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-2)", marginBottom: 5, fontWeight: 600 }}>Rounds</label>
              <Stepper value={rounds} min={1} max={10} onChange={setRounds} />
            </div>
          </div>
        </div>

        {/* Players */}
        <div style={{ background: "var(--surface)", borderRadius: "var(--r-xl)", padding: 18, border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", animation: "pb-rise 350ms 100ms var(--ease-out) both" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "var(--volt-600)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--font-mono)", fontWeight: 700 }}>Players</div>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>{players.length} selected</span>
          </div>

          {/* Roster chips */}
          {!rosterLoading && rosterNotInSession.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 6, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Your roster</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {rosterNotInSession.map((rp) => (
                  <button
                    key={rp.id}
                    onClick={() => toggleRosterPlayer(rp)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      background: "var(--surface-sunken)", border: "1px solid var(--border)",
                      borderRadius: "var(--r-pill)", padding: "5px 12px",
                      fontSize: 13, color: "var(--text-2)", fontWeight: 600, cursor: "pointer",
                      transition: "background 0.15s, border-color 0.15s",
                    }}
                  >
                    + {rp.name}
                    {rp.stats.totalGames > 0 && (
                      <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                        {rp.stats.totalGames}g
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected players */}
          {players.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {players.map((p, i) => (
                <span
                  key={p.id}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: "var(--volt-50)", border: "1px solid var(--volt-200)",
                    borderRadius: "var(--r-pill)", padding: "5px 10px 5px 12px",
                    fontSize: 13, color: "var(--ink-800)", fontWeight: 600,
                    animation: `pb-pop 250ms ${i * 30}ms var(--ease-spring) both`,
                  }}
                >
                  {p.name}
                  <button
                    onClick={() => removePlayer(p.id)}
                    style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}
                    aria-label={`Remove ${p.name}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Add new player */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPlayer()}
              placeholder="New player name…"
              className="pb-input"
              style={{ flex: 1, padding: "10px 14px" }}
            />
            <select
              value={playerSkill}
              onChange={(e) => setPlayerSkill(e.target.value as QuickPlayer["skillLevel"])}
              className="pb-input"
              style={{ padding: "10px 10px", fontSize: 13 }}
            >
              {SKILL_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <button
              onClick={addPlayer}
              disabled={!playerName.trim()}
              className={`pb-btn ${playerName.trim() ? "pb-btn-volt" : "pb-btn-secondary"}`}
              style={{ padding: "0 18px", borderRadius: "var(--r-lg)", fontSize: 14, fontWeight: 800, flexShrink: 0 }}
            >
              Add
            </button>
          </div>

          {players.length === 0 && !rosterLoading && roster.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-3)", margin: "10px 0 0", fontStyle: "italic" }}>Add at least 4 players to start.</p>
          )}
        </div>

        {error && <div className="pb-error">{error}</div>}

        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={`pb-btn ${canGenerate ? "pb-btn-volt" : "pb-btn-secondary"}`}
          style={{ padding: 18, fontSize: 16, borderRadius: "var(--r-xl)", animation: "pb-rise 350ms 150ms var(--ease-out) both" }}
        >
          {generating ? "Generating…" : `Generate ${rounds} Round${rounds !== 1 ? "s" : ""} →`}
        </button>

        {need > 0 && (
          <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-3)", margin: 0, fontFamily: "var(--font-mono)" }}>
            {need} more player{need !== 1 ? "s" : ""} needed
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build to verify**

```bash
pnpm --filter @picklebaddies/web build
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/quick-sessions/engine.ts apps/web/src/app/quick/page.tsx
git commit -m "feat(quick): roster picker + cross-session fairness priors in generate flow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Finish session button + commitSessionStats

**Files:**
- Modify: `apps/web/src/app/quick/[sessionId]/page.tsx`

- [ ] **Step 1: Add finish button and stats commit to the live session page**

Import `commitSessionStats` and `useAuth`, add finishing state, and update the `allDone` section.

Add at the top of the file:

```tsx
import { useAuth } from "@/lib/auth/useAuth";
import { commitSessionStats } from "@/lib/quick-sessions/firestore";
```

Inside `LiveSessionPage`, add state and handler:

```tsx
const { user } = useAuth();
const [finishing, setFinishing] = useState(false);
const [finished, setFinished] = useState(session?.statsCommitted ?? false);

async function handleFinish() {
  if (!session || !user) return;
  setFinishing(true);
  try {
    await commitSessionStats(session, user.uid);
    setFinished(true);
  } catch {
    // non-fatal — user can retry
  } finally {
    setFinishing(false);
  }
}
```

Replace the `allDone` section in the JSX (the block that renders the trophy):

```tsx
{allDone && (
  <div style={{ textAlign: "center", padding: "24px 16px", animation: "pb-pop 400ms var(--ease-spring) both" }}>
    <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
    <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 16, color: "var(--text-1)", marginBottom: 4 }}>All done!</div>
    {!finished ? (
      <>
        <p style={{ color: "var(--text-3)", fontSize: 13, margin: "0 0 16px" }}>
          Commit results to improve fairness in your next session.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320, margin: "0 auto" }}>
          <button
            onClick={handleFinish}
            disabled={finishing}
            className="pb-btn pb-btn-volt"
            style={{ padding: 14 }}
          >
            {finishing ? "Saving…" : "Finish & commit results"}
          </button>
          <a href="/quick" className="pb-btn pb-btn-secondary" style={{ textDecoration: "none", padding: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
            Skip → new session
          </a>
        </div>
      </>
    ) : (
      <>
        <p style={{ color: "var(--text-3)", fontSize: 13, margin: "0 0 16px" }}>Results saved. Your roster is updated.</p>
        <a href="/quick" className="pb-btn pb-btn-volt" style={{ display: "inline-flex", width: "auto", padding: "10px 28px", textDecoration: "none", borderRadius: "var(--r-pill)" }}>
          New session →
        </a>
      </>
    )}
  </div>
)}
```

- [ ] **Step 2: Build to verify**

```bash
pnpm --filter @picklebaddies/web build
```

Expected: clean build.

- [ ] **Step 3: Run all tests**

```bash
pnpm -r test
```

Expected: all test suites pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/quick/\[sessionId\]/page.tsx
git commit -m "feat(quick): finish session button — commits stats to roster for fairness carry-over

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review checklist

- [x] **Auth gate** — Task 1 + layout.tsx guard; Task 2 attaches `ownerUid`
- [x] **Rolling court queue** — Tasks 3 + 4; `computeMatchStates` replaces `computeRoundStatus`
- [x] **UI redesign + animation** — Tasks 5 + 6; both pages use design tokens; `pb-pulse` added
- [x] **Roster** — Task 7 `roster.ts`; Task 10 loads roster on page mount, shows chips
- [x] **Cross-session fairness** — Tasks 9 + 10; engine priors seeded from roster stats
- [x] **Stats commit** — Task 8 pure aggregation tested; Task 11 finish button + `commitSessionStats`
- [x] **No placeholders** — all code blocks are complete
- [x] **Type consistency** — `PlayerPriors` defined in Task 9 types.ts, used in engine.ts (Task 10); `pairKey` in stats.ts is a local copy (independent of engine's)
- [x] **Idempotency** — `statsCommitted` flag checked in `commitSessionStats`
- [x] **Backward compat** — new `QuickSession` fields are optional so existing Firestore docs load without error
