# Quick Session Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a no-login `/quick` portal where an organiser enters player names, configures courts + round count, generates balanced matches, and tracks scores in real time — persisted to localStorage and Firestore.

**Architecture:** Two Next.js App Router pages (`/quick` and `/quick/[sessionId]`), both client components. Pure logic lives in `apps/web/src/lib/quick-sessions/`. The match-engine is called client-side; results are saved to localStorage immediately and Firestore asynchronously. Page 2 reads from localStorage first and falls back to Firestore.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, `@picklebaddies/match-engine`, Firebase Firestore (`firebase/firestore`), Vitest

**Design:** Light theme — warm white background (`#faf9f6`), amber/orange accents (`#e8650a`). See spec for full token table.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `firestore.rules` | Modify | Add `quickSessions` open read/write block |
| `apps/web/src/lib/quick-sessions/types.ts` | Create | All types: `QuickPlayer`, `QuickSession`, `QuickScore`, `QuickSessionSetup` |
| `apps/web/src/lib/quick-sessions/storage.ts` | Create | localStorage get/set/clear helpers |
| `apps/web/src/lib/quick-sessions/engine.ts` | Create | `buildEngineInput()` adapter — pure, converts form data to `EngineInput` |
| `apps/web/src/lib/quick-sessions/engine.test.ts` | Create | Unit tests for `buildEngineInput` |
| `apps/web/src/lib/quick-sessions/score.ts` | Create | `computeMatchKey`, `getWinner`, `computeRoundStatus` — pure scoring utilities |
| `apps/web/src/lib/quick-sessions/score.test.ts` | Create | Unit tests for scoring utilities |
| `apps/web/src/lib/quick-sessions/firestore.ts` | Create | `saveSession`, `loadSession`, `saveScore` — Firestore I/O |
| `apps/web/src/app/quick/page.tsx` | Create | Page 1: session setup + player management + generate |
| `apps/web/src/app/quick/[sessionId]/page.tsx` | Create | Page 2: live rounds, match cards, score entry modal |

---

## Task 1: Types

**Files:**
- Create: `apps/web/src/lib/quick-sessions/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// apps/web/src/lib/quick-sessions/types.ts
import type { GeneratedMatch, GeneratedSitOut, SkillLevel } from "@picklebaddies/match-engine";

export type { SkillLevel };

export interface QuickPlayer {
  id: string;
  name: string;
  skillLevel: SkillLevel;
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
}

export type RoundStatus = "done" | "playing" | "up_next";
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/quick-sessions/types.ts
git commit -m "feat(quick-session): add domain types

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Firestore Rules

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Add quickSessions rule block**

Add the following block inside the `match /databases/{database}/documents` block, just before the catch-all deny rule at the bottom:

```
    // Quick Session portal — no auth required (MVP). Open read/write scoped to document.
    // Authentication layer planned for future milestone.
    match /quickSessions/{sessionId} {
      allow read, write: if true;
    }
