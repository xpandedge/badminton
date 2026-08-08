# Round Player Edit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-round player assignment editing to the Quick Session live page via a tap-to-swap bottom sheet modal.

**Architecture:** A pure `swapPlayersInRound()` utility handles the data mutation (testable in isolation). A new `RoundEditModal` React component (modelled on the existing `ScoreModal`) provides the UI. State wiring and a post-save `RegenPrompt` bottom sheet are added to `LiveSessionPage`. No new server actions or Firestore fields are needed.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest, Firestore (via existing `updateSessionMatchesToFirestore`)

---

### Task 1: Pure swap utility (TDD)

**Files:**
- Create: `apps/web/src/lib/quick-sessions/round-edit.ts`
- Create: `apps/web/src/lib/quick-sessions/round-edit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/quick-sessions/round-edit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { swapPlayersInRound } from "./round-edit";
import type { GeneratedMatch, GeneratedSitOut } from "@picklebaddies/match-engine";

const match = (courtId: string, a: [string, string], b: [string, string]): GeneratedMatch => ({
  roundNumber: 1, courtId, matchNumber: 1, teamA: a, teamB: b,
});
const sitout = (id: string): GeneratedSitOut => ({ roundNumber: 1, playerId: id, reason: "rotation" });

describe("swapPlayersInRound", () => {
  it("swaps two players on different teams in the same match", () => {
    const { matches } = swapPlayersInRound(
      [match("court-1", ["A", "B"], ["C", "D"])],
      [],
      "A", "C"
    );
    expect(matches[0]!.teamA).toEqual(["C", "B"]);
    expect(matches[0]!.teamB).toEqual(["A", "D"]);
  });

  it("swaps two players on the same team", () => {
    const { matches } = swapPlayersInRound(
      [match("court-1", ["A", "B"], ["C", "D"])],
      [],
      "A", "B"
    );
    expect(matches[0]!.teamA).toEqual(["B", "A"]);
    expect(matches[0]!.teamB).toEqual(["C", "D"]);
  });

  it("swaps a court player with a bench player", () => {
    const { matches, sitOuts } = swapPlayersInRound(
      [match("court-1", ["A", "B"], ["C", "D"])],
      [sitout("E")],
      "A", "E"
    );
    expect(matches[0]!.teamA).toEqual(["E", "B"]);
    expect(sitOuts[0]!.playerId).toBe("A");
  });

  it("swaps two bench players", () => {
    const { sitOuts } = swapPlayersInRound(
      [match("court-1", ["A", "B"], ["C", "D"])],
      [sitout("E"), sitout("F")],
      "E", "F"
    );
    expect(sitOuts[0]!.playerId).toBe("F");
    expect(sitOuts[1]!.playerId).toBe("E");
  });

  it("swaps players across two different courts", () => {
    const { matches } = swapPlayersInRound(
      [
        match("court-1", ["A", "B"], ["C", "D"]),
        match("court-2", ["E", "F"], ["G", "H"]),
      ],
      [],
      "B", "G"
    );
    expect(matches[0]!.teamA).toEqual(["A", "G"]);
    expect(matches[1]!.teamB).toEqual(["B", "H"]);
  });

  it("is a no-op if a player id is not found in the round", () => {
    const matches = [match("court-1", ["A", "B"], ["C", "D"])];
    const result = swapPlayersInRound(matches, [], "A", "UNKNOWN");
    expect(result.matches[0]!.teamA).toEqual(["A", "B"]);
    expect(result.matches[0]!.teamB).toEqual(["C", "D"]);
  });

  it("does not mutate the original arrays", () => {
    const origMatches = [match("court-1", ["A", "B"], ["C", "D"])];
    const origSitOuts = [sitout("E")];
    swapPlayersInRound(origMatches, origSitOuts, "A", "E");
    expect(origMatches[0]!.teamA).toEqual(["A", "B"]);
    expect(origSitOuts[0]!.playerId).toBe("E");
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
pnpm --filter @picklebaddies/web exec vitest run src/lib/quick-sessions/round-edit.test.ts
```

Expected: `FAIL` — `round-edit.ts` doesn't exist yet.

- [ ] **Step 3: Implement the utility**

Create `apps/web/src/lib/quick-sessions/round-edit.ts`:

