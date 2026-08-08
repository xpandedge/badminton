// apps/web/src/app/quick/[sessionId]/page.tsx
"use client";

import { useState, useEffect, use } from "react";
import type { QuickSession, QuickScore, QuickPlayer, SkillLevel } from "@/lib/quick-sessions/types";
import { loadSessionFromStorage, updateSessionInStorage } from "@/lib/quick-sessions/storage";
import { loadSessionFromFirestore, saveScoreToFirestore, commitSessionStats, updateSessionMatchesToFirestore, applySessionRebalanceToFirestore } from "@/lib/quick-sessions/firestore";
import { computeMatchKey, getWinner } from "@/lib/quick-sessions/score";
import { useAuth } from "@/lib/auth/useAuth";
import { computeMatchStates } from "@/lib/quick-sessions/queue";
import { generateSchedule, type GeneratedMatch, type GeneratedSitOut } from "@picklebaddies/match-engine";
import { buildEngineInputForRebalance } from "@/lib/quick-sessions/engine";
import { upsertAllRosterPlayers } from "@/lib/quick-sessions/roster";
import { swapPlayersInRound } from "@/lib/quick-sessions/round-edit";
import { computeSessionLeaderboard } from "@/lib/quick-sessions/leaderboard";

// ── amber/orange palette ────────────────────────────────────────────
const O = {
  bg:          "#FFF7ED",
  surface:     "#FFFFFF",
  border:      "#FED7AA",
  borderStrong:"#FDBA74",
  primary:     "#EA580C",
  primaryBright:"#F97316",
  primaryGlow: "rgba(234,88,12,0.35)",
  primaryDim:  "rgba(234,88,12,0.12)",
  textPrimary: "#431407",
  textSecondary:"#9A3412",
  textMuted:   "#C2410C",
  tag:         "#FFEDD5",
  headerBg:    "#431407",
  winnerBg:    "#FFEDD5",
  green:       "#15803D",
  greenBg:     "#DCFCE7",
  greenBorder: "#86EFAC",
} as const;

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

  const inputStyle: React.CSSProperties = {
    width: "100%", textAlign: "center", fontSize: 38, fontWeight: 900,
    padding: "12px 0", boxSizing: "border-box",
    background: O.tag, border: `2px solid ${O.border}`, borderRadius: 14,
    color: O.textPrimary, outline: "none", WebkitAppearance: "none",
    MozAppearance: "textfield",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999,
      background: "rgba(67,20,7,0.55)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      padding: "0 0 env(safe-area-inset-bottom, 0px)",
    }}>
      <div style={{
        background: O.surface,
        borderRadius: "28px 28px 20px 20px",
        padding: "20px 20px 24px",
        width: "100%", maxWidth: 480, margin: "0 12px 12px",
        border: `1.5px solid ${O.borderStrong}`,
        boxShadow: `0 -8px 40px ${O.primaryGlow}, 0 0 0 1px rgba(234,88,12,0.08)`,
        animation: "qs-sheet-up 260ms cubic-bezier(0.34,1.56,0.64,1) both",
      }}>
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 9, color: O.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 2 }}>Enter Score</div>
            <div style={{ fontSize: 15, color: O.textPrimary, fontWeight: 800 }}>
              Court {match.courtId.replace("court-", "")}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: O.tag, border: `1px solid ${O.border}`,
            borderRadius: "50%", width: 32, height: 32, fontSize: 15,
            color: O.textMuted, cursor: "pointer", display: "grid", placeItems: "center",
          }}>✕</button>
        </div>

        {/* Score row — proper 3-column layout */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
          {/* Team A */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: O.textSecondary, textAlign: "center", marginBottom: 8, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {teamA}
            </div>
            <input
              type="number" min={0} inputMode="numeric" value={scoreA}
              onChange={(e) => setScoreA(e.target.value)}
              placeholder="0"
              style={inputStyle}
              autoFocus
            />
          </div>

          {/* VS — centered between the two inputs */}
          <div style={{
            flexShrink: 0, width: 30,
            display: "flex", alignItems: "center", justifyContent: "center",
            paddingTop: 34,
          }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: O.borderStrong, letterSpacing: "0.06em" }}>VS</span>
          </div>

          {/* Team B */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: O.textSecondary, textAlign: "center", marginBottom: 8, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {teamB}
            </div>
            <input
              type="number" min={0} inputMode="numeric" value={scoreB}
              onChange={(e) => setScoreB(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </div>
        </div>

        {err && (
          <p style={{ fontSize: 12, color: "#dc2626", margin: "0 0 12px", textAlign: "center", background: "#fef2f2", padding: "8px 12px", borderRadius: 8 }}>{err}</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: "100%", background: saving ? O.border : O.primary,
            color: saving ? O.textMuted : "#fff",
            border: "none", borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 900,
            cursor: saving ? "default" : "pointer",
            boxShadow: saving ? "none" : `0 4px 20px ${O.primaryGlow}`,
            transition: "all 0.15s",
            letterSpacing: "-0.01em",
          }}
        >
          {saving ? "Saving…" : "Save Score"}
        </button>
      </div>
    </div>
  );
}

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
    <div style={{
      background: O.surface,
      borderRadius: 16,
      padding: "12px 14px",
      border: isLive ? `2px solid ${O.primaryBright}` : `1px solid ${O.border}`,
      marginBottom: 8,
      boxShadow: isLive
        ? `0 0 0 0 ${O.primaryGlow}, 0 6px 24px ${O.primaryDim}`
        : "0 1px 4px rgba(0,0,0,0.04)",
      animation: `qs-rise 280ms ${animationDelay}ms ease both${isLive ? ", qs-pulse 2.5s 700ms ease-in-out infinite" : ""}`,
      transition: "box-shadow 0.2s, border-color 0.2s",
    }}>
      <div style={{ fontSize: 9, color: isLive ? O.primary : O.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
        {isLive ? "🔥 " : ""}Court {match.courtId.replace("court-", "")}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, textAlign: "center", lineHeight: 1.2 }}>
          {score && winner === "a" && <div style={{ fontSize: 9, color: O.primary, fontWeight: 800, marginBottom: 3, letterSpacing: "0.08em" }}>WINNER 🏆</div>}
          <div style={{ fontSize: score ? (winner === "a" ? 14 : 12) : 13, fontWeight: score ? (winner === "a" ? 900 : 500) : 700, color: score ? (winner === "a" ? O.textPrimary : O.borderStrong) : O.textPrimary, opacity: score && winner !== null && winner !== "a" ? 0.55 : 1, transition: "all 0.3s" }}>
            {teamA}
          </div>
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
          {(["a", "b"] as const).map((side, i) => {
            const s = side === "a" ? score?.teamAScore : score?.teamBScore;
            const isWinner = winner === side;
            return (
              <div key={side} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                {i === 1 && <span style={{ fontSize: 11, color: O.borderStrong, fontWeight: 700 }}>–</span>}
                <div style={{
                  background: score ? (isWinner ? O.primary : O.tag) : O.tag,
                  border: score
                    ? (isWinner ? "none" : `1px solid ${O.border}`)
                    : isLive ? `2px dashed ${O.primaryBright}` : `1px dashed ${O.border}`,
                  borderRadius: 8,
                  padding: isWinner ? "8px 14px" : "6px 10px",
                  fontSize: score ? (isWinner ? 26 : 16) : 18, fontWeight: 900,
                  color: score ? (isWinner ? "#fff" : O.borderStrong) : O.borderStrong,
                  minWidth: 38, textAlign: "center",
                  boxShadow: isWinner ? `0 4px 12px ${O.primaryGlow}` : "none",
                  transition: "all 0.3s",
                }}>
                  {s !== undefined ? s : "—"}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ flex: 1, textAlign: "center", lineHeight: 1.2 }}>
          {score && winner === "b" && <div style={{ fontSize: 9, color: O.primary, fontWeight: 800, marginBottom: 3, letterSpacing: "0.08em" }}>WINNER 🏆</div>}
          <div style={{ fontSize: score ? (winner === "b" ? 14 : 12) : 13, fontWeight: score ? (winner === "b" ? 900 : 500) : 700, color: score ? (winner === "b" ? O.textPrimary : O.borderStrong) : O.textPrimary, opacity: score && winner !== null && winner !== "b" ? 0.55 : 1, transition: "all 0.3s" }}>
            {teamB}
          </div>
        </div>
      </div>

      {isLive && !score && (
        <button onClick={onTap} style={{
          marginTop: 12, width: "100%",
          background: O.primary, color: "#fff",
          border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 800,
          cursor: "pointer", boxShadow: `0 3px 12px ${O.primaryGlow}`,
          letterSpacing: "0.01em",
        }}>
          Enter score →
        </button>
      )}
      {isDone && (
        <button onClick={onTap} style={{
          marginTop: 6, width: "100%",
          background: "none", border: "none", color: O.borderStrong,
          fontSize: 11, cursor: "pointer", padding: "4px 0",
        }}>
          Edit score
        </button>
      )}
    </div>
  );
}

function SessionLeaderboard({ session }: { session: QuickSession }) {
  const rows = computeSessionLeaderboard(session);
  const hasScores = Object.keys(session.scores ?? {}).length > 0;
  const MEDAL = ["🥇", "🥈", "🥉"];

  return (
    <div style={{
      background: O.surface, borderRadius: 16,
      border: `1.5px solid ${O.borderStrong}`,
      boxShadow: `0 2px 12px ${O.primaryGlow}`,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ background: O.headerBg, padding: "12px 16px" }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 15, color: "#fff", letterSpacing: "-0.01em" }}>
          🏆 Session Standings
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
          {hasScores ? "Based on scored matches" : "Scores will appear after the first match"}
        </div>
      </div>

      {!hasScores ? (
        <div style={{ padding: "24px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
          <div style={{ fontSize: 13, color: O.textMuted }}>No scores yet — enter one to see the leaderboard.</div>
        </div>
      ) : (
        <div style={{ padding: "8px 0" }}>
          {/* Column header */}
          <div style={{
            display: "grid", gridTemplateColumns: "28px 1fr 32px 32px 32px 44px",
            gap: 4, padding: "4px 12px 6px", alignItems: "center",
          }}>
            {["", "Player", "G", "W", "L", "Win%"].map((h) => (
              <div key={h} style={{ fontSize: 9, color: O.textMuted, fontFamily: "var(--font-mono)", fontWeight: 700, textAlign: h === "Player" ? "left" : "center", textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</div>
            ))}
          </div>

          {rows.map((row, idx) => {
            const isTop = idx === 0 && row.games > 0;
            return (
              <div key={row.playerId} style={{
                display: "grid", gridTemplateColumns: "28px 1fr 32px 32px 32px 44px",
                gap: 4, padding: "7px 12px", alignItems: "center",
                background: isTop ? O.tag : "transparent",
                borderTop: idx > 0 ? `1px solid ${O.border}` : "none",
              }}>
                <div style={{ fontSize: 14, textAlign: "center" }}>
                  {row.games > 0 && idx < 3 ? MEDAL[idx] : <span style={{ fontSize: 10, color: O.borderStrong, fontFamily: "var(--font-mono)", fontWeight: 700 }}>{idx + 1}</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: isTop ? 800 : 600, color: O.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.name}
                  {row.sitOuts > 0 && (
                    <span style={{ fontSize: 9, color: O.borderStrong, marginLeft: 4, fontFamily: "var(--font-mono)" }}>({row.sitOuts}×sit)</span>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: O.textSecondary, textAlign: "center" }}>{row.games || "—"}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: row.wins > 0 ? "#15803D" : O.borderStrong, textAlign: "center" }}>{row.games > 0 ? row.wins : "—"}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: row.losses > 0 ? "#DC2626" : O.borderStrong, textAlign: "center" }}>{row.games > 0 ? row.losses : "—"}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: isTop ? O.primary : O.textSecondary, textAlign: "center", fontFamily: "var(--font-mono)" }}>
                  {row.games > 0 ? `${Math.round(row.winPct)}%` : "—"}
                </div>
              </div>
            );
          })}
        </div>
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
  const { user } = useAuth();
  const [finishing, setFinishing] = useState(false);
  const finished = session?.statsCommitted ?? false;
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [removingRound, setRemovingRound] = useState<number | null>(null);
  // Edit panel state
  const [editOpen, setEditOpen] = useState(false);
  const [editPlayers, setEditPlayers] = useState<QuickPlayer[]>([]);
  const [targetRounds, setTargetRounds] = useState(1);
  const [addName, setAddName] = useState("");
  const [addSkill, setAddSkill] = useState<SkillLevel>("unknown");
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [activeEditRound, setActiveEditRound] = useState<number | null>(null);
  const [regenPromptRound, setRegenPromptRound] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"rounds" | "leaderboard">("rounds");

  async function handleFinish() {
    if (!session || !user) return;
    setFinishing(true);
    try {
      await commitSessionStats(session, user.uid);
      const updated: QuickSession = { ...session, statsCommitted: true };
      setSession(updated);
      updateSessionInStorage(sessionId, () => updated);
    } catch { /* non-fatal — user can retry */ }
    finally { setFinishing(false); }
  }

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

  async function handleRemoveRound(roundNumber: number) {
    if (!session) return;
    setRemovingRound(roundNumber);
    try {
      const newMatches = session.matches.filter((m) => m.roundNumber !== roundNumber);
      const newSitOuts = session.sitOuts.filter((s) => s.roundNumber !== roundNumber);
      const updated: QuickSession = { ...session, matches: newMatches, sitOuts: newSitOuts };
      setSession(updated);
      updateSessionInStorage(sessionId, () => updated);
      await updateSessionMatchesToFirestore(sessionId, newMatches, newSitOuts);
      if (newMatches.filter((m) => roundBadgeForRound(m.roundNumber, newMatches, session.scores) === "up_next").length === 0) {
        setShowUpcoming(false);
      }
    } finally {
      setRemovingRound(null);
    }
  }

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

  function roundBadgeForRound(
    roundNumber: number,
    matches: QuickSession["matches"],
    scores: QuickSession["scores"]
  ): "done" | "playing" | "up_next" {
    const states = computeMatchStates(matches, scores, session?.courts ?? 1);
    const roundMatches = matches.filter((m) => m.roundNumber === roundNumber);
    const s = roundMatches.map((m) => states.get(computeMatchKey(m.roundNumber, m.courtId)));
    if (s.every((x) => x === "done")) return "done";
    if (s.some((x) => x === "live")) return "playing";
    return "up_next";
  }

  // Players who have appeared in any scored match — can't be removed
  const playersWithScoredMatches = new Set<string>();
  if (session) {
    session.matches.forEach((m) => {
      if (session.scores[computeMatchKey(m.roundNumber, m.courtId)]) {
        m.teamA.forEach((id) => playersWithScoredMatches.add(id));
        m.teamB.forEach((id) => playersWithScoredMatches.add(id));
      }
    });
  }

  function openEditPanel() {
    if (!session) return;
    const upcoming = roundNumbers.filter((rn) =>
      roundBadge(session.matches.filter((m) => m.roundNumber === rn)) === "up_next"
    );
    setEditPlayers([...session.players]);
    setTargetRounds(upcoming.length > 0 ? upcoming.length : 3);
    setAddName("");
    setAddSkill("unknown");
    setRegenError(null);
    setEditOpen(true);
  }

  async function handleRegenerate() {
    if (!session) return;
    if (editPlayers.length < 4) { setRegenError("Need at least 4 players."); return; }
    if (targetRounds < 1) { setRegenError("Need at least 1 round."); return; }
    setRegenerating(true);
    setRegenError(null);
    try {
      // Lock done + live matches
      const lockedMatches = session.matches.filter((m) => {
        const s = matchStates.get(computeMatchKey(m.roundNumber, m.courtId));
        return s === "done" || s === "live";
      });
      const elapsedRounds = lockedMatches.length > 0
        ? Math.max(...lockedMatches.map((m) => m.roundNumber))
        : 0;

      const input = buildEngineInputForRebalance(editPlayers, session.courts, lockedMatches, elapsedRounds, targetRounds);
      const output = generateSchedule(input);

      const lockedRoundNums = new Set(lockedMatches.map((m) => m.roundNumber));
      const lockedSitOuts = session.sitOuts.filter((s) => lockedRoundNums.has(s.roundNumber));

      const newMatches = [...lockedMatches, ...output.matches];
      const newSitOuts = [...lockedSitOuts, ...output.sitOuts];

      const updated: QuickSession = { ...session, players: editPlayers, matches: newMatches, sitOuts: newSitOuts };
      setSession(updated);
      updateSessionInStorage(sessionId, () => updated);
      await applySessionRebalanceToFirestore(sessionId, editPlayers, newMatches, newSitOuts);

      // Persist any brand-new players to the roster
      if (user) {
        const newOnes = editPlayers.filter((p) => !session.players.find((old) => old.id === p.id));
        if (newOnes.length > 0) await upsertAllRosterPlayers(user.uid, newOnes);
      }

      setEditOpen(false);
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Regeneration failed.");
    } finally {
      setRegenerating(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", background: O.bg, display: "grid", placeItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: O.primary, display: "grid", placeItems: "center", animation: "qs-bounce 1s ease-in-out infinite" }}>
            <span style={{ fontSize: 20 }}>🏸</span>
          </div>
          <span style={{ fontSize: 12, color: O.textMuted, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Loading…</span>
        </div>
      </div>
    );
  }

  if (notFound || !session) {
    return (
      <div style={{ minHeight: "100dvh", background: O.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <p style={{ color: "#dc2626", fontSize: 15, fontWeight: 700, margin: 0 }}>Session not found.</p>
        <a href="/quick" style={{ color: O.primary, fontSize: 14, textDecoration: "none", fontWeight: 700 }}>Start a new session →</a>
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
    <>
      <style>{`
        @keyframes qs-rise {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes qs-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(234,88,12,0.45), 0 6px 24px rgba(234,88,12,0.12); }
          50%       { box-shadow: 0 0 0 8px rgba(234,88,12,0), 0 6px 24px rgba(234,88,12,0.06); }
        }
        @keyframes qs-sheet-up {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes qs-bounce {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
        @keyframes qs-pop {
          0%   { transform: scale(0.8); opacity: 0; }
          65%  { transform: scale(1.06); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes qs-float {
          0%, 100% { transform: translateY(0px); }
          50%      { transform: translateY(-5px); }
        }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .qs-tab-bar {
          display: flex; gap: 6px; padding: 10px 16px 0;
          background: ${O.headerBg};
        }
        .qs-tab-btn {
          flex: 1; padding: 8px 0; border: none; border-radius: 10px 10px 0 0;
          font-size: 13px; font-weight: 800; cursor: pointer;
          transition: background 0.15s, color 0.15s;
          font-family: var(--font-display); letter-spacing: -0.01em;
        }
        .qs-tab-btn-active { background: ${O.bg}; color: ${O.primary}; }
        .qs-tab-btn-inactive { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); }
        .qs-session-body {
          display: flex; flex-direction: column; width: 100%;
        }
        .qs-rounds-col {
          flex: 1; padding: 14px 16px; display: flex; flex-direction: column;
          gap: 14px; max-width: 640px; margin: 0 auto; width: 100%; box-sizing: border-box;
        }
        .qs-leaderboard-col { display: none; }
        .qs-mobile-hidden { display: none !important; }
        @media (min-width: 768px) {
          .qs-tab-bar { display: none; }
          .qs-session-body {
            flex-direction: row; align-items: flex-start; gap: 20px;
            max-width: 1100px; margin: 0 auto; width: 100%;
            padding: 16px 20px; box-sizing: border-box;
          }
          .qs-rounds-col {
            flex: 1; min-width: 0; max-width: none; margin: 0; padding: 0;
          }
          .qs-leaderboard-col {
            display: block; width: 320px; flex-shrink: 0;
            position: sticky; top: 16px;
            align-self: flex-start;
            max-height: calc(100dvh - 120px); overflow-y: auto;
          }
          .qs-mobile-hidden { display: block !important; }
        }
      `}</style>

      <div style={{
        minHeight: "100dvh",
        background: `
          radial-gradient(ellipse 100% 35% at 50% 0%, rgba(251,146,60,0.22) 0%, transparent 70%),
          repeating-linear-gradient(45deg,  rgba(234,88,12,0.04) 0 1px, transparent 1px 20px),
          repeating-linear-gradient(-45deg, rgba(234,88,12,0.04) 0 1px, transparent 1px 20px),
          ${O.bg}
        `,
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          background: O.headerBg,
          padding: "14px 20px",
          animation: "qs-rise 300ms ease both",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a href="/quick" style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, textDecoration: "none", fontWeight: 700, flexShrink: 0 }}>← Hub</a>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 16, color: "#fff", letterSpacing: "-0.01em" }}>
              {session.name}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "var(--font-mono)" }}>
              {session.players.length} players · {session.courts} courts · {roundNumbers.length} rounds
            </span>
            {!finished && (
              <button onClick={openEditPanel} style={{ background: "rgba(234,88,12,0.22)", border: `1px solid rgba(234,88,12,0.4)`, borderRadius: 8, padding: "3px 10px", fontSize: 11, color: O.primaryBright, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-mono)" }}>
                ✏️ Edit
              </button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "var(--font-mono)" }}>
                {doneCount}/{totalMatches}
              </span>
              <span style={{ fontSize: 10, color: O.primary, background: "rgba(234,88,12,0.18)", border: `1px solid rgba(234,88,12,0.4)`, borderRadius: 6, padding: "2px 8px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                {sessionId}
              </span>
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ marginTop: 10, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 2,
              background: `linear-gradient(90deg, ${O.primaryBright}, #FBBF24)`,
              width: `${totalMatches > 0 ? (doneCount / totalMatches) * 100 : 0}%`,
              transition: "width 0.5s ease",
            }} />
          </div>
        </div>

        {/* Tab bar — mobile only, hidden on tablet via CSS */}
        <div className="qs-tab-bar">
          <button
            className={`qs-tab-btn ${activeTab === "rounds" ? "qs-tab-btn-active" : "qs-tab-btn-inactive"}`}
            onClick={() => setActiveTab("rounds")}
          >
            🏸 Rounds
          </button>
          <button
            className={`qs-tab-btn ${activeTab === "leaderboard" ? "qs-tab-btn-active" : "qs-tab-btn-inactive"}`}
            onClick={() => setActiveTab("leaderboard")}
          >
            🏆 Leaderboard
          </button>
        </div>

        <div className="qs-session-body">
          <div className={`qs-rounds-col${activeTab === "leaderboard" ? " qs-mobile-hidden" : ""}`}>
          {/* Active rounds (done + live) — skip up_next entirely */}
          {roundNumbers.filter((rn) => roundBadge(session.matches.filter((m) => m.roundNumber === rn)) !== "up_next").map((roundNumber) => {
            const roundMatches = session.matches.filter((m) => m.roundNumber === roundNumber);
            const roundSitOuts = session.sitOuts.filter((s) => s.roundNumber === roundNumber);
            const badge = roundBadge(roundMatches);

            return (
              <div key={roundNumber}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 9, color: O.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--font-mono)", fontWeight: 700 }}>Round {roundNumber}</span>
                  <div style={{ height: 1, flex: 1, background: O.border }} />
                  {badge === "done" && <span style={{ fontSize: 9, color: O.green, background: O.greenBg, border: `1px solid ${O.greenBorder}`, borderRadius: 99, padding: "2px 10px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>✓ Done</span>}
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
                  <p style={{ fontSize: 11, color: O.borderStrong, margin: "4px 0 0", paddingLeft: 4, fontStyle: "italic" }}>
                    Sitting out: {roundSitOuts.map((s) => playerNames[s.playerId] ?? s.playerId).join(", ")}
                  </p>
                )}
              </div>
            );
          })}

          {/* Upcoming rounds strip — collapsed by default, editable */}
          {(() => {
            const upcomingRounds = roundNumbers.filter((rn) =>
              roundBadge(session.matches.filter((m) => m.roundNumber === rn)) === "up_next"
            );
            if (upcomingRounds.length === 0 || allDone) return null;
            return (
              <div style={{ borderRadius: 14, border: `1px dashed ${O.border}`, overflow: "hidden" }}>
                {/* Header row */}
                <button
                  onClick={() => setShowUpcoming((v) => !v)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", background: "none", border: "none", cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 12, color: O.textMuted, fontWeight: 700 }}>
                    📅 {upcomingRounds.length} round{upcomingRounds.length !== 1 ? "s" : ""} queued
                  </span>
                  <span style={{ fontSize: 11, color: O.borderStrong, fontFamily: "var(--font-mono)" }}>
                    {showUpcoming ? "▲ hide" : "▼ edit"}
                  </span>
                </button>

                {/* Expanded list */}
                {showUpcoming && (
                  <div style={{ borderTop: `1px dashed ${O.border}`, padding: "8px 0" }}>
                    {upcomingRounds.map((rn) => {
                      const rMatches = session.matches.filter((m) => m.roundNumber === rn);
                      const rSitOuts = session.sitOuts.filter((s) => s.roundNumber === rn);
                      const courts = rMatches.map((m) => `Court ${m.courtId.replace("court-", "")}`).join(", ");
                      const isRemoving = removingRound === rn;
                      return (
                        <div key={rn} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 14px" }}>
                          <div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: O.textSecondary }}>Round {rn}</span>
                            <span style={{ fontSize: 11, color: O.borderStrong, marginLeft: 8 }}>{courts}</span>
                            {rSitOuts.length > 0 && (
                              <span style={{ fontSize: 11, color: O.borderStrong, marginLeft: 6, fontStyle: "italic" }}>
                                · sit-out: {rSitOuts.map((s) => playerNames[s.playerId] ?? s.playerId).join(", ")}
                              </span>
                            )}
                          </div>
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Edit session panel ── */}
          {editOpen && !finished && (
            <div style={{
              background: O.surface, borderRadius: 20, border: `1.5px solid ${O.borderStrong}`,
              boxShadow: `0 4px 24px ${O.primaryGlow}`,
              animation: "qs-rise 250ms ease both", overflow: "hidden",
            }}>
              {/* Panel header */}
              <div style={{ background: O.headerBg, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>✏️ Edit Session</span>
                <button onClick={() => setEditOpen(false)} style={{ background: "rgba(255,255,255,0.12)", border: "none", borderRadius: "50%", width: 28, height: 28, color: "#fff", cursor: "pointer", fontSize: 14, display: "grid", placeItems: "center" }}>✕</button>
              </div>

              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Players */}
                <div>
                  <div style={{ fontSize: 9, color: O.primary, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--font-mono)", fontWeight: 700, marginBottom: 10 }}>Players</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    {editPlayers.map((p) => {
                      const locked = playersWithScoredMatches.has(p.id);
                      return (
                        <span key={p.id} style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          background: locked ? "#F3F4F6" : O.tag,
                          border: `1px solid ${locked ? "#D1D5DB" : O.borderStrong}`,
                          borderRadius: 99, padding: "5px 10px 5px 12px",
                          fontSize: 13, color: locked ? "#9CA3AF" : O.textPrimary, fontWeight: 700,
                        }}>
                          {p.name}
                          {locked
                            ? <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 2 }} title="Has scored matches">🔒</span>
                            : <button onClick={() => setEditPlayers((prev) => prev.filter((x) => x.id !== p.id))} style={{ background: "none", border: "none", color: O.borderStrong, cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>✕</button>
                          }
                        </span>
                      );
                    })}
                  </div>
                  {/* Add player row */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && addName.trim()) {
                          setEditPlayers((prev) => [...prev, { id: crypto.randomUUID(), name: addName.trim(), skillLevel: addSkill }]);
                          setAddName("");
                        }
                      }}
                      placeholder="New player…"
                      style={{ flex: 1, padding: "9px 12px", background: O.tag, border: `1.5px solid ${O.border}`, borderRadius: 10, fontSize: 14, color: O.textPrimary, outline: "none", boxSizing: "border-box" }}
                    />
                    <select
                      value={addSkill}
                      onChange={(e) => setAddSkill(e.target.value as SkillLevel)}
                      style={{ width: 110, padding: "9px 8px", background: O.tag, border: `1.5px solid ${O.border}`, borderRadius: 10, fontSize: 13, color: O.textPrimary, outline: "none" }}
                    >
                      {(["unknown", "beginner", "intermediate", "advanced"] as const).map((s) => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        if (!addName.trim()) return;
                        setEditPlayers((prev) => [...prev, { id: crypto.randomUUID(), name: addName.trim(), skillLevel: addSkill }]);
                        setAddName("");
                      }}
                      disabled={!addName.trim()}
                      style={{
                        flexShrink: 0, padding: "0 16px", borderRadius: 10, fontSize: 14, fontWeight: 800,
                        background: addName.trim() ? O.primary : O.tag,
                        color: addName.trim() ? "#fff" : O.borderStrong,
                        border: addName.trim() ? "none" : `1.5px solid ${O.border}`,
                        cursor: addName.trim() ? "pointer" : "default",
                        boxShadow: addName.trim() ? `0 2px 8px ${O.primaryGlow}` : "none",
                      }}
                    >Add</button>
                  </div>
                </div>

                {/* Upcoming rounds count */}
                <div>
                  <div style={{ fontSize: 9, color: O.primary, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--font-mono)", fontWeight: 700, marginBottom: 10 }}>Rounds to generate</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={() => setTargetRounds((v) => Math.max(1, v - 1))} style={{ width: 38, height: 38, borderRadius: 10, fontSize: 20, fontWeight: 900, background: O.tag, border: `1.5px solid ${O.border}`, color: O.primary, cursor: "pointer", padding: 0 }}>−</button>
                    <div style={{ background: O.tag, border: `1.5px solid ${O.border}`, borderRadius: 10, padding: "8px 0", fontSize: 16, fontWeight: 800, color: O.textPrimary, width: 60, textAlign: "center" }}>{targetRounds}</div>
                    <button onClick={() => setTargetRounds((v) => Math.min(10, v + 1))} style={{ width: 38, height: 38, borderRadius: 10, fontSize: 20, fontWeight: 900, background: O.primary, border: "none", color: "#fff", cursor: "pointer", padding: 0, boxShadow: `0 2px 8px ${O.primaryGlow}` }}>+</button>
                    <span style={{ fontSize: 12, color: O.textMuted, marginLeft: 4 }}>upcoming round{targetRounds !== 1 ? "s" : ""}</span>
                  </div>
                </div>

                {regenError && (
                  <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "8px 12px", fontSize: 13, color: "#dc2626" }}>{regenError}</div>
                )}

                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  style={{
                    padding: "14px 0", fontSize: 15, fontWeight: 900, borderRadius: 14,
                    border: "none", cursor: regenerating ? "default" : "pointer",
                    background: regenerating ? O.border : O.primary,
                    color: regenerating ? O.textMuted : "#fff",
                    boxShadow: regenerating ? "none" : `0 4px 18px ${O.primaryGlow}`,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {regenerating ? "Regenerating…" : `Regenerate ${targetRounds} upcoming round${targetRounds !== 1 ? "s" : ""} →`}
                </button>
              </div>
            </div>
          )}

          {allDone && (
            <div style={{ textAlign: "center", padding: "32px 16px", animation: "qs-pop 500ms ease both" }}>
              <div style={{ fontSize: 48, marginBottom: 12, display: "inline-block", animation: "qs-float 3s ease-in-out infinite" }}>🏆</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 20, color: O.textPrimary, marginBottom: 6 }}>Session complete!</div>
              {!finished ? (
                <>
                  <p style={{ color: O.textMuted, fontSize: 13, margin: "0 0 20px", lineHeight: 1.5 }}>
                    Save results to carry fairness into your next session.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 300, margin: "0 auto" }}>
                    <button onClick={handleFinish} disabled={finishing} style={{
                      background: finishing ? O.border : O.primary, color: finishing ? O.textMuted : "#fff",
                      border: "none", borderRadius: 14, padding: 16, fontSize: 15, fontWeight: 900,
                      cursor: finishing ? "default" : "pointer",
                      boxShadow: finishing ? "none" : `0 4px 20px ${O.primaryGlow}`,
                    }}>
                      {finishing ? "Saving…" : "Finish & save results"}
                    </button>
                    <a href="/quick" style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: O.tag, color: O.textSecondary,
                      border: `1px solid ${O.border}`, borderRadius: 14, padding: 13,
                      fontSize: 14, fontWeight: 700, textDecoration: "none",
                    }}>
                      Skip → new session
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ color: O.textMuted, fontSize: 13, margin: "0 0 20px" }}>Roster updated. See you next game!</p>
                  <a href="/quick" style={{
                    display: "inline-flex", alignItems: "center",
                    background: O.primary, color: "#fff",
                    border: "none", borderRadius: 99, padding: "12px 28px",
                    fontSize: 14, fontWeight: 800, textDecoration: "none",
                    boxShadow: `0 4px 16px ${O.primaryGlow}`,
                  }}>
                    New session →
                  </a>
                </>
              )}
            </div>
          )}
          </div>{/* /qs-rounds-col */}

          <div className={`qs-leaderboard-col${activeTab === "rounds" ? " qs-mobile-hidden" : ""}`}>
            <SessionLeaderboard session={session} />
          </div>
        </div>{/* /qs-session-body */}

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
    </>
  );
}
