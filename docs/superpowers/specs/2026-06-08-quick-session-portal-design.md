# Quick Session Portal — Design Spec

**Date:** 2026-06-08  
**Status:** Approved  
**Scope:** MVP — no auth, no user accounts, tablet/mobile-first

## Visual Design

Light theme — distinct from the main dark PickleBaddies app to visually signal "quick/casual mode."

| Token | Value |
|---|---|
| Background | `#faf9f6` (warm white) |
| Surface (cards) | `#ffffff` |
| Border | `#e8dfc0` |
| Accent primary | `#e8650a` (orange) — buttons, active borders, winner score |
| Accent dark | `#c25a00` — headings, labels |
| Accent light | `#fef3e0` / `#f0c870` — chip backgrounds, hover states |
| Text primary | `#2a1e08` |
| Text muted | `#b0a080` |
| Done badge | green `#edfae0` / `#3a7a1a` |
| Playing badge | amber `#fff3d0` / `#8a5a00` |

---

## Overview

A no-login portal for running casual doubles sessions. An organiser enters player names, configures courts and round count, generates balanced matches via the existing `match-engine`, and tracks scores in real time. State persists to localStorage and a lightweight Firestore collection for refresh safety. Migration to the full app data model is intentional future work.

---

## Architecture

### Two pages

| Route | Purpose |
|---|---|
| `/quick` | Setup: session config + add players → generate |
| `/quick/[sessionId]` | Live: all rounds, match cards, score entry |

`sessionId` is generated client-side (nanoid, 8 chars) at generate time. It appears in the URL immediately after redirect, so a refresh of Page 2 restores from Firestore.

### Data flow

1. User fills Page 1 → clicks "Generate N Rounds"
2. Client calls `match-engine` (`generateSchedule`) directly — pure, no Firebase
3. Result written to Firestore `quickSessions/{sessionId}` + localStorage key `qs:{sessionId}`
4. Browser redirects to `/quick/{sessionId}`
5. Page 2 reads from localStorage first (fast), falls back to Firestore if stale/missing
6. Score entry writes to both localStorage and Firestore in real time

### No auth required

The portal is accessible without sign-in. Firestore rules for `quickSessions` will allow unauthenticated reads/writes scoped to the document (MVP). Auth can be layered in later.

---

## Page 1 — /quick

### Fields

| Field | Type | Default | Notes |
|---|---|---|---|
| Session name | text input | "Quick Session" | Optional, display only |
| Courts | stepper (1–6) | 2 | − / + buttons |
| Rounds to generate | stepper (1–10) | 3 | Replaces time-based estimation |

### Players

- Name text input + skill dropdown (Beginner / Intermediate / Advanced / Unknown) + Add button
- Submit on Enter key
- Added players shown as removable chips
- Minimum to generate: 4 players (2 × courts minimum enforced at button level)

### Generate button

- Label: "Generate N Rounds →" (N reflects the stepper value live)
- Disabled + tooltip if < 4 players
- On click: run engine → save → redirect to `/quick/{sessionId}`

---

## Page 2 — /quick/[sessionId]

### Header

Session name, player count, courts, rounds. Session ID shown as a copyable code (for sharing to a second tablet).

### Round sections

Rounds rendered in order (1, 2, 3…). Each round has a status badge:

| Status | Condition | Visual |
|---|---|---|
| Done | All matches in round have scores | Green badge, scores locked (read-only) |
| Playing | Any match in round has no score | Amber badge, score entry available |
| Up next | Round > any Playing round | Dimmed, teams visible but not yet active |

All rounds are generated upfront — "Up next" rounds show their match cards dimmed (teams are known), not "TBD". This is intentional: it lets players see upcoming matchups.

Sit-outs for a round shown as a small note below the match cards.

### Match card

- Court label (top)
- Team A name pair — Score A — vs — Score B — Team B name pair
- Winner team highlighted (volt green), loser dimmed
- Unscored: dashed score boxes + "Tap to enter score" CTA

### Score entry (modal)

Triggered by tapping any unscored match card. Modal shows:

- Team A name (large) + number input
- vs
- Team B name (large) + number input
- "Save Score" button — validates both fields non-empty, both ≥ 0, not equal
- Winner auto-detected (higher score)
- On save: updates localStorage + Firestore, closes modal

---

## Firestore Data Model (MVP)

Collection: `quickSessions`

```
quickSessions/{sessionId}
  name: string
  courts: number
  rounds: number
  players: [{ id, name, skill }]
  matches: GeneratedMatch[]    // from match-engine EngineOutput
  sitOuts: GeneratedSitOut[]
  scores: {
    [matchKey: string]: { teamAScore: number, teamBScore: number }
  }
  createdAt: Timestamp
```

`matchKey` = `r{roundNumber}_c{courtId}` (stable, derivable from match data).

No subcollections — entire session is one document. Fine for MVP session sizes (< 50 matches).

---

## match-engine Integration

The engine is called client-side with `mode: "initial"`, `elapsedRounds: 0`, `lockedMatches: []`. Courts are synthesised from the court count (`Court 1`, `Court 2`, …).

Round count is controlled via: `sessionDurationMinutes = roundsToGenerate, estimatedGameMinutes = 1`. The engine formula is `floor(sessionDurationMinutes / estimatedGameMinutes)`, so this reliably produces exactly the requested number of rounds.

---

## Not in scope (MVP)

- Auth / user accounts
- Rebalancing rounds mid-session
- Late joiners (all players added before generate)
- Player stats / history
- Sharing live session link to other devices for real-time sync (sessionId is shareable, but Firestore real-time listener is optional MVP+ work)

---

## Migration path

- `quickSessions` collection can be migrated to the full `sessions` schema in a later milestone
- Player IDs are local UUIDs (not `users/{uid}`) — mapping to real user accounts is future work
- No breaking changes to `match-engine` required
