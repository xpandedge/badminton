// apps/web/src/app/quick/new/page.tsx
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

const O = {
  bg: "#FFF7ED", surface: "#FFFFFF", border: "#FED7AA", borderStrong: "#FDBA74",
  primary: "#EA580C", primaryGlow: "rgba(234,88,12,0.35)", primaryDim: "rgba(234,88,12,0.1)",
  textPrimary: "#431407", textSecondary: "#9A3412", textMuted: "#C2410C",
  tag: "#FFEDD5", headerBg: "#431407",
} as const;

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        style={{ width: 40, height: 40, padding: 0, borderRadius: 10, fontSize: 20, fontWeight: 900, background: O.tag, border: `1.5px solid ${O.border}`, color: O.primary, cursor: "pointer" }}
      >
        −
      </button>
      <div style={{ background: O.tag, border: `1.5px solid ${O.border}`, borderRadius: 10, padding: "8px 0", fontSize: 16, fontWeight: 800, color: O.textPrimary, flex: 1, textAlign: "center" }}>
        {value}
      </div>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        style={{ width: 40, height: 40, padding: 0, borderRadius: 10, fontSize: 20, fontWeight: 900, background: O.primary, border: "none", color: "#fff", cursor: "pointer", boxShadow: `0 2px 8px ${O.primaryGlow}` }}
      >
        +
      </button>
    </div>
  );
}

