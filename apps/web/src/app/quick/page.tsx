// apps/web/src/app/quick/page.tsx — hub dashboard
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import { loadRoster } from "@/lib/quick-sessions/roster";

const O = {
  bg: "#FFF7ED", surface: "#FFFFFF", border: "#FED7AA", borderStrong: "#FDBA74",
  primary: "#EA580C", primaryGlow: "rgba(234,88,12,0.35)", primaryDim: "rgba(234,88,12,0.1)",
  textPrimary: "#431407", textSecondary: "#9A3412", textMuted: "#C2410C",
  tag: "#FFEDD5", headerBg: "#431407",
} as const;

export default function QuickHubPage() {
  const { user } = useAuth();
  const [rosterCount, setRosterCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    loadRoster(user.uid).then((r) => setRosterCount(r.length));
  }, [user]);

  const displayName = user?.displayName ?? user?.email ?? "Player";

  return (
    <>
      <style>{`
        @keyframes qs-rise {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes qs-pop {
          0%   { transform: scale(0.92); opacity: 0; }
          65%  { transform: scale(1.03); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes qs-float {
          0%, 100% { transform: translateY(0px); }
          50%      { transform: translateY(-4px); }
        }
        .qs-hub-content {
          flex: 1; padding: 20px 16px; display: flex; flex-direction: column;
          gap: 16px; max-width: 480px; margin: 0 auto; width: 100%; box-sizing: border-box;
        }
        .qs-hub-secondary-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
        }
        @media (min-width: 768px) {
          .qs-hub-content { max-width: 680px; padding: 28px 24px; gap: 20px; }
          .qs-hub-primary-cta { padding: 28px 32px !important; }
          .qs-hub-primary-cta .qs-cta-icon { font-size: 40px !important; }
          .qs-hub-primary-cta .qs-cta-title { font-size: 26px !important; }
          .qs-hub-primary-cta .qs-cta-desc { font-size: 15px !important; }
          .qs-hub-secondary-grid { gap: 16px; }
          .qs-hub-secondary-card { padding: 22px 20px !important; }
          .qs-hub-secondary-card .qs-card-icon { font-size: 32px !important; margin-bottom: 12px !important; }
          .qs-hub-secondary-card .qs-card-title { font-size: 17px !important; }
          .qs-hub-secondary-card .qs-card-desc { font-size: 13px !important; }
        }
      `}</style>
      <div style={{
        minHeight: "100dvh",
        background: `
          radial-gradient(ellipse 100% 40% at 50% 0%, rgba(251,146,60,0.22) 0%, transparent 70%),
          repeating-linear-gradient(45deg,  rgba(234,88,12,0.04) 0 1px, transparent 1px 20px),
          repeating-linear-gradient(-45deg, rgba(234,88,12,0.04) 0 1px, transparent 1px 20px),
          ${O.bg}
        `,
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{ background: O.headerBg, padding: "16px 20px", animation: "qs-rise 300ms ease both" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 12,
                background: O.primary, display: "grid", placeItems: "center",
                flexShrink: 0, boxShadow: `0 2px 12px ${O.primaryGlow}`,
                animation: "qs-float 3s ease-in-out infinite",
              }}>
                <span style={{ fontSize: 20 }}>🏸</span>
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 17, color: "#fff", letterSpacing: "-0.01em" }}>
                  Quick Session
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontFamily: "var(--font-mono)" }}>
                  {displayName}
                </div>
              </div>
            </div>
            <a href="/" style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textDecoration: "none", fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>
              ← Home
            </a>
          </div>
        </div>

        <div className="qs-hub-content">

          {/* Roster stats strip */}
          {rosterCount !== null && (
            <div style={{
              background: O.surface, borderRadius: 14, padding: "10px 16px",
              border: `1px solid ${O.border}`,
              display: "flex", alignItems: "center", gap: 10,
              animation: "qs-rise 300ms 40ms ease both",
            }}>
              <span style={{ fontSize: 18 }}>👥</span>
              <span style={{ fontSize: 13, color: O.textSecondary, fontWeight: 600 }}>
                {rosterCount === 0 ? "No players yet — add some in New Session" : `${rosterCount} player${rosterCount !== 1 ? "s" : ""} in your roster`}
              </span>
            </div>
          )}

          {/* Primary action */}
          <a href="/quick/new" style={{ textDecoration: "none", animation: "qs-pop 350ms 60ms ease both", display: "block" }}>
            <div className="qs-hub-primary-cta" style={{
              background: O.primary,
              borderRadius: 20,
              padding: "22px 24px",
              boxShadow: `0 6px 28px ${O.primaryGlow}`,
              cursor: "pointer",
              transition: "transform 0.12s, box-shadow 0.12s",
            }}>
              <div className="qs-cta-icon" style={{ fontSize: 32, marginBottom: 8 }}>⚡</div>
              <div className="qs-cta-title" style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 22, color: "#fff", letterSpacing: "-0.01em", marginBottom: 4 }}>
                New Session
              </div>
              <div className="qs-cta-desc" style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                Pick players, set courts &amp; rounds, generate schedule
              </div>
            </div>
          </a>

          {/* Secondary actions */}
          <div className="qs-hub-secondary-grid" style={{ animation: "qs-pop 350ms 120ms ease both" }}>
            <a href="/quick/sessions" style={{ textDecoration: "none" }}>
              <div className="qs-hub-secondary-card" style={{
                background: O.surface, borderRadius: 16, padding: "18px 16px",
                border: `1.5px solid ${O.border}`,
                boxShadow: "0 2px 10px rgba(234,88,12,0.06)",
                cursor: "pointer",
              }}>
                <div className="qs-card-icon" style={{ fontSize: 26, marginBottom: 8 }}>📋</div>
                <div className="qs-card-title" style={{ fontWeight: 800, fontSize: 15, color: O.textPrimary, marginBottom: 3 }}>Sessions</div>
                <div className="qs-card-desc" style={{ fontSize: 12, color: O.textMuted }}>History &amp; scores</div>
              </div>
            </a>

            <a href="/quick/players" style={{ textDecoration: "none" }}>
              <div className="qs-hub-secondary-card" style={{
                background: O.surface, borderRadius: 16, padding: "18px 16px",
                border: `1.5px solid ${O.border}`,
                boxShadow: "0 2px 10px rgba(234,88,12,0.06)",
                cursor: "pointer",
              }}>
                <div className="qs-card-icon" style={{ fontSize: 26, marginBottom: 8 }}>🏅</div>
                <div className="qs-card-title" style={{ fontWeight: 800, fontSize: 15, color: O.textPrimary, marginBottom: 3 }}>Players</div>
                <div className="qs-card-desc" style={{ fontSize: 12, color: O.textMuted }}>Stats &amp; roster</div>
              </div>
            </a>
          </div>

          <p style={{ textAlign: "center", fontSize: 11, color: O.borderStrong, margin: "4px 0 0", fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>
            FAIRNESS-AWARE · CROSS-SESSION
          </p>
        </div>
      </div>
    </>
  );
}
