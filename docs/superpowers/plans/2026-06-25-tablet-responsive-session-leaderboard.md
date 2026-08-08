# Plan: Tablet Responsive Layout + Session Leaderboard

**Generated**: 2026-06-25
**Estimated Complexity**: Medium

## Overview

Two orthogonal improvements to the quick-session pages:

1. **Responsive tablet layout** — quick pages are mobile-first with hard `maxWidth: 480–640px` caps and single-column flows. On tablet (≥768px) the session detail page goes 2-column (rounds left, leaderboard/players right); hub/sessions/players pages expand to wider single-column (~860px) with bigger card grids.

2. **Session leaderboard** — a "Leaderboard" tab on the session detail page, computed live from `session.scores` + `session.matches`. Shows each player sorted by W/L with columns: Rank, Name, Games, W, L, Win%.

All pages use inline `style={}` + `<style>` tags. No Tailwind. Changes stay in that pattern. A shared CSS variable `--qs-content-max` controls the content column width and changes at the tablet breakpoint.

## Prerequisites

- Working Next.js dev server (`pnpm dev:web`)
- No new dependencies needed — all logic is pure derived computation

---

## Sprint 1: Responsive Foundations (list pages)

**Goal**: Hub, Sessions list, and Players list pages feel native on tablet — wider, breathing-room layout with larger card grids where appropriate.

**Demo/Validation**:
- Open `/quick`, `/quick/sessions`, `/quick/players` in browser at 375px, 768px, 1024px widths
- Content area widens at 768px; cards use 2-col grid on players page at tablet
- No layout breaks at any width

### Task 1.1: Add shared CSS media-query block to quick pages

- **Location**: `apps/web/src/app/quick/page.tsx`, `apps/web/src/app/quick/sessions/page.tsx`, `apps/web/src/app/quick/players/page.tsx`
- **Description**: In each page's `<style>` block, add a `@media (min-width: 768px)` rule that sets `--qs-content-max: 860px` (mobile default is 480px for hub, 640px for lists). The outer content wrapper's `maxWidth` already reads from inline style — change it to use a CSS variable via a className+CSS approach: wrap the content `<div>` with `className="qs-content"` and control width via the style tag.
- **Acceptance Criteria**:
  - `maxWidth` on the content column grows at ≥768px
  - No horizontal scroll at any width

### Task 1.2: Players page — 2-col player card grid on tablet

- **Location**: `apps/web/src/app/quick/players/page.tsx`
- **Description**: The players list is a single column of cards. On tablet, show 2 cards per row. Wrap the player list in a grid container that switches from `grid-template-columns: 1fr` to `repeat(2, 1fr)` via a CSS class. The stats grid inside each card already uses `repeat(4, 1fr)` — keep it; just increase the outer card font sizes slightly for the bigger viewport.
- **Acceptance Criteria**:
  - 1-col on mobile, 2-col on tablet
  - Stats inside each card still readable at both widths

### Task 1.3: Sessions page — wider card layout on tablet

- **Location**: `apps/web/src/app/quick/sessions/page.tsx`
- **Description**: Session cards have a progress bar and metadata row. On tablet, adjust card padding and font sizes slightly. The "New Session" CTA button at the top should also be a bit taller/larger on tablet. No grid change needed here — list stays single column but wider.
- **Acceptance Criteria**:
  - Cards look appropriate at 768px+

### Task 1.4: Hub page — expand action grid on tablet

- **Location**: `apps/web/src/app/quick/page.tsx`
- **Description**: The hub has a primary CTA (`New Session`) and a 2-col secondary grid (`Sessions | Players`). On tablet: primary CTA can have bigger text/padding; secondary grid switches to wider cells. The content column expands to 860px matching Task 1.1. Roster strip also gets a bit more visual weight.
- **Acceptance Criteria**:
  - Hub page looks intentional and not "stretched mobile" at 768px+

---

## Sprint 2: Session Page — Tab Bar + 2-Col Layout

**Goal**: Session detail page gets a tab bar (Rounds / Leaderboard) and on tablet the layout goes 2-column with rounds on the left and the right column reserved for the leaderboard panel.

**Demo/Validation**:
- Open a session with scored matches at 375px: see Rounds tab active, Leaderboard tab switches view
- At 768px: see 2-col layout, left = rounds, right = leaderboard panel (always visible, no tab switch needed)
- No regressions to score entry, round editing, rebalance flows