```ts
import type { GeneratedMatch, GeneratedSitOut } from "@picklebaddies/match-engine";

type Position =
  | { kind: "match"; matchIdx: number; team: "teamA" | "teamB"; slot: 0 | 1 }
  | { kind: "sitout"; sitIdx: number };

function findPosition(
  id: string,
  matches: GeneratedMatch[],
  sitOuts: GeneratedSitOut[]
): Position | null {
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const ai = m.teamA.indexOf(id);
    if (ai !== -1) return { kind: "match", matchIdx: i, team: "teamA", slot: ai as 0 | 1 };
    const bi = m.teamB.indexOf(id);
    if (bi !== -1) return { kind: "match", matchIdx: i, team: "teamB", slot: bi as 0 | 1 };
  }
  const si = sitOuts.findIndex((s) => s.playerId === id);
  if (si !== -1) return { kind: "sitout", sitIdx: si };
  return null;
}

export function swapPlayersInRound(
  matches: GeneratedMatch[],
  sitOuts: GeneratedSitOut[],
  playerA: string,
  playerB: string
): { matches: GeneratedMatch[]; sitOuts: GeneratedSitOut[] } {
  const posA = findPosition(playerA, matches, sitOuts);
  const posB = findPosition(playerB, matches, sitOuts);
  if (!posA || !posB) return { matches, sitOuts };

  const newMatches = matches.map((m) => ({
    ...m,
    teamA: [...m.teamA] as [string, string],
    teamB: [...m.teamB] as [string, string],
  }));
  const newSitOuts = sitOuts.map((s) => ({ ...s }));

  // Place playerB where playerA was
  if (posA.kind === "match") {
    newMatches[posA.matchIdx]![posA.team][posA.slot] = playerB;
  } else {
    newSitOuts[posA.sitIdx]!.playerId = playerB;
  }

  // Place playerA where playerB was
  if (posB.kind === "match") {
    newMatches[posB.matchIdx]![posB.team][posB.slot] = playerA;
  } else {
    newSitOuts[posB.sitIdx]!.playerId = playerA;
  }

  return { matches: newMatches, sitOuts: newSitOuts };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @picklebaddies/web exec vitest run src/lib/quick-sessions/round-edit.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/quick-sessions/round-edit.ts apps/web/src/lib/quick-sessions/round-edit.test.ts
git commit -m "$(cat <<'EOF'
feat(quick): pure swapPlayersInRound utility with tests

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `RoundEditModal` component

**Files:**
- Modify: `apps/web/src/app/quick/[sessionId]/page.tsx`

Add `RoundEditModal` as a function component directly above the existing `MatchCard` function (around line 165). Also add `GeneratedSitOut` to the match-engine import and add the `swapPlayersInRound` import.

- [ ] **Step 1: Update imports at top of `page.tsx`**

Find this line (line 11):
```ts
import { generateSchedule, type GeneratedMatch } from "@picklebaddies/match-engine";
```

Replace with:
```ts
import { generateSchedule, type GeneratedMatch, type GeneratedSitOut } from "@picklebaddies/match-engine";
```

Then add after line 13 (`import { upsertAllRosterPlayers } from "@/lib/quick-sessions/roster";`):
```ts
import { swapPlayersInRound } from "@/lib/quick-sessions/round-edit";
```

- [ ] **Step 2: Add `RoundEditModal` component**

Insert the following component **above** the `MatchCard` function definition (before `interface MatchCardProps` around line 165). The component uses the same amber/orange palette object `O` already defined at the top of the file.

```tsx
interface RoundEditModalProps {
  roundNumber: number;
  matches: GeneratedMatch[];
  sitOuts: GeneratedSitOut[];
  playerNames: Record<string, string>;
  onSave: (matches: GeneratedMatch[], sitOuts: GeneratedSitOut[]) => Promise<void>;
  onClose: () => void;
}