```

The final lines of the file should look like:

```
    // Quick Session portal — no auth required (MVP).
    match /quickSessions/{sessionId} {
      allow read, write: if true;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add firestore.rules
git commit -m "feat(quick-session): allow unauthenticated quickSessions read/write (MVP)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: localStorage Helpers

**Files:**
- Create: `apps/web/src/lib/quick-sessions/storage.ts`

- [ ] **Step 1: Create storage helpers**

```typescript
// apps/web/src/lib/quick-sessions/storage.ts
import type { QuickSession } from "./types";

const PREFIX = "qs:";

export function saveSessionToStorage(session: QuickSession): void {
  try {
    localStorage.setItem(PREFIX + session.id, JSON.stringify(session));
  } catch {
    // Storage full or unavailable — fail silently, Firestore is source of truth
  }
}

export function loadSessionFromStorage(sessionId: string): QuickSession | null {
  try {
    const raw = localStorage.getItem(PREFIX + sessionId);
    if (!raw) return null;
    return JSON.parse(raw) as QuickSession;
  } catch {
    return null;
  }
}

export function updateSessionInStorage(sessionId: string, updater: (s: QuickSession) => QuickSession): void {
  const current = loadSessionFromStorage(sessionId);
  if (!current) return;
  saveSessionToStorage(updater(current));
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/quick-sessions/storage.ts
git commit -m "feat(quick-session): add localStorage helpers

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Engine Adapter

**Files:**
- Create: `apps/web/src/lib/quick-sessions/engine.ts`
- Create: `apps/web/src/lib/quick-sessions/engine.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/web/src/lib/quick-sessions/engine.test.ts
import { describe, it, expect } from "vitest";
import { buildEngineInput } from "./engine";
import type { QuickPlayer, QuickSessionSetup } from "./types";

const setup: QuickSessionSetup = { name: "Test", courts: 2, rounds: 3 };
const players: QuickPlayer[] = [
  { id: "p1", name: "Alice", skillLevel: "intermediate" },
  { id: "p2", name: "Bob", skillLevel: "beginner" },
  { id: "p3", name: "Carol", skillLevel: "advanced" },
  { id: "p4", name: "Dave", skillLevel: "unknown" },
];

describe("buildEngineInput", () => {
  it("produces mode=initial with no locked matches", () => {
    const input = buildEngineInput(setup, players);
    expect(input.mode).toBe("initial");
    expect(input.lockedMatches).toEqual([]);
    expect(input.elapsedRounds).toBe(0);
  });

  it("maps rounds count via sessionDurationMinutes=rounds, estimatedGameMinutes=1", () => {
    const input = buildEngineInput(setup, players);
    expect(input.sessionDurationMinutes).toBe(3);
    expect(input.estimatedGameMinutes).toBe(1);
  });

  it("synthesises courts from court count", () => {
    const input = buildEngineInput(setup, players);
    expect(input.courts).toHaveLength(2);
    expect(input.courts[0]).toMatchObject({ courtId: "court-1", name: "Court 1", courtNumber: 1 });
    expect(input.courts[1]).toMatchObject({ courtId: "court-2", name: "Court 2", courtNumber: 2 });
  });

  it("maps players with availableFromRound=1", () => {
    const input = buildEngineInput(setup, players);
    expect(input.players).toHaveLength(4);
    expect(input.players[0]).toMatchObject({
      playerId: "p1",
      displayName: "Alice",
      skillLevel: "intermediate",
      availableFromRound: 1,
    });
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
pnpm --filter @picklebaddies/web test apps/web/src/lib/quick-sessions/engine.test.ts
```

Expected: `FAIL` — `Cannot find module './engine'`

- [ ] **Step 3: Implement the engine adapter**

```typescript
// apps/web/src/lib/quick-sessions/engine.ts
import type { EngineInput } from "@picklebaddies/match-engine";
import type { QuickPlayer, QuickSessionSetup } from "./types";

export function buildEngineInput(
  setup: QuickSessionSetup,
  players: QuickPlayer[]
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
  };
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
pnpm --filter @picklebaddies/web test apps/web/src/lib/quick-sessions/engine.test.ts
```

Expected: all 4 tests `PASS`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/quick-sessions/engine.ts apps/web/src/lib/quick-sessions/engine.test.ts
git commit -m "feat(quick-session): add engine adapter with tests

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Scoring Utilities

**Files:**
- Create: `apps/web/src/lib/quick-sessions/score.ts`
- Create: `apps/web/src/lib/quick-sessions/score.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/web/src/lib/quick-sessions/score.test.ts
import { describe, it, expect } from "vitest";
import { computeMatchKey, getWinner, computeRoundStatus } from "./score";
import type { GeneratedMatch } from "@picklebaddies/match-engine";
import type { QuickScore } from "./types";

describe("computeMatchKey", () => {
  it("produces r{round}_{courtId}", () => {
    expect(computeMatchKey(1, "court-1")).toBe("r1_court-1");
    expect(computeMatchKey(3, "court-2")).toBe("r3_court-2");
  });
});

describe("getWinner", () => {
  it("returns 'a' when team A has higher score", () => {
    expect(getWinner(11, 7)).toBe("a");
  });
  it("returns 'b' when team B has higher score", () => {
    expect(getWinner(7, 11)).toBe("b");
  });
  it("returns null when tied", () => {
    expect(getWinner(11, 11)).toBeNull();
  });
});

const m = (round: number, court: string): GeneratedMatch => ({
  roundNumber: round,
  courtId: court,
  matchNumber: 1,
  teamA: ["p1", "p2"],
  teamB: ["p3", "p4"],
});

describe("computeRoundStatus", () => {
  const matches: GeneratedMatch[] = [
    m(1, "court-1"), m(1, "court-2"),
    m(2, "court-1"), m(2, "court-2"),
    m(3, "court-1"), m(3, "court-2"),
  ];

  it("round 1 is playing when no scores recorded", () => {
    expect(computeRoundStatus(1, matches, {})).toBe("playing");
  });

  it("round 2 is up_next while round 1 is playing", () => {
    expect(computeRoundStatus(2, matches, {})).toBe("up_next");
  });

  it("round 1 becomes done when all its matches are scored", () => {
    const scores: Record<string, QuickScore> = {
      "r1_court-1": { teamAScore: 11, teamBScore: 7 },
      "r1_court-2": { teamAScore: 9, teamBScore: 11 },
    };
    expect(computeRoundStatus(1, matches, scores)).toBe("done");
  });

  it("round 2 becomes playing once round 1 is done", () => {
    const scores: Record<string, QuickScore> = {
      "r1_court-1": { teamAScore: 11, teamBScore: 7 },
      "r1_court-2": { teamAScore: 9, teamBScore: 11 },
    };
    expect(computeRoundStatus(2, matches, scores)).toBe("playing");
  });

  it("round 3 is up_next while round 2 is playing", () => {
    const scores: Record<string, QuickScore> = {
      "r1_court-1": { teamAScore: 11, teamBScore: 7 },
      "r1_court-2": { teamAScore: 9, teamBScore: 11 },
    };
    expect(computeRoundStatus(3, matches, scores)).toBe("up_next");
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
pnpm --filter @picklebaddies/web test apps/web/src/lib/quick-sessions/score.test.ts
```

Expected: `FAIL` — `Cannot find module './score'`

- [ ] **Step 3: Implement scoring utilities**

```typescript
// apps/web/src/lib/quick-sessions/score.ts
import type { GeneratedMatch } from "@picklebaddies/match-engine";
import type { QuickScore, RoundStatus } from "./types";

export function computeMatchKey(roundNumber: number, courtId: string): string {
  return `r${roundNumber}_${courtId}`;
}

export function getWinner(teamAScore: number, teamBScore: number): "a" | "b" | null {
  if (teamAScore === teamBScore) return null;
  return teamAScore > teamBScore ? "a" : "b";
}

export function computeRoundStatus(
  roundNumber: number,
  allMatches: GeneratedMatch[],
  scores: Record<string, QuickScore>
): RoundStatus {
  const roundMatches = allMatches.filter((m) => m.roundNumber === roundNumber);
  const allScored = roundMatches.every((m) => scores[computeMatchKey(m.roundNumber, m.courtId)] !== undefined);
  if (allScored) return "done";

  const prevRoundsAllDone = allMatches
    .filter((m) => m.roundNumber < roundNumber)
    .every((m) => scores[computeMatchKey(m.roundNumber, m.courtId)] !== undefined);

  return prevRoundsAllDone ? "playing" : "up_next";
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
pnpm --filter @picklebaddies/web test apps/web/src/lib/quick-sessions/score.test.ts
```

Expected: all 7 tests `PASS`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/quick-sessions/score.ts apps/web/src/lib/quick-sessions/score.test.ts
git commit -m "feat(quick-session): add scoring utilities with tests

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Firestore Service

**Files:**
- Create: `apps/web/src/lib/quick-sessions/firestore.ts`

No unit tests — requires Firestore emulator. Manual verification in Task 7 & 8 via the running app.

- [ ] **Step 1: Create the Firestore service**

```typescript
// apps/web/src/lib/quick-sessions/firestore.ts
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { getFirebaseServices } from "@/lib/firebase/client";
import type { QuickSession, QuickScore } from "./types";
import { computeMatchKey } from "./score";

function sessionRef(sessionId: string) {
  const { db } = getFirebaseServices();
  return doc(db, "quickSessions", sessionId);
}

export async function saveSessionToFirestore(session: QuickSession): Promise<void> {
  await setDoc(sessionRef(session.id), session);
}

export async function loadSessionFromFirestore(sessionId: string): Promise<QuickSession | null> {
  const snap = await getDoc(sessionRef(sessionId));
  if (!snap.exists()) return null;
  return snap.data() as QuickSession;
}

export async function saveScoreToFirestore(
  sessionId: string,
  roundNumber: number,
  courtId: string,
  score: QuickScore
): Promise<void> {
  const key = computeMatchKey(roundNumber, courtId);
  await updateDoc(sessionRef(sessionId), { [`scores.${key}`]: score });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/quick-sessions/firestore.ts
git commit -m "feat(quick-session): add Firestore service

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Page 1 — /quick

**Files:**
- Create: `apps/web/src/app/quick/page.tsx`

- [ ] **Step 1: Create the setup page**

```tsx
// apps/web/src/app/quick/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateSchedule } from "@picklebaddies/match-engine";
import type { QuickPlayer, QuickSessionSetup, QuickSession } from "@/lib/quick-sessions/types";
import { buildEngineInput } from "@/lib/quick-sessions/engine";
import { saveSessionToStorage } from "@/lib/quick-sessions/storage";
import { saveSessionToFirestore } from "@/lib/quick-sessions/firestore";

const SKILL_OPTIONS = ["unknown", "beginner", "intermediate", "advanced"] as const;

function generateId(): string {
  return crypto.randomUUID().split("-")[0];
}

export default function QuickSessionPage() {
  const router = useRouter();
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
    setPlayers((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: trimmed, skillLevel: playerSkill },
    ]);
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

  return (
    <div style={{ minHeight: "100dvh", background: "#faf9f6", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: "#fff", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #f0e8d0" }}>
        <span style={{ fontWeight: 900, fontSize: 16, color: "#c25a00", letterSpacing: "-0.01em" }}>⚡ Quick Session</span>
        <span style={{ fontSize: 11, color: "#b0a080", fontFamily: "monospace" }}>no login needed</span>
      </div>

      <div style={{ flex: 1, padding: "16px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 640, margin: "0 auto", width: "100%" }}>

        {/* Session config */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #e8dfc0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 10, color: "#c25a00", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontWeight: 700 }}>Session Setup</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", fontSize: 11, color: "#8a7a60", marginBottom: 4 }}>Session name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: "100%", background: "#faf9f6", border: "1.5px solid #ddd0a8", borderRadius: 8, padding: "10px 12px", fontSize: 14, color: "#2a1e08", outline: "none", boxSizing: "border-box" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 11, color: "#8a7a60", marginBottom: 4 }}>Courts</label>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={() => setCourts((c) => Math.max(1, c - 1))} style={{ background: "#fef3e0", color: "#c25a00", border: "1.5px solid #f0c870", borderRadius: 8, width: 36, height: 38, fontSize: 18, fontWeight: 900, cursor: "pointer" }}>−</button>
                <div style={{ background: "#faf9f6", border: "1.5px solid #ddd0a8", borderRadius: 8, padding: "8px 0", fontSize: 16, fontWeight: 800, color: "#c25a00", flex: 1, textAlign: "center" }}>{courts}</div>
                <button onClick={() => setCourts((c) => Math.min(8, c + 1))} style={{ background: "#e8650a", color: "#fff", border: "none", borderRadius: 8, width: 36, height: 38, fontSize: 18, fontWeight: 900, cursor: "pointer" }}>+</button>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 11, color: "#8a7a60", marginBottom: 4 }}>Rounds to generate</label>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={() => setRounds((r) => Math.max(1, r - 1))} style={{ background: "#fef3e0", color: "#c25a00", border: "1.5px solid #f0c870", borderRadius: 8, width: 36, height: 38, fontSize: 18, fontWeight: 900, cursor: "pointer" }}>−</button>
                <div style={{ background: "#faf9f6", border: "1.5px solid #ddd0a8", borderRadius: 8, padding: "8px 0", fontSize: 16, fontWeight: 800, color: "#c25a00", flex: 1, textAlign: "center" }}>{rounds}</div>
                <button onClick={() => setRounds((r) => Math.min(10, r + 1))} style={{ background: "#e8650a", color: "#fff", border: "none", borderRadius: 8, width: 36, height: 38, fontSize: 18, fontWeight: 900, cursor: "pointer" }}>+</button>
              </div>
            </div>
          </div>
        </div>

        {/* Players */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #e8dfc0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 10, color: "#c25a00", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontWeight: 700 }}>
            Players <span style={{ color: "#b0a080", fontWeight: 400, textTransform: "none", fontSize: 11 }}>{players.length} added</span>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPlayer()}
              placeholder="Player name…"
              style={{ flex: 1, background: "#faf9f6", border: "1.5px solid #ddd0a8", borderRadius: 8, padding: "10px 12px", fontSize: 14, color: "#2a1e08", outline: "none" }}
            />
            <select
              value={playerSkill}
              onChange={(e) => setPlayerSkill(e.target.value as QuickPlayer["skillLevel"])}
              style={{ background: "#faf9f6", border: "1.5px solid #ddd0a8", borderRadius: 8, padding: "10px 10px", fontSize: 13, color: "#8a7a60", outline: "none" }}
            >
              {SKILL_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <button
              onClick={addPlayer}
              disabled={!playerName.trim()}
              style={{ background: playerName.trim() ? "#e8650a" : "#f0e8d0", color: playerName.trim() ? "#fff" : "#b0a080", border: "none", borderRadius: 8, padding: "0 16px", fontSize: 14, fontWeight: 800, cursor: playerName.trim() ? "pointer" : "default", transition: "background 0.15s" }}
            >
              Add
            </button>
          </div>

          {players.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {players.map((p) => (
                <span
                  key={p.id}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fef3e0", border: "1px solid #f0c870", borderRadius: 20, padding: "5px 10px 5px 12px", fontSize: 13, color: "#8a4000", fontWeight: 600 }}
                >
                  {p.name}
                  <button
                    onClick={() => removePlayer(p.id)}
                    style={{ background: "none", border: "none", color: "#c0a070", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}
                    aria-label={`Remove ${p.name}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          {players.length === 0 && (
            <p style={{ fontSize: 13, color: "#c0b090", margin: 0, fontStyle: "italic" }}>Add at least 4 players to generate matches.</p>
          )}
        </div>

        {error && (
          <div style={{ background: "#fff0f0", border: "1px solid #f0c0c0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#a02020" }}>{error}</div>
        )}

        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          style={{ background: canGenerate ? "#e8650a" : "#f0e8d0", color: canGenerate ? "#fff" : "#b0a080", border: "none", borderRadius: 12, padding: 18, fontSize: 16, fontWeight: 900, width: "100%", cursor: canGenerate ? "pointer" : "default", letterSpacing: "-0.01em", boxShadow: canGenerate ? "0 2px 10px rgba(232,101,10,0.3)" : "none", transition: "all 0.15s" }}
        >
          {generating ? "Generating…" : `Generate ${rounds} Round${rounds !== 1 ? "s" : ""} →`}
        </button>

        {players.length < 4 && (
          <p style={{ textAlign: "center", fontSize: 11, color: "#c0b090", margin: 0, fontFamily: "monospace" }}>
            {4 - players.length} more player{4 - players.length !== 1 ? "s" : ""} needed
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Start the dev server and verify the page loads**

```bash
pnpm dev:web
```

Open `http://localhost:3000/quick`. Verify:
- Page renders with amber header and warm white background
- Courts and Rounds steppers work (+ / −)
- Adding a player name + Enter adds a chip
- Clicking ✕ on a chip removes the player
- Generate button is disabled with < 4 players
- Generate button label updates to "Generate N Rounds →" as rounds stepper changes

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/quick/page.tsx
git commit -m "feat(quick-session): add setup page (/quick)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Page 2 — /quick/[sessionId]

**Files:**
- Create: `apps/web/src/app/quick/[sessionId]/page.tsx`

- [ ] **Step 1: Create the live session page**

```tsx
// apps/web/src/app/quick/[sessionId]/page.tsx
"use client";

import { useState, useEffect, use } from "react";
import type { QuickSession, QuickScore } from "@/lib/quick-sessions/types";
import { loadSessionFromStorage, updateSessionInStorage } from "@/lib/quick-sessions/storage";
import { loadSessionFromFirestore, saveScoreToFirestore } from "@/lib/quick-sessions/firestore";
import { computeMatchKey, getWinner, computeRoundStatus } from "@/lib/quick-sessions/score";
import type { GeneratedMatch } from "@picklebaddies/match-engine";

interface ScoreModalProps {
  match: GeneratedMatch;
  playerNames: Record<string, string>;
  onSave: (teamAScore: number, teamBScore: number) => Promise<void>;
  onClose: () => void;
}

function ScoreModal({ match, playerNames, onSave, onClose }: ScoreModalProps) {
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const teamA = `${playerNames[match.teamA[0]] ?? "?"} & ${playerNames[match.teamA[1]] ?? "?"}`;
  const teamB = `${playerNames[match.teamB[0]] ?? "?"} & ${playerNames[match.teamB[1]] ?? "?"}`;

  async function handleSave() {
    const a = parseInt(scoreA, 10);
    const b = parseInt(scoreB, 10);
    if (isNaN(a) || isNaN(b) || a < 0 || b < 0) { setErr("Enter valid scores."); return; }
    if (a === b) { setErr("Scores can't be tied — one team must win."); return; }
    setSaving(true);
    try {
      await onSave(a, b);
      onClose();
    } catch {
      setErr("Save failed. Try again.");
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(42,30,8,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100, padding: "0 0 20px" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 480, margin: "0 16px", border: "2px solid #e8650a", boxShadow: "0 -4px 24px rgba(232,101,10,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: "#c25a00", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Enter Score · Court {match.courtId.replace("court-", "")}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "#b0a080", cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#8a7a60", marginBottom: 6 }}>{teamA}</div>
            <input
              type="number"
              min={0}
              value={scoreA}
              onChange={(e) => setScoreA(e.target.value)}
              placeholder="0"
              style={{ width: "100%", background: "#faf9f6", border: "2px solid #e8650a", borderRadius: 8, padding: "10px 0", fontSize: 28, fontWeight: 900, color: "#c25a00", textAlign: "center", outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <span style={{ fontSize: 18, color: "#c0b090", fontWeight: 700, flexShrink: 0 }}>vs</span>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#8a7a60", marginBottom: 6 }}>{teamB}</div>
            <input
              type="number"
              min={0}
              value={scoreB}
              onChange={(e) => setScoreB(e.target.value)}
              placeholder="0"
              style={{ width: "100%", background: "#faf9f6", border: "2px solid #e8650a", borderRadius: 8, padding: "10px 0", fontSize: 28, fontWeight: 900, color: "#c25a00", textAlign: "center", outline: "none", boxSizing: "border-box" }}
            />
          </div>
        </div>

        {err && <p style={{ fontSize: 12, color: "#a02020", margin: "0 0 10px", textAlign: "center" }}>{err}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          style={{ width: "100%", background: saving ? "#f0e8d0" : "#e8650a", color: saving ? "#b0a080" : "#fff", border: "none", borderRadius: 8, padding: 14, fontSize: 15, fontWeight: 900, cursor: saving ? "default" : "pointer", boxShadow: "0 2px 8px rgba(232,101,10,0.25)" }}
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
  isLive: boolean;
  onTap: () => void;
}

function MatchCard({ match, playerNames, score, isLive, onTap }: MatchCardProps) {
  const teamA = `${playerNames[match.teamA[0]] ?? "?"} & ${playerNames[match.teamA[1]] ?? "?"}`;
  const teamB = `${playerNames[match.teamB[0]] ?? "?"} & ${playerNames[match.teamB[1]] ?? "?"}`;
  const winner = score ? getWinner(score.teamAScore, score.teamBScore) : null;

  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: 12, border: isLive ? "2px solid #e8650a" : "1px solid #e8dfc0", marginBottom: 6, boxShadow: isLive ? "0 1px 8px rgba(232,101,10,0.1)" : "none" }}>
      <div style={{ fontSize: 9, color: "#b0a080", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Court {match.courtId.replace("court-", "")}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 700, color: score ? (winner === "a" ? "#2a1e08" : "#c0b090") : "#2a1e08" }}>{teamA}</div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <div style={{ background: score ? (winner === "a" ? "#fef3e0" : "#faf9f6") : "#faf9f6", border: score ? (winner === "a" ? "2px solid #e8650a" : "1px solid #e8dfc0") : "2px dashed #e8650a", borderRadius: 6, padding: "6px 12px", fontSize: 18, fontWeight: 900, color: score ? (winner === "a" ? "#c25a00" : "#c0b090") : "#e8a070", minWidth: 36, textAlign: "center" }}>
            {score ? score.teamAScore : "—"}
          </div>
          <span style={{ fontSize: 13, color: "#c0b090" }}>–</span>
          <div style={{ background: score ? (winner === "b" ? "#fef3e0" : "#faf9f6") : "#faf9f6", border: score ? (winner === "b" ? "2px solid #e8650a" : "1px solid #e8dfc0") : "2px dashed #e8650a", borderRadius: 6, padding: "6px 12px", fontSize: 18, fontWeight: 900, color: score ? (winner === "b" ? "#c25a00" : "#c0b090") : "#e8a070", minWidth: 36, textAlign: "center" }}>
            {score ? score.teamBScore : "—"}
          </div>
        </div>
        <div style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 700, color: score ? (winner === "b" ? "#2a1e08" : "#c0b090") : "#2a1e08" }}>{teamB}</div>
      </div>
      {isLive && !score && (
        <button onClick={onTap} style={{ marginTop: 10, width: "100%", background: "#fef3e0", border: "1px solid #f0c060", borderRadius: 7, color: "#8a4000", fontSize: 13, fontWeight: 700, padding: 8, cursor: "pointer" }}>
          Tap to enter score
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
      <div style={{ minHeight: "100dvh", background: "#faf9f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#b0a080", fontSize: 14 }}>Loading session…</p>
      </div>
    );
  }

  if (notFound || !session) {
    return (
      <div style={{ minHeight: "100dvh", background: "#faf9f6", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <p style={{ color: "#a02020", fontSize: 15, fontWeight: 700 }}>Session not found.</p>
        <a href="/quick" style={{ color: "#e8650a", fontSize: 14 }}>Start a new session →</a>
      </div>
    );
  }

  const playerNames: Record<string, string> = Object.fromEntries(session.players.map((p) => [p.id, p.name]));
  const roundNumbers = [...new Set(session.matches.map((m) => m.roundNumber))].sort((a, b) => a - b);

  return (
    <div style={{ minHeight: "100dvh", background: "#faf9f6", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: "#fff", padding: "12px 20px", borderBottom: "2px solid #f0e8d0" }}>
        <div style={{ fontWeight: 900, fontSize: 16, color: "#2a1e08" }}>{session.name}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
          <span style={{ fontSize: 11, color: "#b0a080" }}>{session.players.length} players · {session.courts} courts · {roundNumbers.length} rounds</span>
          <span style={{ fontSize: 11, color: "#c25a00", background: "#fef3e0", border: "1px solid #f0c870", borderRadius: 6, padding: "2px 8px", fontFamily: "monospace", fontWeight: 700 }}>{sessionId}</span>
        </div>
      </div>

      <div style={{ flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 640, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        {roundNumbers.map((roundNumber) => {
          const status = computeRoundStatus(roundNumber, session.matches, session.scores);
          const roundMatches = session.matches.filter((m) => m.roundNumber === roundNumber);
          const roundSitOuts = session.sitOuts.filter((s) => s.roundNumber === roundNumber);

          return (
            <div key={roundNumber} style={{ opacity: status === "up_next" ? 0.5 : 1, transition: "opacity 0.2s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: "#8a7a60", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Round {roundNumber}</span>
                <div style={{ height: 1, flex: 1, background: "#f0e8d0" }} />
                {status === "done" && <span style={{ fontSize: 10, color: "#3a7a1a", background: "#edfae0", border: "1px solid #b0d890", borderRadius: 8, padding: "2px 8px" }}>Done</span>}
                {status === "playing" && <span style={{ fontSize: 10, color: "#8a5a00", background: "#fff3d0", border: "1px solid #f0c060", borderRadius: 8, padding: "2px 8px" }}>Playing</span>}
                {status === "up_next" && <span style={{ fontSize: 10, color: "#b0a080", background: "#f5f0e8", border: "1px solid #e0d0b0", borderRadius: 8, padding: "2px 8px" }}>Up next</span>}
              </div>

              {roundMatches.map((match) => {
                const key = computeMatchKey(match.roundNumber, match.courtId);
                return (
                  <MatchCard
                    key={key}
                    match={match}
                    playerNames={playerNames}
                    score={session.scores[key]}
                    isLive={status === "playing"}
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
      </div>

      {activeMatch && (
        <ScoreModal
          match={activeMatch}
          playerNames={playerNames}
          onSave={(a, b) => handleSaveScore(activeMatch, a, b)}
          onClose={() => setActiveMatch(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Start the dev server and run a full end-to-end flow**

```bash
pnpm dev:web
```

Golden path test:
1. Open `http://localhost:3000/quick`
2. Enter session name "Test Session"
3. Set courts to 2, rounds to 2
4. Add 6 players (names: A, B, C, D, E, F — skill: any)
5. Click "Generate 2 Rounds →"
6. Verify redirect to `http://localhost:3000/quick/{id}`
7. Verify Round 1 shows as "Playing", Round 2 as "Up next"
8. Click "Tap to enter score" on a Round 1 match
9. Enter scores (e.g., 11 and 7), click "Save Score"
10. Verify that match now shows the score with winner highlighted
11. Score all Round 1 matches → verify Round 1 becomes "Done", Round 2 becomes "Playing"
12. Refresh the page → verify session is restored from localStorage

Edge case tests:
- Try entering tied scores (11–11) → error message should appear
- Try entering negative score → error message should appear
- Enter session ID that doesn't exist (`/quick/doesnotexist`) → "Session not found" message

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/quick/[sessionId]/page.tsx
git commit -m "feat(quick-session): add live session page (/quick/[sessionId])

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Link from Home

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Add a Quick Session link to the home page**

In `apps/web/src/app/page.tsx`, add a secondary CTA below the existing "Get started →" button. Insert this block after the existing `<Link href="/sign-in">` block:

```tsx
<Link
  href="/quick"
  style={{ textDecoration: "none", animation: "pb-rise 500ms 120ms var(--ease-out) both", display: "block" }}
>
  <button
    className="pb-btn"
    style={{ height: 52, fontSize: "0.9375rem", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(246,248,244,0.8)" }}
  >
    ⚡ Quick Session (no login)
  </button>
</Link>
```

- [ ] **Step 2: Verify the button appears and navigates correctly**

Open `http://localhost:3000`. Verify the "Quick Session (no login)" button appears below "Get started" and clicking it navigates to `/quick`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(quick-session): add Quick Session entry point on home page

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

- [x] **Types** — `QuickSession`, `QuickPlayer`, `QuickScore`, `QuickSessionSetup`, `RoundStatus` defined in Task 1
- [x] **Firestore rules** — `quickSessions` open read/write in Task 2
- [x] **localStorage** — save/load/update helpers in Task 3
- [x] **Engine adapter** — `buildEngineInput` maps setup → EngineInput with correct round math in Task 4
- [x] **Scoring utilities** — `computeMatchKey`, `getWinner`, `computeRoundStatus` in Task 5
- [x] **Firestore service** — save/load/update score in Task 6
- [x] **Page 1** — session name, courts stepper, rounds stepper, player add/remove, generate button in Task 7
- [x] **Page 2** — round sections with status badges, match cards, score modal, sit-outs in Task 8
- [x] **Home link** — entry point from home page in Task 9
- [x] **Type consistency** — `computeMatchKey` used in both `score.ts` and imported in `firestore.ts` — single source
- [x] **No TBDs or placeholders** — all steps have complete code
- [x] **End-to-end test steps** — Task 8 Step 2 covers golden path + edge cases