export default function NewQuickSessionPage() {
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

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", boxSizing: "border-box",
    background: O.tag, border: `1.5px solid ${O.border}`, borderRadius: 12,
    fontSize: 14, color: O.textPrimary, outline: "none",
  };

  return (
    <>
      <style>{`
        @keyframes qs-rise {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes qs-pop {
          0%   { transform: scale(0.8); opacity: 0; }
          65%  { transform: scale(1.06); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div style={{
        minHeight: "100dvh",
        background: `
          radial-gradient(ellipse 100% 30% at 50% 0%, rgba(251,146,60,0.2) 0%, transparent 70%),
          repeating-linear-gradient(45deg,  rgba(234,88,12,0.04) 0 1px, transparent 1px 20px),
          repeating-linear-gradient(-45deg, rgba(234,88,12,0.04) 0 1px, transparent 1px 20px),
          ${O.bg}
        `,
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{ background: O.headerBg, padding: "14px 20px", animation: "qs-rise 300ms ease both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a href="/quick" style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, textDecoration: "none", fontWeight: 700, flexShrink: 0 }}>← Hub</a>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: O.primary, display: "grid", placeItems: "center", flexShrink: 0, boxShadow: `0 2px 10px ${O.primaryGlow}` }}>
              <span style={{ fontSize: 18 }}>🏸</span>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 15, color: "#fff", letterSpacing: "-0.01em" }}>New Session</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "var(--font-mono)" }}>casual · fairness-aware</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, padding: "16px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 640, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>

          {/* Session config */}
          <div style={{ background: O.surface, borderRadius: 20, padding: 18, border: `1px solid ${O.border}`, boxShadow: "0 2px 12px rgba(234,88,12,0.06)", animation: "qs-rise 350ms 50ms ease both" }}>
            <div style={{ fontSize: 9, color: O.primary, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 14, fontFamily: "var(--font-mono)", fontWeight: 700 }}>Setup</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: 11, color: O.textSecondary, marginBottom: 5, fontWeight: 600 }}>Session name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Quick Session" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, color: O.textSecondary, marginBottom: 5, fontWeight: 600 }}>Courts</label>
                <Stepper value={courts} min={1} max={8} onChange={setCourts} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, color: O.textSecondary, marginBottom: 5, fontWeight: 600 }}>Rounds</label>
                <Stepper value={rounds} min={1} max={10} onChange={setRounds} />
              </div>
            </div>
          </div>

          {/* Players */}
          <div style={{ background: O.surface, borderRadius: 20, padding: 18, border: `1px solid ${O.border}`, boxShadow: "0 2px 12px rgba(234,88,12,0.06)", animation: "qs-rise 350ms 100ms ease both" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: O.primary, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--font-mono)", fontWeight: 700 }}>Players</div>
              <span style={{ fontSize: 12, color: O.textMuted }}>{players.length} selected</span>
            </div>

            {!rosterLoading && rosterNotInSession.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: O.borderStrong, marginBottom: 6, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Your roster</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {rosterNotInSession.map((rp) => (
                    <button key={rp.id} onClick={() => toggleRosterPlayer(rp)} style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      background: O.tag, border: `1px solid ${O.border}`,
                      borderRadius: 99, padding: "5px 12px",
                      fontSize: 13, color: O.textSecondary, fontWeight: 600, cursor: "pointer",
                    }}>
                      + {rp.name}
                      {rp.stats.totalGames > 0 && (
                        <span style={{ fontSize: 10, color: O.borderStrong, fontFamily: "var(--font-mono)" }}>{rp.stats.totalGames}g</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {players.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {players.map((p, i) => (
                  <span key={p.id} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: O.tag, border: `1px solid ${O.borderStrong}`,
                    borderRadius: 99, padding: "5px 10px 5px 12px",
                    fontSize: 13, color: O.textPrimary, fontWeight: 700,
                    animation: `qs-pop 250ms ${i * 30}ms ease both`,
                  }}>
                    {p.name}
                    <button onClick={() => removePlayer(p.id)} style={{ background: "none", border: "none", color: O.borderStrong, cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }} aria-label={`Remove ${p.name}`}>✕</button>
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                placeholder="New player name…"
                style={{ ...inputStyle, flex: 1 }}
              />
              <select
                value={playerSkill}
                onChange={(e) => setPlayerSkill(e.target.value as QuickPlayer["skillLevel"])}
                style={{ ...inputStyle, width: 116, flex: "none", padding: "10px 8px" }}
              >
                {SKILL_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
              <button
                onClick={addPlayer}
                disabled={!playerName.trim()}
                style={{
                  flexShrink: 0, width: "auto", padding: "0 20px",
                  background: playerName.trim() ? O.primary : O.tag,
                  color: playerName.trim() ? "#fff" : O.borderStrong,
                  border: playerName.trim() ? "none" : `1.5px solid ${O.border}`,
                  borderRadius: 12, fontSize: 14, fontWeight: 800,
                  cursor: playerName.trim() ? "pointer" : "default",
                  boxShadow: playerName.trim() ? `0 2px 10px ${O.primaryGlow}` : "none",
                  transition: "all 0.15s",
                }}
              >
                Add
              </button>
            </div>

            {players.length === 0 && !rosterLoading && roster.length === 0 && (
              <p style={{ fontSize: 13, color: O.borderStrong, margin: "10px 0 0", fontStyle: "italic" }}>Add at least 4 players to start.</p>
            )}
          </div>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#dc2626" }}>{error}</div>
          )}

          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            style={{
              padding: 18, fontSize: 16, fontWeight: 900, borderRadius: 16,
              border: "none", cursor: canGenerate ? "pointer" : "default",
              background: canGenerate ? O.primary : O.tag,
              color: canGenerate ? "#fff" : O.borderStrong,
              boxShadow: canGenerate ? `0 4px 24px ${O.primaryGlow}` : "none",
              letterSpacing: "-0.01em", transition: "all 0.15s",
              animation: "qs-rise 350ms 150ms ease both",
            }}
          >
            {generating ? "Generating…" : `Generate ${rounds} Round${rounds !== 1 ? "s" : ""} →`}
          </button>

          {need > 0 && (
            <p style={{ textAlign: "center", fontSize: 11, color: O.borderStrong, margin: 0, fontFamily: "var(--font-mono)" }}>
              {need} more player{need !== 1 ? "s" : ""} needed
            </p>
          )}
        </div>
      </div>
    </>
  );
}
