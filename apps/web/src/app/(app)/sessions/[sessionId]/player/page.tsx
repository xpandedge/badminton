"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import { watchSession } from "@/lib/sessions/sessions";
import { watchMatches } from "@/lib/sessions/live";
import { findPlayerMatch, PlayerMatchInfo } from "@/lib/sessions/player-view";
import type { Session } from "@/lib/sessions/types";
import { LoadingState } from "@/components/LoadingState";

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export default function PlayerSelfViewPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { user } = useAuth();

  const [session, setSession] = useState<Session | null>(null);
  const [allMatches, setAllMatches] = useState<any[]>([]);
  const [matchInfo, setMatchInfo] = useState<PlayerMatchInfo | null>(null);
  const [completedMatches, setCompletedMatches] = useState<any[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    return watchSession(sessionId, (s) => setSession(s));
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !user?.uid) return;
    return watchMatches(sessionId, setAllMatches);
  }, [sessionId, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    setMatchInfo(findPlayerMatch(allMatches, user.uid));
    const completed = allMatches.filter((m) =>
      m.status === "completed" &&
      (m.teamA.some((p: any) => p.playerId === user.uid) || m.teamB.some((p: any) => p.playerId === user.uid))
    ).sort((a, b) => (b.roundNumber ?? 0) - (a.roundNumber ?? 0));
    setCompletedMatches(completed);
  }, [allMatches, user?.uid]);

  if (!session) return <LoadingState message="Loading session…" />;
  if (!user) return <LoadingState message="Checking authentication…" />;

  const isLive = session.status === "active" || session.status === "paused";
  const cur = matchInfo?.currentMatch;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "1.25rem 1.25rem 2rem", display: "grid", gap: "1rem" }}>
      {/* Hero */}
      <section style={{
        background: "var(--ink-800)", borderRadius: "var(--r-2xl)", padding: "1.5rem",
        color: "var(--text-inverse)", position: "relative", overflow: "hidden",
        boxShadow: "var(--shadow-sm)", animation: "pb-rise 400ms var(--ease-out) both",
      }}>
        <div aria-hidden="true" style={{
          position: "absolute", inset: 0,
          backgroundImage: "repeating-linear-gradient(45deg, rgba(198,241,53,0.055) 0 1px, transparent 1px 18px), repeating-linear-gradient(-45deg, rgba(198,241,53,0.055) 0 1px, transparent 1px 18px)",
          pointerEvents: "none",
        }} />
        <div style={{ position: "relative" }}>
          <span style={{
            display: "inline-flex", padding: "4px 10px", borderRadius: "var(--r-pill)",
            background: isLive ? "var(--volt-500)" : "rgba(246,248,244,0.12)",
            color: isLive ? "var(--ink-800)" : "var(--n-50)",
            fontFamily: "var(--font-mono)", fontSize: "0.625rem", fontWeight: 900,
            letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.75rem",
          }}>
            {titleCase(session.status)}
          </span>
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: "clamp(1.5rem, 5vw, 2.25rem)",
            fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.025em",
            lineHeight: 1.02, color: "var(--n-50)", overflowWrap: "anywhere",
          }}>
            {session.name}
          </h1>
          <p style={{ color: "rgba(246,248,244,0.6)", marginTop: "0.375rem", fontSize: "0.9375rem" }}>
            Your live view
          </p>
        </div>
      </section>

      {!isLive && (
        <div style={{
          background: "var(--surface)", border: "2px dashed var(--border)", borderRadius: "var(--r-xl)",
          padding: "2rem 1.25rem", textAlign: "center", color: "var(--text-2)",
        }}>
          Matches will appear here once the organiser starts the session.
        </div>
      )}

      {isLive && matchInfo && (
        cur ? (
          <section style={{
            background: "rgba(198,241,53,0.12)", border: "2px solid var(--volt-500)",
            borderRadius: "var(--r-2xl)", padding: "1.5rem", textAlign: "center",
            animation: "pb-rise 400ms 60ms var(--ease-out) both",
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--volt-600)", marginBottom: "0.25rem" }}>
              You're up now
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "1.75rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em" }}>
              {cur.courtName ?? `Court ${cur.courtId}`}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "0.75rem", alignItems: "center", marginTop: "1.25rem" }}>
              <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", padding: "0.875rem" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: "0.375rem" }}>Team A</div>
                {cur.teamA.map((p: any) => (
                  <div key={p.playerId} style={{ fontWeight: 800, color: p.playerId === user.uid ? "var(--volt-600)" : "var(--text-1)" }}>{p.displayName}</div>
                ))}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 900, color: "var(--text-3)" }}>VS</div>
              <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", padding: "0.875rem" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: "0.375rem" }}>Team B</div>
                {cur.teamB.map((p: any) => (
                  <div key={p.playerId} style={{ fontWeight: 800, color: p.playerId === user.uid ? "var(--volt-600)" : "var(--text-1)" }}>{p.displayName}</div>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section style={{
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-2xl)",
            padding: "2rem 1.25rem", textAlign: "center", boxShadow: "var(--shadow-sm)",
            animation: "pb-rise 400ms 60ms var(--ease-out) both",
          }}>
            <div style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>🪑</div>
            <div style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900 }}>You're on the bench</div>
            <p style={{ color: "var(--text-2)", marginTop: "0.25rem" }}>Hang tight — you'll be assigned the moment a court frees up.</p>
          </section>
        )
      )}

      {completedMatches.length > 0 && (
        <section>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: "0.625rem" }}>
            Your results
          </div>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {completedMatches.map((m) => {
              const isTeamA = m.teamA.some((p: any) => p.playerId === user.uid);
              const didWin = m.winnerTeam === (isTeamA ? "A" : "B");
              return (
                <div key={m.id} style={{
                  display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0.75rem", alignItems: "center",
                  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)",
                  padding: "0.75rem 0.875rem",
                }}>
                  <span style={{ color: "var(--text-2)", fontWeight: 700, fontSize: "0.9375rem" }}>{m.courtName ?? `Court ${m.courtId}`}</span>
                  {typeof m.scorePayload?.teamAScore === "number" && (
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)", fontSize: "0.875rem" }}>
                      {m.scorePayload.teamAScore}–{m.scorePayload.teamBScore}
                    </span>
                  )}
                  <span style={{
                    padding: "3px 10px", borderRadius: "var(--r-pill)", fontWeight: 900, fontSize: "0.75rem",
                    background: didWin ? "rgba(198,241,53,0.18)" : "var(--danger-bg)",
                    color: didWin ? "var(--volt-600)" : "var(--danger)",
                  }}>
                    {didWin ? "Win" : "Loss"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
