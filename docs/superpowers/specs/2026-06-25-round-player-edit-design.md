# Round Player Edit — Design Spec

**Date:** 2026-06-25  
**Feature:** Per-round player assignment editing in Quick Session live view  
**Status:** Approved for implementation

---

## Overview

Add the ability to manually edit player-to-court assignments within any live or queued (upcoming) round directly from the Quick Session live page (`/quick/[sessionId]`). Done rounds are read-only. The interaction uses a bottom sheet modal (consistent with score entry UX) with tap-to-swap mechanics.

---

## Trigger

- Each **live** round card gains an `✏️ Edit` button next to its `🔥 Live` badge in the round header.
- Each **upcoming (queued)** round row (in the collapsible upcoming strip) gains an `✏️ Edit` button.
- **Done** rounds show no Edit button — assignments are immutable once scored.
- Tapping Edit opens the Round Edit bottom sheet for that specific round.

---

## Round Edit Bottom Sheet

### Layout

Identical slide-up animation and overlay as the existing `ScoreModal`. Structure:

```
drag handle
"Edit Round N"                              [✕]
──────────────────────────────────────────
[hint bar — hidden when no selection active]
──────────────────────────────────────────
Court 1
  A  [Player chip] [Player chip]
  B  [Player chip] [Player chip]

Court 2 (if present)
  A  [Player chip] [Player chip]
  B  [Player chip] [Player chip]

Bench
  [Player chip] [Player chip] …

[swap confirmation toast — hidden until first swap]
──────────────────────────────────────────
[Save Round N →]                 (disabled while a chip is selected)
```

### Tap-to-swap interaction

1. **Tap a chip** → chip turns orange (selected state). Hint bar appears: `"🟠 <Name> selected — tap any player or bench to swap"`. All other chips render with dashed orange border (swap-target state). Save button is disabled while a selection is active.
2. **Tap a second chip** (court or bench) → the two players exchange positions. Hint bar clears. Both swapped chips briefly flash green (`#DCFCE7` background). A swap confirmation line appears below the bench: `"✓ <A> ↔ <B> swapped"`. Save button becomes enabled.
3. **Tap the selected chip again** → deselects it (cancels the selection without swapping).
4. Multiple sequential swaps are allowed before saving.
5. No player may appear in two positions simultaneously — the UI prevents this automatically since swapping moves both chips.

### Validation

- Minimum 4 players total must remain on courts (1 court × 2v2). Enforced by the engine on save; surface any error in a red inline banner above Save.
- No duplicate player in the same round — guaranteed structurally by the swap mechanic.

### Save

- Tapping **Save Round N →** writes the updated match assignments to local state, `localStorage`, and Firestore (via `updateSessionMatchesToFirestore`).
- The bottom sheet dismisses immediately.
- **If there are rounds with a higher round number than the edited round**, a second bottom sheet (the Regenerate Prompt) slides up.

---

## Regenerate Prompt (second bottom sheet)

Shown after saving edits when subsequent queued rounds exist.

```
⚖️
Regenerate remaining rounds?
Round N was edited. Regenerating Round N+1… will rebalance
pairings to account for the change.

[Yes, rebalance X round(s) →]
[No, keep as-is]
```

- **Yes** → calls the existing `handleRegenerate` logic (lock done+live matches, regenerate future rounds from current player list). Uses same Firestore write path as the existing Edit Session panel.
- **No** → dismisses; subsequent rounds stay as-is.
- If the edited round is the last round (no future rounds exist), skip this prompt entirely.

---

## State management

- Local state: `session.matches` and `session.sitOuts` updated in React state + `localStorage` immediately on Save.
- Firestore: `updateSessionMatchesToFirestore(sessionId, newMatches, newSitOuts)` — same function used by "Remove Round".
- The sheet holds a **draft copy** of the round's matches (`draftMatches` local state) that is only committed on Save. Closing the sheet without saving discards the draft.

---

## Files affected

| File | Change |
|---|---|
| `apps/web/src/app/quick/[sessionId]/page.tsx` | Add `RoundEditModal` component; wire Edit buttons; add regenerate-prompt logic |
| No new files, no new server actions, no new Firestore fields |

### New component: `RoundEditModal`

Props:
```ts
interface RoundEditModalProps {
  roundNumber: number;
  matches: GeneratedMatch[];       // only this round's matches
  sitOuts: GeneratedSitOut[];      // only this round's sit-outs
  allPlayers: QuickPlayer[];       // full session player list
  playerNames: Record<string, string>;
  onSave: (matches: GeneratedMatch[], sitOuts: GeneratedSitOut[]) => Promise<void>;
  onClose: () => void;
}
```

Internal state:
- `draftMatches: GeneratedMatch[]` — mutable copy of this round's matches
- `draftSitOuts: GeneratedSitOut[]` — mutable copy of this round's sit-outs
- `selectedPlayerId: string | null` — currently selected chip
- `swapLog: string[]` — human-readable list of swaps for the confirmation line

---

## Edge cases

| Scenario | Behaviour |
|---|---|
| Edit a live round | Allowed. Sheet opens normally. On save, changes take effect immediately (next court check will reflect new assignments). |
| Edit the only round | Save skips the regenerate prompt. |
| Close sheet without saving | Draft discarded, session unchanged. |
| Session `statsCommitted === true` | Edit buttons not rendered (session is finished). |
| Only 4 players, 1 court | Bench is empty. Swapping within court teams still works. |
| Tap same chip twice | Deselects without swapping. |

---

## Out of scope

- Adding a brand-new player (not in `session.players`) to a specific round only — use the existing Edit Session panel for that.
- Drag-and-drop interactions.
- Editing done rounds.
