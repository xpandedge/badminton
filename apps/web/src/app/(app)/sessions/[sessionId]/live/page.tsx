"use client";

import { use, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { generateSchedule, startSession, pauseSession, resumeSession, completeSession, watchMatches, watchLeaderboard, watchEngineState } from "@/lib/sessions/live";
import { rebalanceSession, updatePlayerStatus, addLatePlayer, swapPlayers, disableCourt, markPlayerInjured } from "@/lib/sessions/rebalance";
import { watchSession, watchSessionPlayers } from "@/lib/sessions/sessions";
import { watchGroupPlayers } from "@/lib/players/players";
import { useGroupRole } from "@/lib/groups/useGroupRole";
import { useAuth } from "@/lib/auth/useAuth";
import { canCreateSession, canEnterScore, canGenerateSchedule, canManageSessionPlayers } from "@picklebaddies/domain";
import { logEvent } from "@/lib/analytics/events";
import { enterScore, finishGameWithoutScore } from "@/lib/sessions/scoring";
import type { Session, SessionPlayer } from "@/lib/sessions/types";

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status: string) {
  if (status === "active" || status === "completed" || status === "checked_in") {
    return { bg: "var(--volt-500)", fg: "var(--ink-800)" };
  }
  if (status === "paused" || status === "waiting") {
    return { bg: "var(--warning-bg)", fg: "var(--warning)" };
  }
  if (status === "cancelled" || status === "removed" || status === "left" || status === "no_show") {
    return { bg: "var(--danger-bg)", fg: "var(--danger)" };
  }
  return { bg: "var(--surface-sunken)", fg: "var(--text-2)" };
}