### Task 2.1: Add `activeTab` state and tab bar UI to session page

- **Location**: `apps/web/src/app/quick/[sessionId]/page.tsx` — main render, around line 769 (the content `<div>` start)
- **Description**: Add `const [activeTab, setActiveTab] = useState<"rounds" | "leaderboard">("rounds")` to state. Below the header, add a tab bar row with two pill buttons: "Rounds" and "Leaderboard". Style consistent with existing amber palette (active tab: `background: O.primary`, inactive: `background: O.tag`). The tab bar only renders on mobile (hidden via CSS class `qs-tab-bar-mobile`).
- **Acceptance Criteria**:
  - Tab bar visible below header on mobile
  - Tab bar hidden on tablet (≥768px) via `@media (min-width: 768px) { .qs-tab-bar-mobile { display: none } }`
  - Active tab state toggles correctly

### Task 2.2: Wrap content in 2-col grid for tablet

- **Location**: `apps/web/src/app/quick/[sessionId]/page.tsx` — the main content `<div>` (currently at line 769)
- **Description**: Wrap the existing rounds+upcoming content in a `<div className="qs-rounds-col">` and add a sibling `<div className="qs-leaderboard-col">` placeholder. The parent becomes `<div className="qs-session-body">`. In the `<style>` block add:
  ```css
  .qs-session-body { display: flex; flex-direction: column; }
  .qs-leaderboard-col { display: none; }
  @media (min-width: 768px) {
    .qs-session-body { flex-direction: row; gap: 20px; max-width: 1100px; margin: 0 auto; width: 100%; padding: 16px; box-sizing: border-box; }
    .qs-rounds-col { flex: 1; min-width: 0; }
    .qs-leaderboard-col { width: 340px; flex-shrink: 0; display: block; }
  }
  ```
- **Acceptance Criteria**:
  - On mobile: single column, leaderboard-col hidden
  - On tablet: side-by-side, rounds left ~65%, leaderboard right ~340px fixed
  - Existing round/score/edit flows unaffected

### Task 2.3: Mobile tab-based conditional rendering

- **Location**: `apps/web/src/app/quick/[sessionId]/page.tsx`
- **Description**: On mobile, wrap the rounds content in `{activeTab === "rounds" && <div>...</div>}` and the leaderboard content in `{activeTab === "leaderboard" && <div>...</div>}`. On tablet, both are always visible via the 2-col grid CSS (the conditional rendering becomes irrelevant, but `activeTab` is irrelevant there since `.qs-leaderboard-col { display: block }` overrides).
- **Note**: The cleanest approach is to always render both panels but control visibility primarily via CSS on tablet, and use the `activeTab` conditional for mobile only. Wrap rounds in: `<div className={`qs-rounds-col${activeTab !== "rounds" ? " qs-mobile-hidden" : ""}`}>` and leaderboard similarly.
- **Acceptance Criteria**:
  - Mobile: only one panel visible at a time
  - Tablet: both panels always visible regardless of `activeTab`

---

## Sprint 3: Session Leaderboard Component

**Goal**: Build the leaderboard calculation utility and UI component, wire it into the session page.

**Demo/Validation**:
- Open a session with at least 2 scored rounds
- Leaderboard tab/panel shows all players ranked by wins descending
- Columns: Rank, Name, G (games), W, L, Win%
- Sit-outs shown as a small indicator
- Player with 0 games played still appears (no division-by-zero)

### Task 3.1: Add `computeSessionLeaderboard` pure function

- **Location**: New file `apps/web/src/lib/quick-sessions/leaderboard.ts`
- **Description**: Pure function that takes `{ players, matches, scores, sitOuts }` from a `QuickSession` and returns an array of `SessionPlayerRow` sorted by wins desc, then win% desc, then name asc:
  ```ts
  export interface SessionPlayerRow {
    playerId: string;
    name: string;
    games: number;   // matches played (where this player was in teamA or teamB)
    wins: number;
    losses: number;
    winPct: number;  // 0–100, NaN if games === 0
    sitOuts: number; // rounds sat out
  }
  ```
  Logic:
  - For each scored match (key present in `scores`): find teamA and teamB, use `getWinner` to determine winning side, increment wins/losses for each player in that side.
  - Sit-outs: count entries in `sitOuts` array per player.
  - winPct = games > 0 ? (wins / games) * 100 : NaN