function RoundEditModal({ roundNumber, matches, sitOuts, playerNames, onSave, onClose }: RoundEditModalProps) {
  const [draftMatches, setDraftMatches] = useState<GeneratedMatch[]>(() =>
    matches.map((m) => ({ ...m, teamA: [...m.teamA] as [string, string], teamB: [...m.teamB] as [string, string] }))
  );
  const [draftSitOuts, setDraftSitOuts] = useState<GeneratedSitOut[]>(() =>
    sitOuts.map((s) => ({ ...s }))
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastSwapIds, setLastSwapIds] = useState<[string, string] | null>(null);
  const [lastSwapLabel, setLastSwapLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChipTap(playerId: string) {
    if (selectedId === null) {
      setSelectedId(playerId);
      return;
    }
    if (selectedId === playerId) {
      setSelectedId(null);
      return;
    }
    const result = swapPlayersInRound(draftMatches, draftSitOuts, selectedId, playerId);
    setDraftMatches(result.matches);
    setDraftSitOuts(result.sitOuts);
    setLastSwapIds([selectedId, playerId]);
    setLastSwapLabel(
      `${playerNames[selectedId] ?? selectedId} ↔ ${playerNames[playerId] ?? playerId}`
    );
    setSelectedId(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(draftMatches, draftSitOuts);
    } catch {
      setError("Save failed. Try again.");
      setSaving(false);
    }
  }

  function chipStyle(playerId: string): React.CSSProperties {
    const isSel = selectedId === playerId;
    const isTarget = selectedId !== null && selectedId !== playerId;
    const isRecent =
      lastSwapIds !== null &&
      selectedId === null &&
      (lastSwapIds[0] === playerId || lastSwapIds[1] === playerId);
    if (isRecent)
      return {
        background: "#DCFCE7", border: "1px solid #86EFAC", borderRadius: 99,
        padding: "5px 12px", fontSize: 13, fontWeight: 700, color: "#15803D",
        cursor: "pointer", transition: "all 0.12s",
      };
    return {
      background: isSel ? O.primary : isTarget ? "rgba(234,88,12,0.07)" : O.tag,
      border: isSel ? "none" : isTarget ? `1.5px dashed ${O.primary}` : `1px solid ${O.borderStrong}`,
      borderRadius: 99, padding: "5px 12px", fontSize: 13, fontWeight: 700,
      color: isSel ? "#fff" : isTarget ? O.primary : O.textPrimary,
      cursor: "pointer", transition: "all 0.12s",
    };
  }

  const canSave = !saving && selectedId === null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999,
      background: "rgba(67,20,7,0.55)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      padding: "0 0 env(safe-area-inset-bottom, 0px)",
    }}>
      <div style={{
        background: O.surface, borderRadius: "28px 28px 20px 20px",
        padding: "20px 20px 24px",
        width: "100%", maxWidth: 480, margin: "0 12px 12px",
        border: `1.5px solid ${O.borderStrong}`,
        boxShadow: `0 -8px 40px ${O.primaryGlow}, 0 0 0 1px rgba(234,88,12,0.08)`,
        animation: "qs-sheet-up 260ms cubic-bezier(0.34,1.56,0.64,1) both",
        maxHeight: "80dvh", overflowY: "auto",
      }}>
        {/* drag handle */}
        <div style={{ width: 32, height: 3, background: O.border, borderRadius: 2, margin: "0 auto 14px" }} />

        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 9, color: O.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 2 }}>Edit Round</div>
            <div style={{ fontSize: 15, color: O.textPrimary, fontWeight: 800 }}>Round {roundNumber}</div>
          </div>
          <button onClick={onClose} style={{ background: O.tag, border: `1px solid ${O.border}`, borderRadius: "50%", width: 32, height: 32, fontSize: 15, color: O.textMuted, cursor: "pointer", display: "grid", placeItems: "center" }}>✕</button>
        </div>

        {/* hint bar */}
        {selectedId !== null && (
          <div style={{ background: O.primaryDim, border: `1px solid rgba(234,88,12,0.25)`, borderRadius: 8, padding: "6px 10px", fontSize: 11, color: O.primary, fontWeight: 700, marginBottom: 12, textAlign: "center" }}>
            🟠 {playerNames[selectedId] ?? selectedId} selected — tap any player or bench to swap
          </div>
        )}

        {/* courts */}
        {draftMatches.map((match) => (
          <div key={match.courtId} style={{ background: O.tag, borderRadius: 12, padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: O.primary, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
              Court {match.courtId.replace("court-", "")}
            </div>
            {(["teamA", "teamB"] as const).map((team, ti) => (
              <div key={team} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: ti === 0 ? 6 : 0 }}>
                <span style={{ fontSize: 9, color: O.textSecondary, fontWeight: 700, width: 14, flexShrink: 0 }}>
                  {team === "teamA" ? "A" : "B"}
                </span>
                {match[team].map((playerId) => (
                  <button key={playerId} onClick={() => handleChipTap(playerId)} style={chipStyle(playerId)}>
                    {playerNames[playerId] ?? playerId}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ))}

        {/* bench */}
        {draftSitOuts.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: O.textSecondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Bench</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {draftSitOuts.map((so) => (
                <button key={so.playerId} onClick={() => handleChipTap(so.playerId)} style={chipStyle(so.playerId)}>
                  {playerNames[so.playerId] ?? so.playerId}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* swap confirmation */}
        {lastSwapLabel !== null && selectedId === null && (
          <div style={{ background: "#DCFCE7", border: "1px solid #86EFAC", borderRadius: 8, padding: "5px 10px", fontSize: 11, color: "#15803D", fontWeight: 700, marginBottom: 10, textAlign: "center" }}>
            ✓ {lastSwapLabel} swapped
          </div>
        )}

        {error !== null && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "#dc2626", marginBottom: 8 }}>{error}</div>
        )}

        <button
          onClick={handleSave}
          disabled={!canSave}
          style={{
            width: "100%",
            background: canSave ? O.primary : O.border,
            color: canSave ? "#fff" : O.textMuted,
            border: "none", borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 900,
            cursor: canSave ? "pointer" : "default",
            boxShadow: canSave ? `0 4px 20px ${O.primaryGlow}` : "none",
            transition: "all 0.15s", letterSpacing: "-0.01em",
          }}
        >
          {saving ? "Saving…" : selectedId !== null ? "Tap a player to swap" : `Save Round ${roundNumber} →`}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck to verify no errors**

```bash
pnpm --filter @picklebaddies/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/quick/\[sessionId\]/page.tsx
git commit -m "$(cat <<'EOF'
feat(quick): RoundEditModal bottom sheet component

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: State + save/regen handlers in `LiveSessionPage`

**Files:**
- Modify: `apps/web/src/app/quick/[sessionId]/page.tsx`

These additions go inside the `LiveSessionPage` function body, alongside the existing state and handler declarations.

- [ ] **Step 1: Add two new state variables**

Find this block (around line 279):
```ts
  const [regenError, setRegenError] = useState<string | null>(null);
```

Add immediately after it:
```ts
  const [activeEditRound, setActiveEditRound] = useState<number | null>(null);
  const [regenPromptRound, setRegenPromptRound] = useState<number | null>(null);
```

- [ ] **Step 2: Add `handleRoundEditSave`**

Insert the following function after `handleRemoveRound` (which ends around line 330):

```ts
  async function handleRoundEditSave(
    roundNumber: number,
    newMatches: GeneratedMatch[],
    newSitOuts: GeneratedSitOut[]
  ) {
    if (!session) return;
    const otherMatches = session.matches.filter((m) => m.roundNumber !== roundNumber);
    const otherSitOuts = session.sitOuts.filter((s) => s.roundNumber !== roundNumber);
    const mergedMatches = [...otherMatches, ...newMatches].sort(
      (a, b) => a.roundNumber - b.roundNumber || a.matchNumber - b.matchNumber
    );
    const mergedSitOuts = [...otherSitOuts, ...newSitOuts];
    const updated: QuickSession = { ...session, matches: mergedMatches, sitOuts: mergedSitOuts };
    setSession(updated);
    updateSessionInStorage(sessionId, () => updated);
    await updateSessionMatchesToFirestore(sessionId, mergedMatches, mergedSitOuts);
    setActiveEditRound(null);
    const hasSubsequent = session.matches.some((m) => m.roundNumber > roundNumber);
    if (hasSubsequent) setRegenPromptRound(roundNumber);
  }
```

- [ ] **Step 3: Add `handleRegenAfterEdit`**

Insert immediately after `handleRoundEditSave`:

```ts
  async function handleRegenAfterEdit(editedRoundNumber: number) {
    if (!session) return;
    setRegenerating(true);
    setRegenPromptRound(null);
    try {
      const lockedMatches = session.matches.filter((m) => m.roundNumber <= editedRoundNumber);
      const lockedSitOuts = session.sitOuts.filter((s) => s.roundNumber <= editedRoundNumber);
      const remainingRounds = new Set(
        session.matches
          .filter((m) => m.roundNumber > editedRoundNumber)
          .map((m) => m.roundNumber)
      ).size;
      const input = buildEngineInputForRebalance(
        session.players,
        session.courts,
        lockedMatches,
        editedRoundNumber,
        remainingRounds
      );
      const output = generateSchedule(input);
      const newMatches = [...lockedMatches, ...output.matches];
      const newSitOuts = [...lockedSitOuts, ...output.sitOuts];
      const updated: QuickSession = { ...session, matches: newMatches, sitOuts: newSitOuts };
      setSession(updated);
      updateSessionInStorage(sessionId, () => updated);
      await updateSessionMatchesToFirestore(sessionId, newMatches, newSitOuts);
    } catch {
      // non-fatal — user can dismiss and retry via Edit Session panel
    } finally {
      setRegenerating(false);
    }
  }
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @picklebaddies/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/quick/\[sessionId\]/page.tsx
git commit -m "$(cat <<'EOF'
feat(quick): round edit state + save/regen handlers

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Edit button on live rounds

**Files:**
- Modify: `apps/web/src/app/quick/[sessionId]/page.tsx`

- [ ] **Step 1: Replace the "🔥 Live" badge span with badge + edit button**

Find this exact string in the render (inside the active-rounds map, around line 548):
```tsx
                  {badge === "playing" && <span style={{ fontSize: 9, color: O.primary, background: O.tag, border: `1px solid ${O.borderStrong}`, borderRadius: 99, padding: "2px 10px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>🔥 Live</span>}
```

Replace with:
```tsx
                  {badge === "playing" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 9, color: O.primary, background: O.tag, border: `1px solid ${O.borderStrong}`, borderRadius: 99, padding: "2px 10px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>🔥 Live</span>
                      {!finished && (
                        <button
                          onClick={() => setActiveEditRound(roundNumber)}
                          style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(234,88,12,0.1)", border: "1px solid rgba(234,88,12,0.3)", color: O.primary, cursor: "pointer", fontFamily: "var(--font-mono)" }}
                        >✏️ Edit</button>
                      )}
                    </div>
                  )}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @picklebaddies/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/quick/\[sessionId\]/page.tsx
git commit -m "$(cat <<'EOF'
feat(quick): Edit button on live rounds

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Edit button on upcoming rounds

**Files:**
- Modify: `apps/web/src/app/quick/[sessionId]/page.tsx`

- [ ] **Step 1: Wrap the Remove button with a flex row that also includes an Edit button**

Find this exact block (inside the upcoming rounds strip, around line 620):
```tsx
                          <button
                            onClick={() => handleRemoveRound(rn)}
                            disabled={isRemoving}
                            style={{
                              background: isRemoving ? O.tag : "#fef2f2",
                              border: `1px solid ${isRemoving ? O.border : "#fca5a5"}`,
                              borderRadius: 8, padding: "4px 10px",
                              fontSize: 12, color: isRemoving ? O.borderStrong : "#dc2626",
                              cursor: isRemoving ? "default" : "pointer", fontWeight: 700,
                            }}
                          >
                            {isRemoving ? "…" : "Remove"}
                          </button>
```

Replace with:
```tsx
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={() => setActiveEditRound(rn)}
                              disabled={isRemoving}
                              style={{
                                background: "rgba(234,88,12,0.1)",
                                border: "1px solid rgba(234,88,12,0.3)",
                                borderRadius: 8, padding: "4px 10px",
                                fontSize: 12, color: O.primary,
                                cursor: isRemoving ? "default" : "pointer", fontWeight: 700,
                                opacity: isRemoving ? 0.4 : 1,
                              }}
                            >✏️ Edit</button>
                            <button
                              onClick={() => handleRemoveRound(rn)}
                              disabled={isRemoving}
                              style={{
                                background: isRemoving ? O.tag : "#fef2f2",
                                border: `1px solid ${isRemoving ? O.border : "#fca5a5"}`,
                                borderRadius: 8, padding: "4px 10px",
                                fontSize: 12, color: isRemoving ? O.borderStrong : "#dc2626",
                                cursor: isRemoving ? "default" : "pointer", fontWeight: 700,
                              }}
                            >
                              {isRemoving ? "…" : "Remove"}
                            </button>
                          </div>
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @picklebaddies/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/quick/\[sessionId\]/page.tsx
git commit -m "$(cat <<'EOF'
feat(quick): Edit button on upcoming rounds

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Render `RoundEditModal` and `RegenPrompt`, then smoke-test

**Files:**
- Modify: `apps/web/src/app/quick/[sessionId]/page.tsx`

- [ ] **Step 1: Render `RoundEditModal` at bottom of return**

Find this block at the very end of the JSX (just before the final closing `</div>` of the root element, around line 800):
```tsx
        {activeMatch && (
          <ScoreModal
```

Insert **before** the `{activeMatch && ...}` block:
```tsx
        {activeEditRound !== null && !finished && session && (
          <RoundEditModal
            roundNumber={activeEditRound}
            matches={session.matches.filter((m) => m.roundNumber === activeEditRound)}
            sitOuts={session.sitOuts.filter((s) => s.roundNumber === activeEditRound)}
            playerNames={playerNames}
            onSave={(m, s) => handleRoundEditSave(activeEditRound, m, s)}
            onClose={() => setActiveEditRound(null)}
          />
        )}
```

- [ ] **Step 2: Render `RegenPrompt` after `RoundEditModal`**

Insert immediately after the `RoundEditModal` block just added:
```tsx
        {regenPromptRound !== null && session && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(67,20,7,0.55)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            padding: "0 0 env(safe-area-inset-bottom, 0px)",
          }}>
            <div style={{
              background: O.surface, borderRadius: "28px 28px 20px 20px",
              padding: "24px 20px 28px",
              width: "100%", maxWidth: 480, margin: "0 12px 12px",
              border: `1.5px solid ${O.borderStrong}`,
              boxShadow: `0 -8px 40px ${O.primaryGlow}`,
              animation: "qs-sheet-up 260ms cubic-bezier(0.34,1.56,0.64,1) both",
            }}>
              <div style={{ width: 32, height: 3, background: O.border, borderRadius: 2, margin: "0 auto 16px" }} />
              <div style={{ textAlign: "center", fontSize: 32, marginBottom: 8 }}>⚖️</div>
              <div style={{ textAlign: "center", fontWeight: 900, fontSize: 16, color: O.textPrimary, marginBottom: 6 }}>
                Regenerate remaining rounds?
              </div>
              <p style={{ textAlign: "center", fontSize: 13, color: O.textSecondary, margin: "0 0 20px", lineHeight: 1.5 }}>
                Round {regenPromptRound} was edited. Regenerating will rebalance pairings to account for the change.
              </p>
              {(() => {
                const remaining = new Set(
                  session.matches
                    .filter((m) => m.roundNumber > regenPromptRound!)
                    .map((m) => m.roundNumber)
                ).size;
                return (
                  <>
                    <button
                      onClick={() => handleRegenAfterEdit(regenPromptRound!)}
                      disabled={regenerating}
                      style={{
                        width: "100%", background: regenerating ? O.border : O.primary,
                        color: regenerating ? O.textMuted : "#fff",
                        border: "none", borderRadius: 14, padding: 16, fontSize: 15, fontWeight: 900,
                        cursor: regenerating ? "default" : "pointer",
                        boxShadow: regenerating ? "none" : `0 4px 20px ${O.primaryGlow}`,
                        marginBottom: 8, letterSpacing: "-0.01em",
                      }}
                    >
                      {regenerating ? "Regenerating…" : `Yes, rebalance ${remaining} round${remaining !== 1 ? "s" : ""} →`}
                    </button>
                    <button
                      onClick={() => setRegenPromptRound(null)}
                      style={{
                        width: "100%", background: O.tag, color: O.textSecondary,
                        border: `1px solid ${O.border}`, borderRadius: 14, padding: 13,
                        fontSize: 14, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      No, keep as-is
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        )}
```

- [ ] **Step 3: Final typecheck**

```bash
pnpm --filter @picklebaddies/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke-test in browser**

```bash
pnpm emulators &   # or leave running if already up
pnpm dev:web
```

Open `http://localhost:3000` and perform these checks:

1. Create a new quick session with 6 players, 2 courts, 3 rounds.
2. Confirm the live Round 1 header shows `🔥 Live` + `✏️ Edit` button.
3. Tap `✏️ Edit` → bottom sheet slides up showing Court 1 with Team A / Team B chips and Bench chips.
4. Tap a chip → it turns orange, hint bar appears, other chips get dashed border.
5. Tap the same chip again → deselects (no swap).
6. Tap a different chip → chips swap positions, green confirmation shows, Save becomes active.
7. Tap `Save Round 1 →` → sheet closes. If Round 2 or 3 exist, the regen prompt slides up.
8. Tap `No, keep as-is` → prompt dismisses, session unchanged except Round 1 assignments.
9. Re-open Edit for Round 1, make a swap, save → tap `Yes, rebalance…` → Rounds 2+ regenerate.
10. In the upcoming rounds strip, expand it → each queued round shows `✏️ Edit` + `Remove` buttons.
11. Tap `✏️ Edit` on a queued round → same sheet opens, swap works, save works.
12. Confirm done rounds show no `✏️ Edit` button.
13. Confirm finishing the session (`statsCommitted = true`) hides all edit buttons.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/quick/\[sessionId\]/page.tsx
git commit -m "$(cat <<'EOF'
feat(quick): per-round player edit — RoundEditModal + RegenPrompt wired

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
