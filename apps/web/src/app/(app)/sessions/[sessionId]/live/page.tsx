"use client";

import { use, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { generateSchedule, startSession, pauseSession, resumeSession, completeSession, watchMatches, watchLeaderboard, watchEngineState, deleteSession } from "@/lib/sessions/live";
import { rebalanceSession, updatePlayerStatus, addLatePlayer, swapPlayers, disableCourt, markPlayerInjured, addGuestPlayerToSession } from "@/lib/sessions/rebalance";
import { watchSession, watchSessionPlayers } from "@/lib/sessions/sessions";
import { watchGroupPlayers } from "@/lib/players/players";
import { useGroupRole } from "@/lib/groups/useGroupRole";
import { useAuth } from "@/lib/auth/useAuth";
import { canCorrectCompletedScore, canCreateSession, canEnterScore, canGenerateSchedule, canManageSessionPlayers } from "@picklebaddies/domain";
import { shareUrl } from "@/lib/config/site";
import { logEvent } from "@/lib/analytics/events";
import { enterScore } from "@/lib/sessions/scoring";
import { QRCode } from "@/components/QRCode";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import type { Session, SessionPlayer } from "@/lib/sessions/types";
import { formatSessionStatus, formatScoringMode } from "@/lib/format/status";
import { addGroupMemberToSession } from "@/server/sessions/players";
import { ensureSessionRsvpLink } from "@/server/sessions/actions";

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function scoreLabel(payload: any, winnerTeam: "A" | "B" | null | undefined): string {
  if (typeof payload?.teamAScore === "number" && typeof payload?.teamBScore === "number") {
    return `${payload.teamAScore}-${payload.teamBScore}`;
  }
  return winnerTeam ? `Team ${winnerTeam} won` : "No score";
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
  const [showBoardModal, setShowBoardModal] = useState(false);
  const [boardCopied, setBoardCopied] = useState(false);
  const [rsvpCopied, setRsvpCopied] = useState(false);
  const [isCreatingRsvpLink, setIsCreatingRsvpLink] = useState(false);
  const [selectedGroupPlayerId, setSelectedGroupPlayerId] = useState("");
  const [addingGroupPlayerId, setAddingGroupPlayerId] = useState<string | null>(null);
  const [isAddingAllPlayers, setIsAddingAllPlayers] = useState(false);
  const [groupPlayers, setGroupPlayers] = useState<Array<{ id: string; displayName: string; userId?: string | null }>>([]);
  const [sessionGuestName, setSessionGuestName] = useState("");
  const [sessionGuestSkill, setSessionGuestSkill] = useState("unknown");
  const [isAddingSessionGuest, setIsAddingSessionGuest] = useState(false);

  const [engineState, setEngineState] = useState<any | null>(null);
  const [pointInputs, setPointInputs] = useState<Record<string, { a: string; b: string }>>({});
  const [scoringMatchIds, setScoringMatchIds] = useState<Set<string>>(() => new Set());
  const [editingScoreMatchIds, setEditingScoreMatchIds] = useState<Set<string>>(() => new Set());
  const scoringMatchIdsRef = useRef<Set<string>>(new Set());

  const leaderboardLogged = useRef(false);
  const { user } = useAuth();
  const { confirm: requestConfirmation, confirmationDialog } = useConfirmDialog();

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

  useEffect(() => {
    setScoringMatchIds((current) => {
      if (current.size === 0) return current;
      const stillOpen = new Set(
        matches
          .filter((match) => match.status === "scheduled" || match.status === "in_progress")
          .map((match) => match.id),
      );
      const next = new Set([...current].filter((matchId) => stillOpen.has(matchId)));
      scoringMatchIdsRef.current = next;
      return next.size === current.size ? current : next;
    });
  }, [matches]);

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
  // A completed session is a record, not a console. Anything that implies more
  // games are coming — court cards, the bench strip — is noise once it is done.
  const isCompleted = session.status === "completed";
  const canManageLive = canManageSessionPlayers(role);
  const canScore = canEnterScore(role);
  const canControlSession = canCreateSession(role);
  const canGenerate = canGenerateSchedule(role);

  const boardEnabled = session.boardEnabled !== false;
  const boardPath = session.scoreCode ? `/board/${session.scoreCode}` : null;
  const boardUrl = boardPath ? shareUrl(boardPath) : "";
  const rsvpPath = session.rsvpCode ? `/rsvp/${session.rsvpCode}` : null;
  const rsvpUrl = rsvpPath ? shareUrl(rsvpPath) : "";

  const handleShareBoard = async () => {
    if (!boardUrl) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
          title: `${session.name} — player board`,
          text: "See your matches:",
          url: boardUrl,
        });
        return;
      } catch {
        /* cancelled / unsupported — fall through */
      }
    }
    await navigator.clipboard?.writeText(boardUrl);
    setBoardCopied(true);
    setTimeout(() => setBoardCopied(false), 1600);
  };

  const handleCopyRsvpLink = async () => {
    setActionError(null);
    if (rsvpUrl) {
      await navigator.clipboard?.writeText(rsvpUrl);
      setRsvpCopied(true);
      setTimeout(() => setRsvpCopied(false), 1600);
      return;
    }

    if (isCreatingRsvpLink) return;
    setIsCreatingRsvpLink(true);
    try {
      const result = await ensureSessionRsvpLink(sessionId);
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      const nextPath = `/rsvp/${result.data.rsvpCode}`;
      await navigator.clipboard?.writeText(shareUrl(nextPath));
      setSession((current) => current ? { ...current, rsvpCode: result.data.rsvpCode, rsvpEnabled: true } : current);
      setRsvpCopied(true);
      setTimeout(() => setRsvpCopied(false), 1600);
    } catch (error: any) {
      setActionError(error?.message ?? "Could not create the RSVP link.");
    } finally {
      setIsCreatingRsvpLink(false);
    }
  };

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
        const confirmed = await requestConfirmation({
          title: "Update the next games?",
          description: "Current games and completed scores will stay put. New games will use the updated player list.",
          confirmLabel: "Update games",
        });
        if (confirmed) {
          await handleRebalance(status === "left" || status === "removed" || status === "no_show" ? "player_removed" : "settings_changed");
        }
      }
    } catch (e: any) { setActionError(e.message); }
  };

  const handleMarkInjured = async (sessionPlayerId: string, displayName: string) => {
    const confirmed = await requestConfirmation({
      title: `Step ${displayName} out?`,
      description: "They will not be selected for more games in this session. Current and completed games stay unchanged.",
      confirmLabel: "Step out",
      tone: "danger",
    });
    if (!confirmed) return;
    setActionError(null);
    try {
      const res = await markPlayerInjured({ sessionId, sessionPlayerId });
      const data = res.data;
      if (data.rebalanceRecommended) {
        await handleRebalance("player_removed");
      }
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

  const handleAddSessionGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionGuestName.trim() || isAddingSessionGuest) return;
    const addedGuestName = sessionGuestName.trim();
    setIsAddingSessionGuest(true);
    setActionError(null);
    try {
      const res = await addGuestPlayerToSession({ sessionId, displayName: sessionGuestName, skillLevel: sessionGuestSkill });
      setSessionGuestName("");
      setSessionGuestSkill("unknown");
      if (res.data.rebalanceRecommended) {
        const confirmed = await requestConfirmation({
          title: `Add ${addedGuestName} to the next games?`,
          description: "Current games will stay put. New games will include the updated player list.",
          confirmLabel: "Update games",
        });
        if (confirmed) {
          await handleRebalance("player_added");
        }
      }
    } catch (err: any) { setActionError(err.message); }
    finally { setIsAddingSessionGuest(false); }
  };

  const handleDeleteSession = async () => {
    const confirmed = await requestConfirmation({
      title: `Cancel ${session.name}?`,
      description: "The session will close and can no longer be played. Completed scores will stay recorded.",
      confirmLabel: "Cancel session",
      tone: "danger",
    });
    if (!confirmed) return;
    setActionError(null);
    try {
      await deleteSession({ sessionId });
      window.location.href = `/groups/${session.groupId}`;
    } catch (err: any) { setActionError(err.message); }
  };

  const handleDisableCourt = async (courtId: string, courtName: string) => {
    const confirmed = await requestConfirmation({
      title: `Disable ${courtName}?`,
      description: "No more games will be assigned to this court. Current and completed games stay unchanged.",
      confirmLabel: "Disable court",
      tone: "danger",
    });
    if (!confirmed) return;
    setActionError(null);
    try {
      const res = await disableCourt({ sessionId, courtId });
      if ((res.data as any).rebalanceRecommended) {
        const updateGames = await requestConfirmation({
          title: "Update the next games?",
          description: "New games will be redistributed across the remaining courts.",
          confirmLabel: "Update games",
        });
        if (updateGames) {
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

  // Points are always optional — a winner tap alone is enough to finish a
  // game; if valid points were entered, the winner is derived from them.
  const submitWinner = async (matchId: string, winnerTeam: "A" | "B") => {
    if (scoringMatchIdsRef.current.has(matchId)) return;
    scoringMatchIdsRef.current.add(matchId);
    setScoringMatchIds((current) => new Set(current).add(matchId));
    setActionError(null);
    const pts = pointInputs[matchId];
    const a = pts?.a ? Number(pts.a) : undefined;
    const b = pts?.b ? Number(pts.b) : undefined;
    const hasValidPoints = typeof a === "number" && !Number.isNaN(a) && typeof b === "number" && !Number.isNaN(b) && a !== b;
    const payload = hasValidPoints ? { teamAScore: a!, teamBScore: b! } : { winnerTeam };
    try {
      await enterScore(sessionId, matchId, payload as any);
      setPointInputs((prev) => {
        const next = { ...prev };
        delete next[matchId];
        return next;
      });
      setEditingScoreMatchIds((current) => {
        if (!current.has(matchId)) return current;
        const next = new Set(current);
        next.delete(matchId);
        return next;
      });
      scoringMatchIdsRef.current.delete(matchId);
      setScoringMatchIds((current) => {
        const next = new Set(current);
        next.delete(matchId);
        return next;
      });
    } catch (err: any) {
      setActionError(err.message);
      scoringMatchIdsRef.current.delete(matchId);
      setScoringMatchIds((current) => {
        const next = new Set(current);
        next.delete(matchId);
        return next;
      });
    }
  };

  const startScoreEdit = (match: any) => {
    if (!canCorrectCompletedScore(role, session!.status) || match.status !== "completed") return;
    const payload = match.scorePayload;
    setPointInputs((current) => ({
      ...current,
      [match.id]: {
        a: typeof payload?.teamAScore === "number" ? String(payload.teamAScore) : "",
        b: typeof payload?.teamBScore === "number" ? String(payload.teamBScore) : "",
      },
    }));
    setEditingScoreMatchIds((current) => new Set(current).add(match.id));
  };

  const cancelScoreEdit = (matchId: string) => {
    setEditingScoreMatchIds((current) => {
      const next = new Set(current);
      next.delete(matchId);
      return next;
    });
    setPointInputs((current) => {
      const next = { ...current };
      delete next[matchId];
      return next;
    });
  };

  const activeCourts = (session.courts ?? []).filter((c) => c.isActive);
  const displayNameById = new Map(players.map((p) => [p.playerId, p.displayName]));

  const activePlayers = players.filter((p) => p.status === "active" || p.status === "checked_in");
  const otherPlayers = players.filter((p) => p.status !== "active" && p.status !== "checked_in");
  const sessionPlayerIds = new Set(players.flatMap((player) => [player.id, player.playerId]));
  const availableGroupPlayers = groupPlayers.filter(
    (player) => !sessionPlayerIds.has(player.id) && !sessionPlayerIds.has(player.userId ?? "__none__"),
  );

  const scheduledMatches = matches.filter((m) => m.status === "scheduled");
  const scheduledByCourtId = new Map(scheduledMatches.map((m) => [m.courtId, m]));
  const doneMatches = matches.filter((m) => m.status === "completed").sort((a, b) => (b.roundNumber ?? 0) - (a.roundNumber ?? 0));
  const lockedMatches = matches.filter((match) => match.status === "completed" || match.status === "cancelled" || match.isLocked).length;

  // Who's on the bench right now: active players not currently in a scheduled match.
  const playingNowIds = new Set<string>(scheduledMatches.flatMap((m) => [...(m.teamAIds ?? []), ...(m.teamBIds ?? [])]));
  const benchPlayers = activePlayers.filter((p) => !playingNowIds.has(p.playerId));

  // Games played per active player (from the live leaderboard) → fairness at a glance.
  const gamesById = new Map<string, number>(leaderboard.map((r: any) => [r.playerId, r.gamesPlayed ?? 0]));
  const gamesFor = (id: string) => gamesById.get(id) ?? 0;

  // Is the signed-in user already in this session as a player?
  const currentUserInSession = user
    ? players.some((p) => p.playerId === user.uid)
    : false;

  // The current user's group player record (needed to self-join).
  const currentUserGroupPlayer = user
    ? groupPlayers.find((p) => p.userId === user.uid)
    : null;

  const handleSelfJoin = async () => {
    if (!currentUserGroupPlayer) return;
    setActionError(null);
    try {
      const res = await addGroupMemberToSession(sessionId, currentUserGroupPlayer.id);
      if (!res.ok) throw new Error(res.message);
      if (isLive) await handleRebalance("player_added");
    } catch (e: any) { setActionError(e.message); }
  };

  const handleAddGroupPlayer = async (player: { id: string; displayName: string }) => {
    setAddingGroupPlayerId(player.id);
    setActionError(null);
    try {
      const result = await addGroupMemberToSession(sessionId, player.id);
      if (!result.ok) throw new Error(result.message);
      if (isLive) await handleRebalance("player_added");
    } catch (e: any) {
      setActionError(e.message || "Could not add player.");
    } finally {
      setAddingGroupPlayerId(null);
    }
  };

  const handleAddAllGroupPlayers = async () => {
    if (availableGroupPlayers.length === 0 || isAddingAllPlayers) return;
    setIsAddingAllPlayers(true);
    setActionError(null);
    const results = await Promise.allSettled(
      availableGroupPlayers.map((player) => addGroupMemberToSession(sessionId, player.id)),
    );
    const failed = results.filter(
      (result) => result.status === "rejected" || (result.status === "fulfilled" && !result.value.ok),
    );
    if (failed.length > 0) {
      setActionError(`${failed.length} player${failed.length === 1 ? "" : "s"} could not be added. Try adding them individually.`);
    }
    if (isLive && failed.length < results.length) await handleRebalance("player_added");
    setIsAddingAllPlayers(false);
  };
  const activeGameCounts = activePlayers.map((p) => gamesFor(p.playerId));
  const gamesSpread = activeGameCounts.length > 0 ? Math.max(...activeGameCounts) - Math.min(...activeGameCounts) : null;

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
    const isScoring = scoringMatchIds.has(m.id);
    const isEditing = editingScoreMatchIds.has(m.id);
    const canEditScore = m.status === "completed" && canCorrectCompletedScore(role, session!.status);
    const inMatch = new Set<string>([
      ...m.teamA.map((p: any) => p.playerId),
      ...m.teamB.map((p: any) => p.playerId),
    ]);
    const assignedToAnotherCourt = new Set<string>(
      scheduledMatches
        .filter((match) => match.id !== m.id)
        .flatMap((match) => [...(match.teamAIds ?? []), ...(match.teamBIds ?? [])]),
    );
    const eligibleForSwap = players.filter(
      (p) => !inMatch.has(p.playerId)
        && !assignedToAnotherCourt.has(p.playerId)
        && (p.status === "active" || p.status === "checked_in")
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
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{
              padding: "4px 8px",
              borderRadius: "var(--r-pill)",
              background: m.winnerTeam ? "rgba(198,241,53,0.18)" : isLocked ? "var(--n-200)" : matchTone.bg,
              color: m.winnerTeam ? "var(--volt-600)" : isLocked ? "var(--text-3)" : matchTone.fg,
              fontSize: "0.75rem",
              fontWeight: 900,
              whiteSpace: "nowrap",
            }}>
              {m.winnerTeam ? `🏆 Team ${m.winnerTeam} Won` : isLocked ? "Done" : m.status === "scheduled" ? "Current" : formatSessionStatus(m.status)}
            </span>
            {m.scoreEditedByName && (
              <span
                tabIndex={0}
                role="img"
                aria-label={`Score corrected by ${m.scoreEditedByName}. Previous result ${scoreLabel(m.scoreEditedFrom?.payload, m.scoreEditedFrom?.winnerTeam)}; current result ${scoreLabel(m.scorePayload, m.winnerTeam)}.`}
                title={`Score corrected by ${m.scoreEditedByName}: ${scoreLabel(m.scoreEditedFrom?.payload, m.scoreEditedFrom?.winnerTeam)} to ${scoreLabel(m.scorePayload, m.winnerTeam)}`}
                style={{ color: "var(--text-2)", display: "inline-flex", cursor: "help" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5" />
                  <path d="M12 8h.01" />
                </svg>
              </span>
            )}
          </div>
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: "0.75rem",
          alignItems: "stretch",
          marginBottom: "0.875rem",
        }}>
          <div style={{
            background: m.winnerTeam === "A" ? "rgba(198,241,53,0.18)" : "var(--surface-sunken)",
            border: m.winnerTeam === "A" ? "1.5px solid var(--volt-500)" : "1.5px solid transparent",
            borderRadius: "var(--r-lg)", padding: "0.875rem", minWidth: 0,
          }}>
            <p style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: m.winnerTeam === "A" ? "var(--volt-600)" : "var(--text-3)", marginBottom: "0.5rem" }}>
              Team A {m.winnerTeam === "A" && "🏆"}
            </p>
            {m.teamA.map((p: any) => renderSwap(p, false))}
          </div>
          <div style={{ display: "grid", placeItems: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)", fontWeight: 900 }}>VS</div>
          <div style={{
            background: m.winnerTeam === "B" ? "rgba(198,241,53,0.18)" : "var(--surface-sunken)",
            border: m.winnerTeam === "B" ? "1.5px solid var(--volt-500)" : "1.5px solid transparent",
            borderRadius: "var(--r-lg)", padding: "0.875rem", minWidth: 0, textAlign: "right",
          }}>
            <p style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.375rem", fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: m.winnerTeam === "B" ? "var(--volt-600)" : "var(--text-3)", marginBottom: "0.5rem" }}>
              {m.winnerTeam === "B" && "🏆"} Team B
            </p>
            {m.teamB.map((p: any) => renderSwap(p, true))}
          </div>
        </div>

        {canEditScore && !isEditing && (
          <button type="button" onClick={() => startScoreEdit(m)} style={{ ...secondaryActionStyle, width: "100%" }}>
            Edit score
          </button>
        )}

        {canScore && (!isLocked || isEditing) && (() => {
          const pts = pointInputs[m.id];
          const a = pts?.a ? Number(pts.a) : undefined;
          const b = pts?.b ? Number(pts.b) : undefined;
          const hasValidPoints = typeof a === "number" && !Number.isNaN(a) && typeof b === "number" && !Number.isNaN(b) && a !== b;
          if (isScoring) {
            return (
              <div
                role="status"
                aria-live="polite"
                style={{
                  minHeight: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.625rem",
                  borderRadius: "var(--r-md)",
                  background: "var(--ink-800)",
                  color: "var(--volt-500)",
                  fontWeight: 900,
                }}
              >
                <span className="pb-score-loader" aria-hidden="true" />
                {isEditing ? "Saving correction..." : "Loading next game..."}
              </div>
            );
          }
          return (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {session!.scoringMode === "points" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    data-testid="score-team-a-input" type="number" placeholder="Points"
                    disabled={isScoring}
                    value={pts?.a ?? ""}
                    onChange={(e) => setPointInputs((prev) => ({ ...prev, [m.id]: { a: e.target.value, b: prev[m.id]?.b ?? "" } }))}
                    className="pb-input" style={{ height: 42, borderRadius: "var(--r-md)", padding: "0 0.625rem" }}
                  />
                  <span style={{ textAlign: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)", fontWeight: 900 }}>VS</span>
                  <input
                    data-testid="score-team-b-input" type="number" placeholder="Points"
                    disabled={isScoring}
                    value={pts?.b ?? ""}
                    onChange={(e) => setPointInputs((prev) => ({ ...prev, [m.id]: { a: prev[m.id]?.a ?? "", b: e.target.value } }))}
                    className="pb-input" style={{ height: 42, borderRadius: "var(--r-md)", padding: "0 0.625rem" }}
                  />
                </div>
              )}
              {hasValidPoints ? (
                <button data-testid="save-score-btn" disabled={isScoring} onClick={() => submitWinner(m.id, a! > b! ? "A" : "B")} style={{ ...primaryActionStyle, cursor: isScoring ? "default" : primaryActionStyle.cursor, opacity: isScoring ? 0.65 : 1 }}>
                  {isEditing ? "Save correction" : "Save Score"} — {a! > b! ? "A" : "B"} Wins
                </button>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  <button data-testid="score-winner-a" disabled={isScoring} onClick={() => submitWinner(m.id, "A")} style={{ ...primaryActionStyle, cursor: isScoring ? "default" : primaryActionStyle.cursor, opacity: isScoring ? 0.65 : 1 }}>{isEditing ? "Correct to A" : "A Wins"}</button>
                  <button data-testid="score-winner-b" disabled={isScoring} onClick={() => submitWinner(m.id, "B")} style={{ ...primaryActionStyle, cursor: isScoring ? "default" : primaryActionStyle.cursor, opacity: isScoring ? 0.65 : 1 }}>{isEditing ? "Correct to B" : "B Wins"}</button>
                </div>
              )}
              {isEditing && !isScoring && (
                <button type="button" onClick={() => cancelScoreEdit(m.id)} style={secondaryActionStyle}>
                  Cancel
                </button>
              )}
            </div>
          );
        })()}
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
                {formatSessionStatus(session.status)}
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
                Live console · {formatScoringMode(session.scoringMode)} scoring · courts run independently
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
              { label: "Games played", value: matches.filter((m) => m.status === "completed").length },
              { label: "On bench", value: benchPlayers.length },
              ...(gamesSpread !== null ? [{ label: "Fairness", value: gamesSpread <= 1 ? "Even" : `±${gamesSpread}` }] : []),
            ].map((stat) => {
              const isFair = stat.label === "Fairness";
              const good = gamesSpread !== null && gamesSpread <= 1;
              return (
              <div key={stat.label} data-testid={isFair ? "fairness-chip" : undefined} style={{
                background: isFair ? (good ? "rgba(198,241,53,0.18)" : "rgba(255,200,50,0.18)") : "rgba(246,248,244,0.08)",
                border: isFair ? (good ? "1px solid rgba(198,241,53,0.35)" : "1px solid rgba(255,200,50,0.35)") : "1px solid rgba(246,248,244,0.12)",
                borderRadius: "var(--r-xl)",
                padding: "1rem",
              }}>
                <div style={{ fontFamily: "var(--font-display-tight)", fontSize: "2rem", fontWeight: 900, color: isFair ? (good ? "var(--volt-500)" : "#ffc832") : "var(--volt-500)", lineHeight: 1 }}>
                  {stat.value}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "rgba(246,248,244,0.55)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 6 }}>
                  {isFair ? "🟢 Rotation Health" : stat.label}
                </div>
              </div>
              );
            })}
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

      {/* Session control */}
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
              {session.name}
            </h2>
            <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>
              {session.status === "active" || session.status === "paused"
                ? "Score games, manage courts and players."
                : session.status === "completed"
                  ? "Session finished — owners can correct score mistakes."
                  : "Get players on court, then hit Start Playing."}
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "flex-end" }}>
            {canManageLive && (
              <button
                type="button"
                onClick={handleCopyRsvpLink}
                disabled={isCreatingRsvpLink}
                title={rsvpUrl || "Create and copy RSVP link"}
                style={{
                  height: 42,
                  padding: "0 0.875rem",
                  borderRadius: "var(--r-md)",
                  background: "var(--volt-500)",
                  color: "var(--ink-800)",
                  border: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontWeight: 900,
                  cursor: isCreatingRsvpLink ? "default" : "pointer",
                  opacity: isCreatingRsvpLink ? 0.6 : 1,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                {isCreatingRsvpLink ? "Creating..." : rsvpCopied ? "Copied" : rsvpPath ? "RSVP Link" : "Create RSVP"}
              </button>
            )}
            {boardEnabled && boardPath && (
              <button
                type="button"
                onClick={() => setShowBoardModal(true)}
                style={{
                  height: 42,
                  padding: "0 0.875rem",
                  borderRadius: "var(--r-md)",
                  background: "var(--ink-800)",
                  color: "var(--volt-500)",
                  border: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <path d="M14 14h3v3M20 20h.01M17 20h.01M20 17h.01" />
                </svg>
                Show Board
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem" }}>
        {canControlSession && (session.status === "draft" || session.status === "scheduled") && (
          <button data-testid="start-session-btn" onClick={handleStart} style={primaryActionStyle}>Start Playing</button>
        )}
        {canControlSession && session.status === "active" && (
          <button data-testid="complete-session-btn" onClick={() => completeSession({ sessionId })} style={{ ...secondaryActionStyle, color: "var(--danger)" }}>Complete Session</button>
        )}
        {canControlSession && session.status === "paused" && (
          <button onClick={() => resumeSession({ sessionId })} style={primaryActionStyle}>Resume Playing</button>
        )}
        {canControlSession && (
          <button onClick={handleDeleteSession} style={{ ...secondaryActionStyle, color: "var(--danger)", border: "1px solid rgba(240,62,62,0.3)" }}>
            Cancel / Delete Session
          </button>
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

      <main className="pb-live-main-grid">
        {/* Court-centric live board — each court shows its current match, filled
            automatically the instant it frees up. A bench strip answers "who's
            sitting out right now" and finished games sit below as history. */}
        <section style={{ animation: "pb-rise 400ms 120ms var(--ease-out) both" }}>
          {matches.length === 0 && !isLive && !isCompleted && canManageLive ? (
            <div style={{
              background: "var(--surface)",
              border: "2px dashed var(--border)",
              borderRadius: "var(--r-xl)",
              padding: "1.25rem",
            }}>
              <div style={{ marginBottom: "1rem" }}>
                <h3 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, marginBottom: "0.25rem" }}>
                  Get players on court
                </h3>
                <p style={{ color: "var(--text-2)", fontSize: "0.875rem" }}>Build tonight&apos;s lineup, then start when at least four players are ready.</p>
              </div>

              <div style={{ paddingBottom: "1rem", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
                  In this session ({activePlayers.length})
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.625rem" }}>
                  {activePlayers.map((player) => (
                    <span key={player.id} style={{ padding: "0.45rem 0.7rem", borderRadius: "var(--r-pill)", background: "var(--surface-sunken)", border: "1px solid var(--border)", fontWeight: 800, fontSize: "0.8125rem" }}>
                      {player.displayName}
                    </span>
                  ))}
                  {activePlayers.length === 0 && <span style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>No players added yet.</span>}
                </div>
              </div>

              <div style={{ padding: "1rem 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.625rem" }}>
                  <div>
                    <h4 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1rem", fontWeight: 900 }}>Squad players</h4>
                    <p style={{ color: "var(--text-3)", fontSize: "0.8125rem" }}>{availableGroupPlayers.length} available</p>
                  </div>
                  {availableGroupPlayers.length > 0 && (
                    <button
                      type="button"
                      data-testid="pre-session-add-all-btn"
                      onClick={handleAddAllGroupPlayers}
                      disabled={isAddingAllPlayers || addingGroupPlayerId !== null}
                      style={{ ...primaryActionStyle, height: 38, opacity: isAddingAllPlayers ? 0.55 : 1 }}
                    >
                      {isAddingAllPlayers ? "Adding all..." : "Add all"}
                    </button>
                  )}
                </div>
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {availableGroupPlayers.map((player) => (
                    <div key={player.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: "0.75rem", padding: "0.625rem 0.75rem", borderRadius: "var(--r-lg)", background: "var(--surface-sunken)", border: "1px solid var(--border)" }}>
                      <span style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.displayName}</span>
                      <button
                        type="button"
                        onClick={() => handleAddGroupPlayer(player)}
                        disabled={addingGroupPlayerId === player.id || isAddingAllPlayers}
                        style={{ ...primaryActionStyle, height: 34, fontSize: "0.8125rem", opacity: addingGroupPlayerId === player.id || isAddingAllPlayers ? 0.55 : 1 }}
                      >
                        {addingGroupPlayerId === player.id ? "Adding..." : "Add"}
                      </button>
                    </div>
                  ))}
                  {availableGroupPlayers.length === 0 && (
                    <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>All squad players are already in this session.</p>
                  )}
                </div>
              </div>

              <div style={{ paddingTop: "1rem" }}>
                <h4 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1rem", fontWeight: 900, marginBottom: "0.25rem" }}>Add a guest</h4>
                <p style={{ color: "var(--text-3)", fontSize: "0.8125rem", marginBottom: "0.625rem" }}>
                  For this session only. Session results are kept here, not in lifetime rankings.
                </p>
                <form onSubmit={handleAddSessionGuest} className="pb-guest-add-form">
                  <input
                    className="pb-input"
                    type="text"
                    placeholder="Guest name"
                    value={sessionGuestName}
                    onChange={(e) => setSessionGuestName(e.target.value)}
                    required
                    style={{ height: 44, borderRadius: "var(--r-md)" }}
                  />
                  <select className="pb-input" value={sessionGuestSkill} onChange={(e) => setSessionGuestSkill(e.target.value)} style={{ height: 44, borderRadius: "var(--r-md)" }}>
                    <option value="unknown">Skill: Unknown</option>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                  <button type="submit" disabled={!sessionGuestName.trim() || isAddingSessionGuest} style={{ ...primaryActionStyle, height: 44, opacity: sessionGuestName.trim() && !isAddingSessionGuest ? 1 : 0.5 }}>
                    {isAddingSessionGuest ? "Adding..." : "Add guest"}
                  </button>
                </form>
              </div>
            </div>
          ) : matches.length === 0 ? (
            <div style={{ background: "var(--surface)", border: "2px dashed var(--border)", borderRadius: "var(--r-xl)", padding: "2rem 1.25rem", textAlign: "center" }}>
              <h3 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, marginBottom: "0.375rem" }}>No matches yet</h3>
              <p style={{ color: "var(--text-2)" }}>Matches appear when the session starts.</p>
            </div>
          ) : null}

          {/* Bench strip: who is sitting out this moment */}
          {isLive && matches.length > 0 && (
            <div data-testid="bench-strip" style={{
              background: benchPlayers.length > 0 ? "var(--surface-sunken)" : "transparent",
              border: benchPlayers.length > 0 ? "1px solid var(--border)" : "1px dashed var(--border)",
              borderRadius: "var(--r-xl)", padding: "0.75rem 1rem", marginBottom: "1rem",
              display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap",
            }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
                🪑 On the bench
              </span>
              {benchPlayers.length === 0 ? (
                <span style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>Everyone's on a court</span>
              ) : (
                benchPlayers.map((p) => (
                  <span key={p.playerId} style={{
                    padding: "3px 10px", borderRadius: "var(--r-pill)", background: "var(--surface)",
                    border: "1px solid var(--border)", fontSize: "0.8125rem", fontWeight: 700,
                  }}>
                    {p.displayName} <span style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: "0.6875rem" }}>{gamesFor(p.playerId)}g</span>
                  </span>
                ))
              )}
            </div>
          )}

          {/* Live courts — hidden once the session is complete: no further
              matches will be played, so a pending court card is misleading. */}
          {!isCompleted && activeCourts.map((court) => {
            const current = scheduledByCourtId.get(court.courtId);
            if (current) return renderMatchCard(current);
            if (!isLive) return null;
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

          {/* A completed session with nothing played would otherwise render an
              empty column, so say so plainly. */}
          {isCompleted && doneMatches.length === 0 && (
            <div data-testid="completed-no-games" style={{
              background: "var(--surface)",
              border: "2px dashed var(--border)",
              borderRadius: "var(--r-xl)",
              padding: "1.25rem",
              textAlign: "center",
            }}>
              <p style={{ fontFamily: "var(--font-display-tight)", fontWeight: 900 }}>Session complete</p>
              <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>No games were recorded.</p>
            </div>
          )}

          {/* Finished games */}
          {doneMatches.length > 0 && (
            <div style={{ marginTop: "1.5rem" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
                {isCompleted ? "Results" : "Finished games"}
              </span>
              <div style={{ marginTop: "0.625rem" }}>
                {doneMatches.map((m) => renderMatchCard(m))}
              </div>
            </div>
          )}
        </section>

        {/* Leaderboard */}
        <aside className="pb-live-leaderboard-card" style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)",
          padding: "1rem",
          boxShadow: "var(--shadow-sm)",
          animation: "pb-rise 400ms 150ms var(--ease-out) both",
        }}>
          <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em", marginBottom: "0.875rem" }}>
            Leaderboard
          </h2>
          {leaderboard.length === 0 ? (
            <div style={{ border: "2px dashed var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem", color: "var(--text-2)", textAlign: "center" }}>
              No scores yet.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "0.375rem" }}>
              {/* Leaderboard Header */}
              <div className={`pb-live-leaderboard-grid ${session.scoringMode === "points" ? "is-points" : "is-winner-only"}`} style={{
                padding: "0.25rem 0.5rem",
                fontFamily: "var(--font-mono)",
                fontSize: "0.625rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-3)",
              }}>
                <span>#</span>
                <span>Player</span>
                <span style={{ textAlign: "right" }}>G</span>
                <span style={{ textAlign: "right" }}>W</span>
                <span style={{ textAlign: "right" }}>L</span>
                <span style={{ textAlign: "right" }}>WIN%</span>
                {session.scoringMode === "points" && <span style={{ textAlign: "right" }}>PD</span>}
              </div>

              {leaderboard.map((row, idx) => {
                const totalGames = row.gamesPlayed ?? ((row.wins ?? 0) + (row.losses ?? 0));
                const wins = row.wins ?? 0;
                const losses = row.losses ?? Math.max(0, totalGames - wins);
                const winPct = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
                const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;
                const pd = row.pointDifference ?? 0;

                return (
                  <div key={row.playerId} className={`pb-live-leaderboard-grid ${session.scoringMode === "points" ? "is-points" : "is-winner-only"}`} style={{
                    alignItems: "center",
                    padding: "0.5rem 0.5rem",
                    borderRadius: "var(--r-lg)",
                    background: idx === 0 ? "rgba(198,241,53,0.18)" : "var(--surface-sunken)",
                  }}>
                    <span style={{ fontWeight: 900, fontSize: medal ? "1rem" : "0.75rem", fontFamily: "var(--font-mono)" }}>
                      {medal ?? (idx + 1)}
                    </span>
                    <span style={{ fontWeight: 800, fontSize: "0.8125rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.displayName ?? displayNameById.get(row.playerId) ?? row.playerId}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 800, textAlign: "right", color: "var(--text-1)" }}>
                      {totalGames}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 800, textAlign: "right", color: "var(--volt-600)" }}>
                      {wins}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", textAlign: "right", color: "var(--text-3)" }}>
                      {losses}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 800, textAlign: "right", color: winPct >= 50 ? "var(--volt-600)" : "var(--text-2)" }}>
                      {winPct}%
                    </span>
                    {session.scoringMode === "points" && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", textAlign: "right", color: pd > 0 ? "var(--volt-600)" : pd < 0 ? "var(--danger)" : "var(--text-3)" }}>
                        {pd > 0 ? `+${pd}` : pd}
                      </span>
                    )}
                  </div>
                );
              })}
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

          {/* Add Walk-in Guest Player directly to session */}
          <div style={{ marginTop: "0.5rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
            <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: "0.625rem" }}>
              ⚡ Add Walk-in Guest Player (No Email Needed)
            </h3>
            <form onSubmit={handleAddSessionGuest} className="pb-guest-add-form">
              <input
                data-testid="session-guest-name-input"
                className="pb-input"
                type="text"
                placeholder="Walk-in guest name (e.g. Sam T.)"
                value={sessionGuestName}
                onChange={(e) => setSessionGuestName(e.target.value)}
                required
                style={{ height: 44, borderRadius: "var(--r-md)" }}
              />
              <select
                className="pb-input"
                value={sessionGuestSkill}
                onChange={(e) => setSessionGuestSkill(e.target.value)}
                style={{ height: 44, borderRadius: "var(--r-md)" }}
              >
                <option value="unknown">Skill: Unknown</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
              <button
                data-testid="session-guest-add-submit"
                type="submit"
                disabled={!sessionGuestName.trim() || isAddingSessionGuest}
                style={{
                  ...primaryActionStyle,
                  height: 44,
                  opacity: sessionGuestName.trim() && !isAddingSessionGuest ? 1 : 0.5,
                  whiteSpace: "nowrap",
                }}
              >
                {isAddingSessionGuest ? "Adding…" : "+ Add Guest"}
              </button>
            </form>
          </div>
        </section>
      )}

      {/* Player board QR modal */}
      {showBoardModal && boardPath && (
        <div
          onClick={() => setShowBoardModal(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(22,36,28,0.52)", display: "grid", placeItems: "center", zIndex: 500, padding: "1rem" }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: "var(--r-xl)", padding: "1.5rem 1.25rem", maxWidth: 360, width: "100%", boxShadow: "var(--shadow-lg)", textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: "0.25rem" }}>
              Scan to see your matches
            </div>
            <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, marginBottom: "1rem" }}>Player Board</h2>
            <div style={{ display: "inline-block", background: "#fff", padding: 12, borderRadius: "var(--r-lg)", border: "1px solid var(--border)" }}>
              <QRCode value={boardUrl} size={208} />
            </div>
            <div style={{ marginTop: "0.875rem", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-2)", wordBreak: "break-all", lineHeight: 1.4 }}>
              {boardUrl}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button onClick={handleShareBoard} style={{ flex: 1, height: 46, border: "none", borderRadius: "var(--r-md)", background: "var(--volt-500)", color: "var(--ink-800)", fontWeight: 900, cursor: "pointer" }}>
                {boardCopied ? "Copied ✓" : "Share link"}
              </button>
              <button onClick={() => setShowBoardModal(false)} style={{ height: 46, padding: "0 1rem", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface)", color: "var(--text-2)", fontWeight: 800, cursor: "pointer" }}>
                Close
              </button>
            </div>
          </div>
        </div>
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
      {confirmationDialog}
    </div>
  );
}