- **Dependencies**: Imports `computeMatchKey`, `getWinner` from `./score`; imports `QuickSession` type
- **Acceptance Criteria**:
  - Returns all session players even if unsocred
  - Sorted correctly
  - No crashes on 0-game players

### Task 3.2: Build `SessionLeaderboard` component (inline, same file)

- **Location**: `apps/web/src/app/quick/[sessionId]/page.tsx` — add as a function component before the main `export default`
- **Description**: Renders a compact leaderboard table. Props: `{ session: QuickSession, playerNames: Record<string, string> }`. Internally calls `computeSessionLeaderboard`. Layout:
  - Section header: "🏆 Session Standings"
  - Subtitle: "Based on scored matches"
  - Table rows (not `<table>`, use flex divs for mobile-friendliness): Rank medal emoji for top 3, then player name, then stat chips for G / W / L / Win%
  - Top player gets a subtle highlighted background
  - If no matches scored yet: empty-state message "Scores will appear here after the first match"
  - Unsored players shown at bottom with dimmed style and "—" stats
- **Acceptance Criteria**:
  - Renders without error on a fresh session (0 scores)
  - Correct rankings after scores entered
  - Consistent with amber/orange palette (reuse `O` constant)

### Task 3.3: Wire leaderboard into session page layout

- **Location**: `apps/web/src/app/quick/[sessionId]/page.tsx`
- **Description**: 
  - In the `qs-leaderboard-col` div (desktop right panel), render `<SessionLeaderboard session={session} playerNames={playerNames} />`
  - In the mobile leaderboard panel (shown when `activeTab === "leaderboard"`), render the same component
  - The component is stateless and always reads live from `session` — no extra state needed
- **Acceptance Criteria**:
  - Leaderboard updates immediately when a score is entered (since `session` state already updates on score save)
  - No duplicate component definition

### Task 3.4: Leaderboard sticky header on tablet

- **Location**: `apps/web/src/app/quick/[sessionId]/page.tsx` — `<style>` block
- **Description**: On tablet, the right column leaderboard panel should be sticky so it stays visible while the user scrolls through rounds on the left. Add:
  ```css
  @media (min-width: 768px) {
    .qs-leaderboard-col {
      position: sticky;
      top: 16px;
      align-self: flex-start;
      max-height: calc(100dvh - 120px);
      overflow-y: auto;
    }
  }
  ```
- **Acceptance Criteria**:
  - Leaderboard panel stays in view while scrolling rounds on left
  - No overflow issues

---

## Testing Strategy

- Manual browser testing at 375px (iPhone SE), 768px (iPad portrait), 1024px (iPad landscape)
- Enter scores in a session and verify leaderboard updates live
- Tab switching on mobile: verify only one panel shows
- Keyboard/focus: tab bar buttons are keyboard-accessible
- Edge cases: 0 players scored, all tied (impossible per rules but 0-score session), 1 player sessions

## Potential Risks & Gotchas

- **Inline style vs CSS class**: Pages use inline `style={}` throughout. Adding CSS classes requires ensuring the `<style>` tag in each page includes the class. Since each page already has a `<style>` tag, this is fine — just add classes there.
- **Session page is 1144 lines**: Changes are surgical (add state, add tab bar, wrap content div, add leaderboard component). Don't refactor surrounding code.
- **`getWinner` import**: `leaderboard.ts` needs `getWinner` from `./score`. Both files are in `lib/quick-sessions/` — straightforward import.
- **Win% display**: For players with 0 games, show "—" not "NaN%" or "0%". This is a UX decision, not a bug.
- **Tablet sticky sidebar**: `position: sticky` requires the parent to not have `overflow: hidden`. The current `<div style={{ flex:1... }}>` wrapper doesn't have that — but verify at implementation time.
- **Tab bar vs 2-col on tablet**: The tab bar must be hidden on tablet via CSS, otherwise users see redundant navigation. CSS `display: none` on `.qs-tab-bar-mobile` handles this cleanly.
- **`matchStates` variable scope**: The leaderboard needs `session.scores` and `session.matches`, both already in scope inside the page component. No additional data fetching needed.

## Rollback Plan

- All changes are UI-only and additive (new component, new CSS, new state)
- Reverting means: remove the tab bar JSX, remove the `qs-session-body` wrapper, remove the `SessionLeaderboard` component, remove `leaderboard.ts`
- No data model changes, no server actions touched
