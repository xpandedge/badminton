"use client";

import { useEffect, useState, use } from "react";
import { watchSession, watchSessionPlayers, updateSessionDraft } from "@/lib/sessions/sessions";
import type { Session, SessionPlayer } from "@/lib/sessions/types";
import { useGroupRole } from "@/lib/groups/useGroupRole";
import { useAuth } from "@/lib/auth/useAuth";
import { watchGroupPlayers } from "@/lib/players/players";
import { canManageSessionPlayers } from "@picklebaddies/domain";
import { addGroupMemberToSession } from "@/server/sessions/players";
import { addCourtToSession } from "@/server/sessions/actions";
import { formatSessionStatus, formatPlayerStatus, formatScoringMode } from "@/lib/format/status";
import { QRCode } from "@/components/QRCode";

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statValue(value: string | number) {
  return String(value);
}

type GroupPlayer = { id: string; displayName?: string; skillLevel?: string; userId?: string };

export default function SessionDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);

  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [groupPlayers, setGroupPlayers] = useState<GroupPlayer[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  // Add court state
  const [addCourtName, setAddCourtName] = useState("");
  const [addCourtLoading, setAddCourtLoading] = useState(false);
  const [addCourtError, setAddCourtError] = useState<string | null>(null);

  const { user: currentUser } = useAuth();
  const role = useGroupRole(session?.groupId ?? null);
  const canManage = canManageSessionPlayers(role);
  const isGroupMember = role !== null;

  const activePlayers = players.filter((p) => p.status !== "removed" && p.status !== "left");
  // Match by both playerId (uid) and also by the group player doc ID for cases where they differ
  const activePlayerIds = new Set(activePlayers.map((p) => p.playerId));
  const currentUserInSession = currentUser ? activePlayerIds.has(currentUser.uid) : false;
  // Exclude group members who are already active — match by doc ID OR by userId field
  const rosterNotInSession = groupPlayers.filter(
    (gp) => !activePlayerIds.has(gp.id) && !activePlayerIds.has(gp.userId ?? "__none__")
  );

  useEffect(() => {
    const unsubSession = watchSession(sessionId, (s) => setSession(s));
    const unsubPlayers = watchSessionPlayers(sessionId, (p) => setPlayers(p), () => setPlayers([]));
    return () => { unsubSession(); unsubPlayers(); };
  }, [sessionId]);

  useEffect(() => {
    if (!session?.groupId) return;
    return watchGroupPlayers(session.groupId, (gps) => setGroupPlayers(gps as GroupPlayer[]), () => setGroupPlayers([]));
  }, [session?.groupId]);

  const handleAddToSession = async (playerId: string) => {
    setAddingId(playerId);
    setAddError(null);
    try {
      const result = await addGroupMemberToSession(sessionId, playerId);
      if (!result.ok) setAddError(result.message);
    } catch {
      setAddError("Failed to add player. Try again.");
    } finally {
      setAddingId(null);
    }
  };

  const scoreLinkPath = session?.scoreCode ? `/score/${session.scoreCode}` : null;

  const handleCopyScoreLink = async () => {
    if (!scoreLinkPath) return;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    await navigator.clipboard?.writeText(`${origin}${scoreLinkPath}`);
  };

  const handleToggleScoreLink = async () => {
    if (!session) return;
    await updateSessionDraft(sessionId, { scoreLinkEnabled: !session.scoreLinkEnabled });
  };

  const boardEnabled = session?.boardEnabled !== false;
  const boardPath = session?.scoreCode ? `/board/${session.scoreCode}` : null;
  const boardUrl = boardPath && typeof window !== "undefined" ? `${window.location.origin}${boardPath}` : boardPath ?? "";
  const [boardCopied, setBoardCopied] = useState(false);

  const handleCopyBoardLink = async () => {
    if (!boardPath) return;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    await navigator.clipboard?.writeText(`${origin}${boardPath}`);
    setBoardCopied(true);
    setTimeout(() => setBoardCopied(false), 1600);
  };

  const handleShareBoardLink = async () => {
    if (!boardUrl) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
          title: session?.name ? `${session.name} — player board` : "Player board",
          text: "See your matches:",
          url: boardUrl,
        });
        return;
      } catch {
        /* user cancelled or unsupported — fall through to copy */
      }
    }
    await handleCopyBoardLink();
  };

  const handleToggleBoard = async () => {
    if (!session) return;
    await updateSessionDraft(sessionId, { boardEnabled: !boardEnabled });
  };

  const handleAddCourt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addCourtName.trim() || addCourtLoading) return;
    setAddCourtLoading(true);
    setAddCourtError(null);
    const res = await addCourtToSession(sessionId, addCourtName.trim()).catch((err) => ({ ok: false as const, message: err.message }));
    setAddCourtLoading(false);
    if (res && !res.ok) {
      setAddCourtError(res.message || "Failed to add court");
    } else {
      setAddCourtName("");
    }
  };

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
            Loading session
          </span>
        </div>
      </div>
    );
  }

  const activeCourts = session.courts?.filter((court) => court.isActive !== false) ?? [];
  const roundEstimate = Math.max(1, Math.floor(session.durationMinutes / Math.max(1, session.estimatedGameMinutes)));
  const registeredCount = activePlayers.length;
  const statusTone = session.status === "active"
    ? { bg: "var(--volt-500)", fg: "var(--ink-800)" }
    : session.status === "completed"
      ? { bg: "var(--emerald-100)", fg: "var(--emerald-700)" }
      : session.status === "cancelled"
        ? { bg: "var(--danger-bg)", fg: "var(--danger)" }
        : { bg: "rgba(246,248,244,0.12)", fg: "var(--n-50)" };

  const canJoin = isGroupMember && !currentUserInSession &&
    session.status !== "completed" && session.status !== "cancelled";

  return (
    <div style={{
      maxWidth: 1120,
      margin: "0 auto",
      padding: "1.25rem 1.25rem 2rem",
      display: "grid",
      gap: "1rem",
    }}>
      {/* Hero */}
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
        <div aria-hidden="true" style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(198,241,53,0.055) 0 1px, transparent 1px 18px), repeating-linear-gradient(-45deg, rgba(198,241,53,0.055) 0 1px, transparent 1px 18px)",
          pointerEvents: "none",
        }} />
        <div style={{ position: "relative", display: "grid", gap: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <span style={{
                display: "inline-flex",
                padding: "4px 10px",
                borderRadius: "var(--r-pill)",
                background: statusTone.bg,
                color: statusTone.fg,
                fontFamily: "var(--font-mono)",
                fontSize: "0.625rem",
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: "0.875rem",
              }}>
                {formatSessionStatus(session.status)}
              </span>
              <h1 style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.75rem, 5vw, 3rem)",
                lineHeight: 1.02,
                textTransform: "uppercase",
                letterSpacing: "-0.025em",
                color: "var(--n-50)",
                overflowWrap: "anywhere",
              }}>
                {session.name}
              </h1>
              <p style={{ color: "rgba(246,248,244,0.72)", marginTop: "0.5rem", maxWidth: 720 }}>
                {session.venueName} · {titleCase(session.sport)} · {session.durationMinutes} minutes
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.625rem", alignItems: "center", flexWrap: "wrap" }}>
              {canJoin && currentUser && (
                <button
                  type="button"
                  disabled={addingId === currentUser.uid}
                  onClick={() => handleAddToSession(currentUser.uid)}
                  style={{
                    height: 48,
                    padding: "0 1rem",
                    borderRadius: "var(--r-lg)",
                    background: "rgba(198,241,53,0.18)",
                    border: "2px solid var(--volt-500)",
                    color: "var(--volt-500)",
                    fontWeight: 900,
                    cursor: addingId === currentUser.uid ? "wait" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.9375rem",
                  }}
                >
                  {addingId === currentUser.uid ? "Joining…" : "Join Session"}
                </button>
              )}
              <a
                href={`/sessions/${sessionId}/live`}
                style={{
                  height: 48,
                  padding: "0 1rem",
                  borderRadius: "var(--r-lg)",
                  background: "var(--volt-500)",
                  color: "var(--ink-800)",
                  fontWeight: 900,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  boxShadow: "var(--shadow-volt)",
                  textDecoration: "none",
                }}
              >
                Live Console
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: "0.75rem",
          }}>
            {[
              { label: "Players", value: registeredCount },
              { label: "Courts", value: activeCourts.length || session.courtCount },
              { label: "Duration", value: `${session.durationMinutes} min` },
              { label: "Scoring", value: formatScoringMode(session.scoringMode) },
            ].map((stat) => (
              <div key={stat.label} style={{
                background: "rgba(246,248,244,0.08)",
                border: "1px solid rgba(246,248,244,0.12)",
                borderRadius: "var(--r-xl)",
                padding: "1rem",
                minWidth: 0,
              }}>
                <div style={{
                  fontFamily: "var(--font-display-tight)",
                  fontSize: typeof stat.value === "number" ? "2rem" : "1rem",
                  fontWeight: 900,
                  color: "var(--volt-500)",
                  lineHeight: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {statValue(stat.value)}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "rgba(246,248,244,0.55)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 6 }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Score Link + Courts row */}
      <section style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
        gap: "1rem",
      }}>
        {canManage && boardPath && (
          <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-xl)",
            padding: "1rem",
            boxShadow: "var(--shadow-sm)",
            animation: "pb-rise 400ms 80ms var(--ease-out) both",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.875rem" }}>
              <div style={{ width: 40, height: 40, borderRadius: "var(--r-lg)", background: "var(--volt-500)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-800)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <path d="M14 14h3v3M20 20h.01M17 20h.01M20 17h.01" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
                  Player Board
                </h2>
                <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>Players see their matches — no sign-in.</p>
              </div>
              <button
                type="button"
                onClick={handleToggleBoard}
                aria-label={boardEnabled ? "Disable player board" : "Enable player board"}
                style={{ width: 44, height: 26, borderRadius: "var(--r-pill)", background: boardEnabled ? "var(--volt-500)" : "var(--n-300)", border: "none", cursor: "pointer", position: "relative", flexShrink: 0, transition: "background 150ms" }}
              >
                <span style={{ position: "absolute", top: 3, left: boardEnabled ? 20 : 3, width: 20, height: 20, borderRadius: "50%", background: "white", transition: "left 150ms" }} />
              </button>
            </div>

            {boardEnabled ? (
              <div style={{ display: "flex", gap: "0.875rem", alignItems: "center" }}>
                <div style={{ flexShrink: 0, background: "#fff", padding: 8, borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
                  <QRCode value={boardUrl} size={112} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.3rem" }}>Scan or share</div>
                  <a href={boardPath} style={{ display: "block", color: "var(--emerald-600)", fontWeight: 800, fontSize: "0.8125rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {boardUrl}
                  </a>
                  <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.6rem" }}>
                    <button type="button" onClick={handleShareBoardLink} style={{ flex: 1, height: 38, border: "none", borderRadius: "var(--r-md)", background: "var(--ink-800)", color: "var(--volt-500)", fontWeight: 900, fontSize: "0.8125rem", cursor: "pointer" }}>
                      Share
                    </button>
                    <button type="button" onClick={handleCopyBoardLink} aria-label="Copy board link" style={{ width: 42, height: 38, border: "none", borderRadius: "var(--r-md)", background: "var(--surface-sunken)", color: "var(--ink-800)", fontWeight: 900, fontSize: "0.75rem", cursor: "pointer" }}>
                      {boardCopied ? "✓" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ color: "var(--text-3)", fontSize: "0.8125rem" }}>The board is off. Turn it on to share a live see-your-matches link.</p>
            )}
          </div>
        )}

        {canManage && (
          <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-xl)",
            padding: "1rem",
            boxShadow: "var(--shadow-sm)",
            animation: "pb-rise 400ms 90ms var(--ease-out) both",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.875rem" }}>
              <div style={{ width: 40, height: 40, borderRadius: "var(--r-lg)", background: "var(--volt-500)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-800)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
                  Score Link
                </h2>
                <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>Courts enter results without signing in.</p>
              </div>
              <button
                type="button"
                onClick={handleToggleScoreLink}
                aria-label={session.scoreLinkEnabled ? "Disable score link" : "Enable score link"}
                style={{
                  width: 44,
                  height: 26,
                  borderRadius: "var(--r-pill)",
                  background: session.scoreLinkEnabled ? "var(--volt-500)" : "var(--n-300)",
                  border: "none",
                  cursor: "pointer",
                  position: "relative",
                  flexShrink: 0,
                  transition: "background 150ms",
                }}
              >
                <span style={{
                  position: "absolute",
                  top: 3,
                  left: session.scoreLinkEnabled ? 20 : 3,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "white",
                  transition: "left 150ms",
                }} />
              </button>
            </div>

            {scoreLinkPath && (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.625rem", alignItems: "center", background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "0.625rem" }}>
                <a href={scoreLinkPath} style={{ color: "var(--emerald-600)", fontWeight: 800, fontSize: "0.875rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {typeof window !== "undefined" ? `${window.location.origin}${scoreLinkPath}` : scoreLinkPath}
                </a>
                <button
                  type="button"
                  onClick={handleCopyScoreLink}
                  disabled={!session.scoreLinkEnabled}
                  style={{ width: 48, height: 48, border: "none", borderRadius: "var(--r-md)", background: session.scoreLinkEnabled ? "var(--ink-800)" : "var(--n-200)", color: "var(--volt-500)", display: "grid", placeItems: "center", cursor: session.scoreLinkEnabled ? "pointer" : "not-allowed" }}
                  aria-label="Copy score link"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: canManage ? "0.875rem" : 0 }}>
            {activeCourts.map((court) => (
              <span key={court.courtId} style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "var(--r-pill)",
                background: "var(--surface-sunken)",
                border: "1px solid var(--border)",
                color: "var(--text-2)",
                fontSize: "0.875rem",
                fontWeight: 800,
              }}>
                {court.name}
              </span>
            ))}
            {activeCourts.length === 0 && <span style={{ color: "var(--text-3)" }}>No active courts.</span>}
          </div>
          {canManage && session.status !== "completed" && session.status !== "cancelled" && (
            <form onSubmit={handleAddCourt} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                className="pb-input"
                type="text"
                placeholder={`Court ${activeCourts.length + 1} name…`}
                value={addCourtName}
                onChange={(e) => setAddCourtName(e.target.value)}
                style={{ flex: 1, height: 38, borderRadius: "var(--r-md)", fontSize: "0.875rem" }}
              />
              <button
                type="submit"
                disabled={!addCourtName.trim() || addCourtLoading}
                style={{
                  height: 38, padding: "0 0.875rem", border: "none",
                  borderRadius: "var(--r-md)", background: "var(--ink-800)",
                  color: "var(--volt-500)", fontWeight: 900, fontSize: "0.8125rem",
                  opacity: !addCourtName.trim() || addCourtLoading ? 0.5 : 1,
                  cursor: !addCourtName.trim() || addCourtLoading ? "default" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {addCourtLoading ? "Adding…" : "+ Add Court"}
              </button>
            </form>
          )}
          {addCourtError && (
            <p style={{ color: "var(--danger)", fontSize: "0.8125rem", marginTop: "0.5rem", fontWeight: 700 }}>{addCourtError}</p>
          )}
        </div>
      </section>

      {/* Players + Team Roster */}
      <main style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
        gap: "1rem",
        alignItems: "start",
      }}>
        <section style={{ animation: "pb-rise 400ms 120ms var(--ease-out) both" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.625rem" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
              Players
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)" }}>
              {registeredCount} joined
            </span>
          </div>

          {activePlayers.length === 0 ? (
            <div style={{
              background: "var(--surface)",
              border: "2px dashed var(--border)",
              borderRadius: "var(--r-xl)",
              padding: "2rem 1.25rem",
              textAlign: "center",
            }}>
              <h3 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, marginBottom: "0.375rem" }}>
                No players yet
              </h3>
              <p style={{ color: "var(--text-2)" }}>
                {canJoin
                  ? "Hit \"Join Session\" above to add yourself."
                  : canManage
                    ? "Add team members from the roster on the right."
                    : "The organiser hasn't added players yet."}
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "0.625rem" }}>
              {players.map((player, index) => {
                const initial = player.displayName?.charAt(0)?.toUpperCase() ?? "?";
                const isRemoved = player.status === "removed" || player.status === "left";
                return (
                  <div key={player.playerId} data-testid="session-player" style={{
                    display: "grid",
                    gridTemplateColumns: "auto minmax(0, 1fr) auto",
                    alignItems: "center",
                    gap: "0.75rem",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-xl)",
                    padding: "0.75rem",
                    boxShadow: "var(--shadow-xs)",
                    opacity: isRemoved ? 0.45 : 1,
                    animation: `pb-rise 400ms ${150 + index * 30}ms var(--ease-out) both`,
                  }}>
                    <div style={{
                      width: 38,
                      height: 38,
                      borderRadius: "var(--r-md)",
                      background: "var(--ink-800)",
                      color: "var(--volt-500)",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 900,
                    }}>
                      {initial}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {player.displayName}
                      </div>
                      <div style={{ color: "var(--text-3)", fontSize: "0.8125rem" }}>
                        {titleCase(player.skillLevel)} · {titleCase(player.participantType)}
                      </div>
                    </div>
                    <span style={{
                      padding: "4px 8px",
                      borderRadius: "var(--r-pill)",
                      background: "var(--surface-sunken)",
                      color: "var(--text-2)",
                      fontSize: "0.75rem",
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}>
                      {titleCase(player.status)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {isGroupMember && session.status !== "completed" && session.status !== "cancelled" && (
          <section style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-xl)",
            padding: "1rem",
            boxShadow: "var(--shadow-sm)",
            animation: "pb-rise 400ms 150ms var(--ease-out) both",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "0.875rem" }}>
              <div>
                <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
                  Not joined yet
                </h2>
                <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>
                  {canManage ? "Tap Add to include them in this session." : "Squad members who haven't joined this session."}
                </p>
              </div>
              <span style={{
                minWidth: 34,
                height: 34,
                padding: "0 0.65rem",
                borderRadius: "var(--r-pill)",
                background: "var(--surface-sunken)",
                border: "1px solid var(--border)",
                color: "var(--text-2)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: "0.875rem",
              }}>
                {rosterNotInSession.length}
              </span>
            </div>

            {addError && (
              <div style={{
                background: "var(--danger-bg)",
                color: "var(--danger)",
                borderRadius: "var(--r-md)",
                padding: "0.625rem 0.875rem",
                fontSize: "0.875rem",
                fontWeight: 700,
                marginBottom: "0.75rem",
              }}>
                {addError}
              </div>
            )}

            {rosterNotInSession.length === 0 ? (
              <div style={{
                border: "2px dashed var(--border)",
                borderRadius: "var(--r-xl)",
                padding: "1.5rem",
                color: "var(--text-2)",
                textAlign: "center",
              }}>
                Everyone's in — all squad members have joined! 🎉
              </div>
            ) : (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {rosterNotInSession.map((gp) => {
                  const initial = ((gp.displayName ?? "") || "?").charAt(0).toUpperCase();
                  const isSelf = currentUser?.uid === gp.id;
                  const showButton = canManage || isSelf;
                  return (
                    <div key={gp.id} data-testid="roster-row" data-player-name={gp.displayName ?? ""} style={{
                      display: "grid",
                      gridTemplateColumns: "auto minmax(0, 1fr) auto",
                      alignItems: "center",
                      gap: "0.75rem",
                      background: "var(--surface-sunken)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-xl)",
                      padding: "0.625rem 0.75rem",
                    }}>
                      <div style={{
                        width: 34,
                        height: 34,
                        borderRadius: "var(--r-md)",
                        background: isSelf ? "var(--volt-500)" : "var(--n-200)",
                        color: isSelf ? "var(--ink-800)" : "var(--text-2)",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 900,
                        fontSize: "0.875rem",
                        flexShrink: 0,
                      }}>
                        {initial}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "0.9375rem" }}>
                          {gp.displayName ?? "Unknown"}
                          {isSelf && (
                            <span style={{ marginLeft: "0.375rem", fontSize: "0.75rem", color: "var(--text-3)", fontWeight: 700 }}>you</span>
                          )}
                        </div>
                        {gp.skillLevel && gp.skillLevel !== "unknown" && (
                          <div style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>{titleCase(gp.skillLevel)}</div>
                        )}
                      </div>
                      {showButton && (
                        <button
                          type="button"
                          data-testid="roster-add-btn"
                          disabled={addingId === gp.id}
                          onClick={() => handleAddToSession(gp.id)}
                          style={{
                            height: 34,
                            padding: "0 0.75rem",
                            border: "none",
                            borderRadius: "var(--r-md)",
                            background: addingId === gp.id ? "var(--n-200)" : "var(--ink-800)",
                            color: "var(--volt-500)",
                            fontWeight: 900,
                            cursor: addingId === gp.id ? "wait" : "pointer",
                            fontSize: "0.8125rem",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {addingId === gp.id ? "Adding…" : isSelf ? "Join" : "Add"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