export default function LiveOrganiserPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);

  const [session, setSession] = useState<Session | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [players, setPlayers] = useState<(SessionPlayer & { id: string })[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const [rebalanceSummary, setRebalanceSummary] = useState<string | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [selectedGroupPlayerId, setSelectedGroupPlayerId] = useState("");
  const [groupPlayers, setGroupPlayers] = useState<Array<{ id: string; displayName: string; userId?: string | null }>>([]);

  const [engineState, setEngineState] = useState<any | null>(null);

  const leaderboardLogged = useRef(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!sessionId || !user) return;
    return watchSession(sessionId, (s) => setSession(s));
  }, [sessionId, user]);

  useEffect(() => {
    if (!sessionId || !user) return;
    return watchSessionPlayers(
      sessionId,
      (list) => setPlayers(list.map((p) => ({ ...p, id: p.playerId }))),
      () => setPlayers([]),
    );
  }, [sessionId, user]);

  useEffect(() => {
    if (!sessionId || !user) return;
    return watchMatches(sessionId, setMatches);
  }, [sessionId, user]);

  useEffect(() => {
    if (!sessionId || !session?.scoringMode) return;
    return watchLeaderboard(sessionId, session.scoringMode, setLeaderboard);
  }, [sessionId, session?.scoringMode]);

  useEffect(() => {
    if (!sessionId || !user) return;
    return watchEngineState(sessionId, setEngineState);
  }, [sessionId, user]);

  useEffect(() => {
    if (!session?.groupId) return;
    return watchGroupPlayers(
      session.groupId,
      (p) => setGroupPlayers(p as Array<{ id: string; displayName: string; userId?: string | null }>),
      () => setGroupPlayers([]),
    );
  }, [session?.groupId]);

  useEffect(() => {
    if (!leaderboardLogged.current && leaderboard.length > 0) {
      leaderboardLogged.current = true;
      void logEvent("leaderboard_viewed", { sessionId });
    }
  }, [leaderboard.length, sessionId]);

  const role = useGroupRole(session?.groupId ?? null);

  if (!session) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "1.25rem" }}>
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)",
          padding: "1.5rem",
          boxShadow: "var(--shadow-sm)",
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Loading live console
          </span>
        </div>
      </div>
    );
  }

  const isLive = session.status === "active" || session.status === "paused";
  const canManageLive = canManageSessionPlayers(role);
  const canScore = canEnterScore(role);
  const canControlSession = canCreateSession(role);
  const canGenerate = canGenerateSchedule(role);

  // Generate + start are one step from the organiser's point of view — if no
  // schedule exists yet, seed it first, then start immediately.
  const handleStart = async () => {
    setActionError(null);
    try {
      if (matches.length === 0) {
        await generateSchedule({ sessionId });
      }
      await startSession({ sessionId });
    } catch (e: any) { setActionError(e.message); }
  };

  const handleRebalance = async (trigger?: string) => {
    setActionError(null);
    try {
      const res = await rebalanceSession({ sessionId, trigger });
      const data = res.data;
      setRebalanceSummary(data.summary);
      setShowSummaryModal(true);
    } catch (e: any) { setActionError(e.message); }
  };

  const handlePlayerStatus = async (sessionPlayerId: string, status: string) => {
    setActionError(null);
    try {
      const res = await updatePlayerStatus({ sessionId, sessionPlayerId, status });
      const data = res.data;
      if (data.rebalanceRecommended) {
        if (confirm("Player status changed. Re-pick current matches for the new roster?")) {
          await handleRebalance(status === "left" || status === "removed" || status === "no_show" ? "player_removed" : "settings_changed");
        }
      }
    } catch (e: any) { setActionError(e.message); }
  };

  const handleMarkInjured = async (sessionPlayerId: string, displayName: string) => {
    if (!confirm(`Mark ${displayName} as Injured / Step Out? They will be removed from upcoming courts.`)) return;
    setActionError(null);
    try {
      const res = await markPlayerInjured({ sessionId, sessionPlayerId });
      const data = res.data;
      if (data.rebalanceRecommended) {
        await handleRebalance("player_removed");
      }
    } catch (e: any) { setActionError(e.message); }
  };

  const handleFinishGame = async (matchId: string) => {
    setActionError(null);
    try {
      await finishGameWithoutScore(sessionId, matchId);
    } catch (e: any) { setActionError(e.message); }
  };

  const handleAddLatePlayer = async () => {
    const picked = groupPlayers.find((p) => p.id === selectedGroupPlayerId);
    if (!picked) return;
    setActionError(null);
    try {
      await addLatePlayer({ sessionId, playerId: picked.id, displayName: picked.displayName });
      setSelectedGroupPlayerId("");
    } catch (e: any) { setActionError(e.message); }
  };

  const handleDisableCourt = async (courtId: string, courtName: string) => {
    if (!confirm(`Disable court "${courtName}"? This cannot be undone without a rebalance.`)) return;
    setActionError(null);
    try {
      const res = await disableCourt({ sessionId, courtId });
      if ((res.data as any).rebalanceRecommended) {
        if (confirm("Court disabled. Re-pick current matches to redistribute?")) {
          await handleRebalance("settings_changed");
        }
      }
    } catch (e: any) { setActionError(e.message); }
  };

  // One click: picking a replacement in the dropdown swaps immediately.
  const handleSwapPlayer = async (matchId: string, outPlayerId: string, inPlayerId: string) => {
    setActionError(null);
    try {
      await swapPlayers({ sessionId, matchId, outPlayerId, inPlayerId });
    } catch (e: any) { setActionError(e.message); }
  };

  const submitScorePoints = async (matchId: string, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setActionError(null);
    const formData = new FormData(e.currentTarget);
    const teamAScore = parseInt(formData.get("teamA") as string, 10);
    const teamBScore = parseInt(formData.get("teamB") as string, 10);
    try {
      await enterScore(sessionId, matchId, { teamAScore, teamBScore });
    } catch (err: any) { setActionError(err.message); }
  };

  const submitScoreWinnerOnly = async (matchId: string, winnerTeam: "A" | "B") => {
    setActionError(null);
    try {
      await enterScore(sessionId, matchId, { winnerTeam });
    } catch (err: any) { setActionError(err.message); }
  };

  const activeCourts = (session.courts ?? []).filter((c) => c.isActive);
  const displayNameById = new Map(players.map((p) => [p.playerId, p.displayName]));

  const activePlayers = players.filter((p) => p.status === "active" || p.status === "checked_in");
  const otherPlayers = players.filter((p) => p.status !== "active" && p.status !== "checked_in");

  const scheduledMatches = matches.filter((m) => m.status === "scheduled");
  const historyMatches = matches.filter((m) => m.status !== "scheduled").sort((a, b) => (b.roundNumber ?? 0) - (a.roundNumber ?? 0));
  const scheduledByCourtId = new Map(scheduledMatches.map((m) => [m.courtId, m]));
  const lockedMatches = matches.filter((match) => match.status === "completed" || match.status === "cancelled" || match.isLocked).length;

  const activePlayerIds = new Set(activePlayers.map((p) => p.playerId));
  const sitOutCounts: number[] = engineState?.sitOuts
    ? Object.entries(engineState.sitOuts as Record<string, number>).filter(([id]) => activePlayerIds.has(id)).map(([, v]) => v)
    : [];
  const sitOutSpread = sitOutCounts.length > 0 ? Math.max(...sitOutCounts) - Math.min(...sitOutCounts) : null;

  const sessionTone = statusTone(session.status);
  const primaryActionStyle: CSSProperties = {
    height: 44,
    padding: "0 0.875rem",
    border: "none",
    borderRadius: "var(--r-md)",
    background: "var(--ink-800)",
    color: "var(--volt-500)",
    fontWeight: 900,
    cursor: "pointer",
  };
  const secondaryActionStyle: CSSProperties = {
    height: 44,
    padding: "0 0.875rem",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-md)",
    background: "var(--surface)",
    color: "var(--text-1)",
    fontWeight: 900,
    cursor: "pointer",
  };

  function renderMatchCard(m: any) {
    const isLocked = m.status === "completed" || m.status === "cancelled" || m.isLocked;
    const inMatch = new Set<string>([
      ...m.teamA.map((p: any) => p.playerId),
      ...m.teamB.map((p: any) => p.playerId),
    ]);
    const eligibleForSwap = players.filter(
      (p) => !inMatch.has(p.playerId) && (p.status === "active" || p.status === "checked_in")
    );
    const renderSwap = (p: any, alignRight: boolean) => {
      return (
        <div key={p.playerId} data-testid="match-player" style={{ display: "grid", gap: "0.375rem", justifyItems: alignRight ? "end" : "start" }}>
          <span style={{ fontWeight: 900 }}>{p.displayName}</span>
          {canManageLive && !isLocked && (
            <select
              value=""
              onChange={(e) => { if (e.target.value) handleSwapPlayer(m.id, p.playerId, e.target.value); }}
              className="pb-input"
              style={{ height: 34, borderRadius: "var(--r-md)", padding: "0 0.5rem", fontSize: "0.75rem", maxWidth: 150 }}
            >
              <option value="">Swap with...</option>
              {eligibleForSwap.map((ep) => (
                <option key={ep.playerId} value={ep.playerId}>{ep.displayName}</option>
              ))}
            </select>
          )}
        </div>
      );
    };
    const matchTone = statusTone(m.status);
    return (
      <div key={m.id} data-testid="match-card" data-match-id={m.id} data-locked={isLocked} style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-xl)",
        padding: "1rem",
        marginBottom: "0.875rem",
        boxShadow: "var(--shadow-sm)",
        opacity: isLocked ? 0.85 : 1,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", marginBottom: "0.875rem" }}>
          <div>
            <p style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.125rem", fontWeight: 900 }}>
              {m.courtName ?? `Court ${m.courtId}`}
            </p>
            <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>Match #{m.roundNumber}</p>
          </div>
          <span style={{
            padding: "4px 8px",
            borderRadius: "var(--r-pill)",
            background: isLocked ? "var(--n-200)" : matchTone.bg,
            color: isLocked ? "var(--text-3)" : matchTone.fg,
            fontSize: "0.75rem",
            fontWeight: 900,
            whiteSpace: "nowrap",
          }}>
            {isLocked ? "Locked" : titleCase(m.status)}
          </span>
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: "0.75rem",
          alignItems: "stretch",
          marginBottom: "0.875rem",
        }}>
          <div style={{ background: "var(--surface-sunken)", borderRadius: "var(--r-lg)", padding: "0.875rem", minWidth: 0 }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: "0.5rem" }}>Team A</p>
            {m.teamA.map((p: any) => renderSwap(p, false))}
          </div>
          <div style={{ display: "grid", placeItems: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)", fontWeight: 900 }}>VS</div>
          <div style={{ background: "var(--surface-sunken)", borderRadius: "var(--r-lg)", padding: "0.875rem", minWidth: 0, textAlign: "right" }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: "0.5rem" }}>Team B</p>
            {m.teamB.map((p: any) => renderSwap(p, true))}
          </div>
        </div>

        {canScore && !isLocked && session!.scoringMode === "points" ? (
          <form onSubmit={(e) => submitScorePoints(m.id, e)} style={{ display: "grid", gridTemplateColumns: "80px auto 80px minmax(120px, auto)", gap: "0.5rem", alignItems: "center" }}>
            <input data-testid="score-team-a-input" name="teamA" type="number" required defaultValue={m.scorePayload?.teamAScore} className="pb-input" style={{ height: 42, borderRadius: "var(--r-md)", padding: "0 0.625rem" }} />
            <span style={{ textAlign: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)", fontWeight: 900 }}>VS</span>
            <input data-testid="score-team-b-input" name="teamB" type="number" required defaultValue={m.scorePayload?.teamBScore} className="pb-input" style={{ height: 42, borderRadius: "var(--r-md)", padding: "0 0.625rem" }} />
            <button data-testid="save-score-btn" type="submit" style={primaryActionStyle}>Save Score</button>
          </form>
        ) : canScore && !isLocked ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <button data-testid="score-winner-a" onClick={() => submitScoreWinnerOnly(m.id, "A")} style={m.winnerTeam === "A" ? primaryActionStyle : secondaryActionStyle}>A Wins</button>
            <button data-testid="score-winner-b" onClick={() => submitScoreWinnerOnly(m.id, "B")} style={m.winnerTeam === "B" ? primaryActionStyle : secondaryActionStyle}>B Wins</button>
          </div>
        ) : null}

        {canScore && !isLocked && (
          <button
            data-testid="finish-game-btn"
            onClick={() => handleFinishGame(m.id)}
            style={{
              display: "block",
              margin: "0.5rem auto 0",
              border: "none",
              background: "transparent",
              color: "var(--text-3)",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: "0.75rem",
              textDecoration: "underline",
            }}
          >
            Skip scoring, just finish
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: 1180,
      margin: "0 auto",
      padding: "1.25rem 1.25rem 2rem",
      display: "grid",
      gap: "1rem",
    }}>
      <section style={{
        background: "var(--ink-800)",
        borderRadius: "var(--r-2xl)",
        padding: "1.5rem",
        color: "var(--text-inverse)",
        position: "relative",
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)",
        animation: "pb-rise 400ms var(--ease-out) both",
      }}>
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(198,241,53,0.055) 0 1px, transparent 1px 18px), repeating-linear-gradient(-45deg, rgba(198,241,53,0.055) 0 1px, transparent 1px 18px)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", display: "grid", gap: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <span style={{
                display: "inline-flex",
                padding: "4px 10px",
                borderRadius: "var(--r-pill)",
                background: sessionTone.bg,
                color: sessionTone.fg,
                fontFamily: "var(--font-mono)",
                fontSize: "0.625rem",
                fontWeight: 900,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: "0.875rem",
              }}>
                {titleCase(session.status)}
              </span>
              <h1 style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.7rem, 5vw, 3rem)",
                lineHeight: 1.02,
                textTransform: "uppercase",
                letterSpacing: "-0.025em",
                color: "var(--n-50)",
                overflowWrap: "anywhere",
              }}>
                {session.name}
              </h1>
              <p style={{ color: "rgba(246,248,244,0.72)", marginTop: "0.5rem", maxWidth: 760 }}>
                Live console · {titleCase(session.scoringMode)} scoring · courts run independently
              </p>
            </div>
            <div style={{
              width: 54,
              height: 54,
              borderRadius: "var(--r-xl)",
              background: "var(--volt-500)",
              color: "var(--ink-800)",
              display: "grid",
              placeItems: "center",
              boxShadow: "var(--shadow-volt)",
              flexShrink: 0,
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M3 12h18" />
                <path d="M3 18h18" />
                <path d="M7 6v12" />
                <path d="M17 6v12" />
              </svg>
            </div>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: "0.75rem",
          }}>
            {[
              { label: "Players", value: players.length },
              { label: "Courts", value: activeCourts.length },
              { label: "Matches", value: matches.length },
              { label: "Locked", value: lockedMatches },
              ...(sitOutSpread !== null ? [{ label: "Sit-out spread", value: sitOutSpread }] : []),
            ].map((stat) => (
              <div key={stat.label} data-testid={stat.label === "Sit-out spread" ? "fairness-chip" : undefined} style={{
                background: stat.label === "Sit-out spread"
                  ? (sitOutSpread !== null && sitOutSpread <= 1 ? "rgba(198,241,53,0.18)" : "rgba(255,200,50,0.18)")
                  : "rgba(246,248,244,0.08)",
                border: stat.label === "Sit-out spread"
                  ? (sitOutSpread !== null && sitOutSpread <= 1 ? "1px solid rgba(198,241,53,0.35)" : "1px solid rgba(255,200,50,0.35)")
                  : "1px solid rgba(246,248,244,0.12)",
                borderRadius: "var(--r-xl)",
                padding: "1rem",
              }}>
                <div style={{ fontFamily: "var(--font-display-tight)", fontSize: "2rem", fontWeight: 900, color: stat.label === "Sit-out spread" ? (sitOutSpread !== null && sitOutSpread <= 1 ? "var(--volt-500)" : "#ffc832") : "var(--volt-500)", lineHeight: 1 }}>
                  {stat.value}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "rgba(246,248,244,0.55)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 6 }}>
                  {stat.label === "Sit-out spread" ? "🟢 Rotation Health" : stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {actionError && (
        <div style={{
          background: "var(--danger-bg)",
          color: "var(--danger)",
          borderRadius: "var(--r-xl)",
          padding: "0.875rem 1rem",
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          alignItems: "center",
          fontWeight: 800,
          animation: "pb-rise 300ms var(--ease-out) both",
        }}>
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} style={{ border: "none", background: "transparent", color: "var(--danger)", fontWeight: 900, cursor: "pointer" }}>
            Dismiss
          </button>
        </div>
      )}

      {/* Session control buttons */}
      <section style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-xl)",
        padding: "1rem",
        boxShadow: "var(--shadow-sm)",
        display: "grid",
        gap: "0.875rem",
        animation: "pb-rise 400ms 60ms var(--ease-out) both",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
              Session Controls
            </h2>
            <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>Generate, run courts, and rebalance current matches.</p>
          </div>
          <a href={`/sessions/${sessionId}`} style={{
            height: 42,
            padding: "0 0.875rem",
            borderRadius: "var(--r-md)",
            background: "var(--surface-sunken)",
            color: "var(--text-1)",
            display: "inline-flex",
            alignItems: "center",
            fontWeight: 900,
          }}>
            Session Details
          </a>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem" }}>
        {canControlSession && (session.status === "draft" || session.status === "scheduled") && (
          <button data-testid="start-session-btn" onClick={handleStart} style={primaryActionStyle}>Start Session</button>
        )}
        {canControlSession && session.status === "active" && (
          <>
            <button onClick={() => pauseSession({ sessionId })} style={secondaryActionStyle}>Pause</button>
            <button data-testid="complete-session-btn" onClick={() => completeSession({ sessionId })} style={{ ...secondaryActionStyle, color: "var(--danger)" }}>Complete Session</button>
          </>
        )}
        {canControlSession && session.status === "paused" && (
          <button onClick={() => resumeSession({ sessionId })} style={primaryActionStyle}>Resume</button>
        )}
        {canGenerate && isLive && (
          <button data-testid="rebalance-btn" onClick={() => handleRebalance("manual_rebalance")} style={{ ...primaryActionStyle, background: "var(--volt-500)", color: "var(--ink-800)" }}>Re-pick Current Matches</button>
        )}
        </div>
      </section>

      {/* Courts management */}
      {canManageLive && isLive && session.courts && session.courts.length > 0 && (
        <section style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)",
          padding: "1rem",
          boxShadow: "var(--shadow-sm)",
          animation: "pb-rise 400ms 90ms var(--ease-out) both",
        }}>
          <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em", marginBottom: "0.875rem" }}>
            Courts
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {session.courts.map((court) => (
              <div key={court.courtId} style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                borderRadius: "var(--r-pill)",
                border: "1px solid var(--border)",
                background: court.isActive ? "var(--surface-sunken)" : "var(--n-200)",
                color: court.isActive ? "var(--text-1)" : "var(--text-3)",
                opacity: court.isActive ? 1 : 0.65,
                fontWeight: 800,
              }}>
                <span>{court.name}</span>
                {court.isActive && (
                  <button
                    onClick={() => handleDisableCourt(court.courtId, court.name)}
                    style={{ border: "none", background: "transparent", color: "var(--danger)", fontWeight: 900, cursor: "pointer" }}
                  >
                    Disable
                  </button>
                )}
                {!court.isActive && <span style={{ fontSize: "0.75rem" }}>Disabled</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <main style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.25fr) minmax(min(100%, 320px), 0.75fr)",
        gap: "1rem",
        alignItems: "start",
      }}>
        {/* Court-centric live board: each court shows its current match, filled
            automatically the instant it frees up — no round barrier. */}
        <section style={{ animation: "pb-rise 400ms 120ms var(--ease-out) both" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.625rem" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
              Courts
            </span>
          </div>
          {matches.length === 0 && (
            <div style={{
              background: "var(--surface)",
              border: "2px dashed var(--border)",
              borderRadius: "var(--r-xl)",
              padding: "2rem 1.25rem",
              textAlign: "center",
            }}>
              <h3 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, marginBottom: "0.375rem" }}>
                No matches yet
              </h3>
              <p style={{ color: "var(--text-2)" }}>Generate schedule after enough players join.</p>
            </div>
          )}
          {activeCourts.map((court) => {
            const current = scheduledByCourtId.get(court.courtId);
            if (current) return renderMatchCard(current);
            return (
              <div key={court.courtId} data-testid="court-empty" style={{
                background: "var(--surface)",
                border: "2px dashed var(--border)",
                borderRadius: "var(--r-xl)",
                padding: "1.25rem",
                marginBottom: "0.875rem",
                textAlign: "center",
              }}>
                <p style={{ fontFamily: "var(--font-display-tight)", fontWeight: 900 }}>{court.name}</p>
                <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>Waiting for players…</p>
              </div>
            );
          })}

          {historyMatches.length > 0 && (
            <div style={{ marginTop: "1.5rem" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
                History
              </span>
              <div style={{ marginTop: "0.625rem" }}>
                {historyMatches.map((m) => renderMatchCard(m))}
              </div>
            </div>
          )}
        </section>

        {/* Leaderboard */}
        <aside style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)",
          padding: "1rem",
          boxShadow: "var(--shadow-sm)",
          animation: "pb-rise 400ms 150ms var(--ease-out) both",
          position: "sticky",
          top: 72,
        }}>
          <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em", marginBottom: "0.875rem" }}>
            Leaderboard
          </h2>
          {leaderboard.length === 0 ? (
            <div style={{ border: "2px dashed var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem", color: "var(--text-2)", textAlign: "center" }}>
              No scores yet.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {leaderboard.map((row, idx) => (
                <div key={row.playerId} style={{
                  display: "grid",
                  gridTemplateColumns: "auto minmax(0, 1fr) repeat(3, auto)",
                  alignItems: "center",
                  gap: "0.625rem",
                  padding: "0.625rem",
                  borderRadius: "var(--r-lg)",
                  background: idx === 0 ? "rgba(198,241,53,0.18)" : "var(--surface-sunken)",
                }}>
                  <span style={{ width: 26, height: 26, borderRadius: "50%", background: idx === 0 ? "var(--volt-500)" : "var(--surface)", display: "grid", placeItems: "center", fontWeight: 900 }}>
                    {idx + 1}
                  </span>
                  <span style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.displayName ?? displayNameById.get(row.playerId) ?? row.playerId}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-3)" }}>W {row.wins}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-3)" }}>L {row.losses}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-3)" }}>{session.scoringMode === "points" ? `PD ${row.pointDifference}` : `GP ${row.gamesPlayed}`}</span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </main>

      {/* Roster management */}
      {canManageLive && isLive && (
        <section style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)",
          padding: "1rem",
          boxShadow: "var(--shadow-sm)",
          display: "grid",
          gap: "1rem",
          animation: "pb-rise 400ms 180ms var(--ease-out) both",
        }}>
          <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
            Roster Management
          </h2>

          <div>
            <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: "0.625rem" }}>
              Active Players ({activePlayers.length})
            </h3>
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {activePlayers.map((p) => (
                <div key={p.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.75rem", alignItems: "center", padding: "0.75rem", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-sunken)" }}>
                  <span style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.displayName} <span style={{ color: "var(--text-3)", fontWeight: 700 }}>({titleCase(p.status)})</span></span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", justifyContent: "flex-end" }}>
                    <button
                      data-testid="injured-btn"
                      onClick={() => handleMarkInjured(p.id, p.displayName)}
                      style={{
                        height: 34,
                        padding: "0 0.625rem",
                        border: "2px solid var(--danger)",
                        borderRadius: "var(--r-md)",
                        background: "transparent",
                        color: "var(--danger)",
                        fontWeight: 900,
                        cursor: "pointer",
                        fontSize: "0.75rem",
                      }}
                    >
                      🚑 Injured / Step Out
                    </button>
                    <button onClick={() => handlePlayerStatus(p.id, "waiting")} style={{ ...secondaryActionStyle, height: 34, fontSize: "0.75rem" }}>Waiting</button>
                    <button onClick={() => handlePlayerStatus(p.id, "left")} style={{ ...secondaryActionStyle, height: 34, fontSize: "0.75rem" }}>Left</button>
                    <button onClick={() => handlePlayerStatus(p.id, "removed")} style={{ ...secondaryActionStyle, height: 34, fontSize: "0.75rem", color: "var(--danger)" }}>Remove</button>
                  </div>
                </div>
              ))}
              {activePlayers.length === 0 && <p style={{ color: "var(--text-2)" }}>No active players.</p>}
            </div>
          </div>

          {otherPlayers.length > 0 && (
            <div>
              <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: "0.625rem" }}>
                Other Players
              </h3>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {otherPlayers.map((p) => (
                  <div key={p.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.75rem", alignItems: "center", padding: "0.75rem", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-sunken)" }}>
                    <span style={{ color: "var(--text-2)", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.displayName} <span style={{ color: "var(--text-3)" }}>({titleCase(p.status)})</span></span>
                    <button onClick={() => handlePlayerStatus(p.id, "active")} style={{ ...primaryActionStyle, height: 34, fontSize: "0.75rem" }}>Re-activate</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: "0.625rem" }}>
              Add Late Player
            </h3>
            {(() => {
              const sessionPlayerIds = new Set(players.map((p) => p.id));
              const available = groupPlayers.filter((gp) => !sessionPlayerIds.has(gp.id));
              if (groupPlayers.length === 0) {
                return (
                  <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>
                    No team members found — add members to the team first.
                  </p>
                );
              }
              return (
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.625rem", alignItems: "center" }}>
                  <select
                    data-testid="add-player-select"
                    className="pb-input"
                    value={selectedGroupPlayerId}
                    onChange={(e) => setSelectedGroupPlayerId(e.target.value)}
                    style={{ height: 44, borderRadius: "var(--r-md)" }}
                  >
                    <option value="">
                      {available.length === 0 ? "All team members are in the session" : "Pick a team member…"}
                    </option>
                    {available.map((gp) => (
                      <option key={gp.id} value={gp.id}>{gp.displayName}</option>
                    ))}
                  </select>
                  <button
                    data-testid="add-player-submit"
                    onClick={handleAddLatePlayer}
                    disabled={!selectedGroupPlayerId || available.length === 0}
                    style={{
                      ...primaryActionStyle,
                      opacity: selectedGroupPlayerId && available.length > 0 ? 1 : 0.45,
                    }}
                  >
                    Add Player
                  </button>
                </div>
              );
            })()}
          </div>
        </section>
      )}

      {/* Rebalance summary modal */}
      {showSummaryModal && rebalanceSummary && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(22,36,28,0.52)",
          display: "grid",
          placeItems: "center",
          zIndex: 500,
          padding: "1rem",
        }}>
          <div style={{ background: "var(--surface)", borderRadius: "var(--r-xl)", padding: "1.25rem", maxWidth: 440, width: "100%", boxShadow: "var(--shadow-lg)" }}>
            <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, marginBottom: "0.75rem" }}>Rebalance Complete</h2>
            <p style={{ color: "var(--text-2)", lineHeight: 1.5 }}>{rebalanceSummary}</p>
            <button
              onClick={() => setShowSummaryModal(false)}
              className="pb-btn pb-btn-volt"
              style={{ marginTop: "1rem" }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
