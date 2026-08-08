// apps/web/src/app/quick/players/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import { loadRoster } from "@/lib/quick-sessions/roster";
import type { RosterPlayer } from "@/lib/quick-sessions/types";

const O = {
  bg: "#FFF7ED", surface: "#FFFFFF", border: "#FED7AA", borderStrong: "#FDBA74",
  primary: "#EA580C", primaryGlow: "rgba(234,88,12,0.35)",
  textPrimary: "#431407", textSecondary: "#9A3412", textMuted: "#C2410C",
  tag: "#FFEDD5", headerBg: "#431407",
} as const;

const SKILL_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  advanced:     { bg: "#FFF1F2", color: "#BE123C", border: "#FECDD3" },
  intermediate: { bg: "#FFFBEB", color: "#B45309", border: "#FDE68A" },
  beginner:     { bg: "#F0FDF4", color: "#15803D", border: "#BBF7D0" },
  unknown:      { bg: O.tag,     color: O.textMuted, border: O.border },
};

function formatLastPlayed(ts: number): string {
  if (!ts) return "Never";
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function PlayersPage() {
  const { user } = useAuth();
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadRoster(user.uid)
      .then((roster) => {
        const sorted = [...roster].sort((a, b) =>
          b.stats.totalGames - a.stats.totalGames || a.name.localeCompare(b.name)
        );
        setPlayers(sorted);
      })
      .catch(() => setError("Failed to load players. Check your connection."))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <>
      <style>{`
        @keyframes qs-rise {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .qs-list-content {
          flex: 1; padding: 16px; display: flex; flex-direction: column;
          gap: 10px; max-width: 640px; margin: 0 auto; width: 100%; box-sizing: border-box;
        }
        .qs-player-grid { display: contents; }
        @media (min-width: 768px) {
          .qs-list-content { max-width: 880px; padding: 20px 24px; gap: 0; }
          .qs-player-grid {
            display: grid; grid-template-columns: 1fr 1fr; gap: 14px; width: 100%;
          }
          .qs-player-card { padding: 18px 20px !important; }
          .qs-player-avatar { width: 42px !important; height: 42px !important; font-size: 18px !important; }
          .qs-player-name { font-size: 16px !important; }
        }
      `}</style>
      <div style={{
        minHeight: "100dvh",
        background: `
          radial-gradient(ellipse 100% 30% at 50% 0%, rgba(251,146,60,0.18) 0%, transparent 70%),
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
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 16, color: "#fff", letterSpacing: "-0.01em" }}>Players</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontFamily: "var(--font-mono)" }}>your roster</div>
            </div>
          </div>
        </div>

        <div className="qs-list-content">

          {loading && (
            <div style={{ textAlign: "center", padding: "40px 0", color: O.textMuted, fontSize: 13, fontFamily: "var(--font-mono)" }}>
              Loading…
            </div>
          )}

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#dc2626" }}>{error}</div>
          )}

          {!loading && players.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 16px" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🏅</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: O.textPrimary, marginBottom: 6 }}>No players yet</div>
              <div style={{ fontSize: 13, color: O.textMuted }}>Players appear here after your first session.</div>
              <a href="/quick/new" style={{
                display: "inline-block", marginTop: 16,
                background: O.primary, color: "#fff",
                padding: "10px 24px", borderRadius: 99,
                fontSize: 14, fontWeight: 800, textDecoration: "none",
                boxShadow: `0 4px 14px ${O.primaryGlow}`,
              }}>Start a session →</a>
            </div>
          )}

          <div className="qs-player-grid">
            {players.map((p, i) => {
              const skillStyle = SKILL_COLORS[p.skillLevel] ?? SKILL_COLORS.unknown!;
              return (
                <div key={p.id} className="qs-player-card" style={{
                  background: O.surface, borderRadius: 16, padding: "14px 16px",
                  border: `1px solid ${O.border}`,
                  boxShadow: "0 1px 6px rgba(234,88,12,0.05)",
                  animation: `qs-rise 280ms ${i * 35}ms ease both`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="qs-player-avatar" style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: O.tag, border: `2px solid ${O.borderStrong}`,
                        display: "grid", placeItems: "center",
                        fontSize: 16, fontWeight: 900, color: O.primary,
                      }}>
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="qs-player-name" style={{ fontWeight: 800, fontSize: 15, color: O.textPrimary }}>{p.name}</div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      background: skillStyle.bg, color: skillStyle.color, border: `1px solid ${skillStyle.border}`,
                      borderRadius: 99, padding: "3px 10px",
                    }}>
                      {p.skillLevel.charAt(0).toUpperCase() + p.skillLevel.slice(1)}
                    </span>
                  </div>

                  {/* Stats grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                    {[
                      { label: "Games", value: String(p.stats.totalGames) },
                      { label: "Sessions", value: String(p.stats.sessionsPlayed) },
                      { label: "Sit-outs", value: String(p.stats.totalSitOuts) },
                      { label: "Last played", value: formatLastPlayed(p.stats.lastPlayedAt) },
                    ].map(({ label, value }) => (
                      <div key={label} style={{
                        background: O.tag, borderRadius: 10, padding: "8px 4px",
                        textAlign: "center",
                      }}>
                        <div style={{ fontSize: label === "Last played" ? 11 : 18, fontWeight: 900, color: O.textPrimary, lineHeight: 1 }}>{value}</div>
                        <div style={{ fontSize: 9, color: O.textMuted, marginTop: 2, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
