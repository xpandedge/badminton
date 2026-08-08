// apps/web/src/app/quick/sessions/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import { loadSessionHistory } from "@/lib/quick-sessions/history";
import type { QuickSession } from "@/lib/quick-sessions/types";

const O = {
  bg: "#FFF7ED", surface: "#FFFFFF", border: "#FED7AA", borderStrong: "#FDBA74",
  primary: "#EA580C", primaryGlow: "rgba(234,88,12,0.35)",
  textPrimary: "#431407", textSecondary: "#9A3412", textMuted: "#C2410C",
  tag: "#FFEDD5", headerBg: "#431407",
  green: "#15803D", greenBg: "#DCFCE7", greenBorder: "#86EFAC",
} as const;

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function sessionProgress(session: QuickSession): { done: number; total: number } {
  const total = session.matches.length;
  const done = Object.keys(session.scores ?? {}).length;
  return { done, total };
}

export default function SessionsPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<QuickSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadSessionHistory(user.uid)
      .then(setSessions)
      .catch(() => setError("Failed to load sessions. Check your connection."))
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
        .qs-sessions-grid { display: contents; }
        @media (min-width: 768px) {
          .qs-list-content { max-width: 880px; padding: 20px 24px; gap: 12px; }
          .qs-sessions-new-cta { padding: 18px 24px !important; font-size: 16px !important; }
          .qs-sessions-grid {
            display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%;
          }
          .qs-session-card { padding: 18px 20px !important; }
          .qs-session-card-name { font-size: 16px !important; }
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
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 16, color: "#fff", letterSpacing: "-0.01em" }}>Sessions</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontFamily: "var(--font-mono)" }}>your history</div>
            </div>
          </div>
        </div>

        <div className="qs-list-content">

          <a href="/quick/new" style={{ textDecoration: "none" }}>
            <div className="qs-sessions-new-cta" style={{
              background: O.primary, borderRadius: 14, padding: "14px 18px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              boxShadow: `0 4px 18px ${O.primaryGlow}`,
              animation: "qs-rise 300ms 40ms ease both",
            }}>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>⚡ New Session</span>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 18 }}>→</span>
            </div>
          </a>

          {loading && (
            <div style={{ textAlign: "center", padding: "40px 0", color: O.textMuted, fontSize: 13, fontFamily: "var(--font-mono)" }}>
              Loading…
            </div>
          )}

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#dc2626" }}>{error}</div>
          )}

          {!loading && sessions.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 16px" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: O.textPrimary, marginBottom: 6 }}>No sessions yet</div>
              <div style={{ fontSize: 13, color: O.textMuted }}>Start a new session to see it here.</div>
            </div>
          )}

          <div className="qs-sessions-grid">
            {sessions.map((s, i) => {
              const { done, total } = sessionProgress(s);
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              const isComplete = done === total && total > 0;
              return (
                <a key={s.id} href={`/quick/${s.id}`} style={{ textDecoration: "none", animation: `qs-rise 280ms ${60 + i * 40}ms ease both`, display: "block" }}>
                  <div className="qs-session-card" style={{
                    background: O.surface, borderRadius: 16, padding: "14px 16px",
                    border: `1px solid ${O.border}`,
                    boxShadow: "0 1px 6px rgba(234,88,12,0.05)",
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                      <div>
                        <div className="qs-session-card-name" style={{ fontWeight: 800, fontSize: 15, color: O.textPrimary, marginBottom: 2 }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: O.textMuted, fontFamily: "var(--font-mono)" }}>
                          {formatDate(s.createdAt)} · {s.players.length} players · {s.courts} court{s.courts !== 1 ? "s" : ""}
                        </div>
                      </div>
                      {isComplete && s.statsCommitted && (
                        <span style={{ fontSize: 10, color: O.green, background: O.greenBg, border: `1px solid ${O.greenBorder}`, borderRadius: 99, padding: "3px 10px", fontFamily: "var(--font-mono)", fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>✓ Saved</span>
                      )}
                      {isComplete && !s.statsCommitted && (
                        <span style={{ fontSize: 10, color: O.primary, background: O.tag, border: `1px solid ${O.borderStrong}`, borderRadius: 99, padding: "3px 10px", fontFamily: "var(--font-mono)", fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>Done</span>
                      )}
                    </div>
                    {/* Progress bar */}
                    <div style={{ height: 4, borderRadius: 2, background: O.tag, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 2,
                        background: isComplete ? "#16A34A" : `linear-gradient(90deg, ${O.primary}, #FBBF24)`,
                        width: `${pct}%`,
                        transition: "width 0.4s ease",
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: O.borderStrong, marginTop: 5, fontFamily: "var(--font-mono)" }}>
                      {done}/{total} matches
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
