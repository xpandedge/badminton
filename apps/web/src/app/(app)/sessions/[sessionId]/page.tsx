"use client";

import { useCallback, useEffect, useState, use } from "react";
import { watchSession, watchSessionPlayers, updateSessionDraft } from "@/lib/sessions/sessions";
import type { Session, SessionPlayer } from "@/lib/sessions/types";
import { useGroupRole } from "@/lib/groups/useGroupRole";
import { useAuth } from "@/lib/auth/useAuth";
import { watchGroupPlayers } from "@/lib/players/players";
import {
  canManageSessionPlayers,
  PLAYER_GENDER_LABELS,
  PLAYER_GENDERS,
  type PlayerGender,
} from "@picklebaddies/domain";
import { shareUrl } from "@/lib/config/site";
import { addGroupMemberToSession } from "@/server/sessions/players";
import { addGuestPlayerToSession, rebalanceSession } from "@/lib/sessions/rebalance";
import {
  addCourtToSession,
  demoteCasualRsvp,
  ensureSessionRsvpLink,
  getSessionRsvpAdminRoster,
  promoteCasualRsvp,
  removeCasualRsvp,
  syncConfirmedRsvpsToSessionPlayers,
  updateSessionRsvpCapacity,
  type SessionRsvpAdminRoster,
} from "@/server/sessions/actions";
import { formatSessionStatus, formatPlayerStatus, formatScoringMode } from "@/lib/format/status";
import { QRCode } from "@/components/QRCode";

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statValue(value: string | number) {
  return String(value);
}

type GroupPlayer = { id: string; displayName?: string; skillLevel?: string; userId?: string };
type RsvpCapacityFormState = {
  totalPlayers: number;
  casualConfirmedSlots: number;
  waitlistEnabled: boolean;
  cutoffAt: string;
};

function toInputDateTime(value: unknown): string {
  if (!value) return "";
  const date = typeof (value as { toDate?: () => Date }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : value instanceof Date
      ? value
      : new Date(value as string);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export default function SessionDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);

  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [groupPlayers, setGroupPlayers] = useState<GroupPlayer[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [isAddingAll, setIsAddingAll] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestGender, setGuestGender] = useState<PlayerGender | "">("");
  const [guestSkill, setGuestSkill] = useState("unknown");
  const [isAddingGuest, setIsAddingGuest] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [rsvpCapacityForm, setRsvpCapacityForm] = useState<RsvpCapacityFormState>({
    totalPlayers: 11,
    casualConfirmedSlots: 3,
    waitlistEnabled: true,
    cutoffAt: "",
  });
  const [isSavingRsvpCapacity, setIsSavingRsvpCapacity] = useState(false);
  const [rsvpCapacityError, setRsvpCapacityError] = useState<string | null>(null);
  const [rsvpSyncMessage, setRsvpSyncMessage] = useState<string | null>(null);
  const [isSyncingRsvp, setIsSyncingRsvp] = useState(false);
  const [rsvpRoster, setRsvpRoster] = useState<SessionRsvpAdminRoster | null>(null);
  const [rsvpRosterError, setRsvpRosterError] = useState<string | null>(null);
  const [rsvpOverrideBusyId, setRsvpOverrideBusyId] = useState<string | null>(null);
  const [rsvpCopied, setRsvpCopied] = useState(false);
  const [isCreatingRsvpLink, setIsCreatingRsvpLink] = useState(false);
  const [rsvpCreateError, setRsvpCreateError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!session) return;
    setRsvpCapacityForm({
      totalPlayers: Number(session.rsvpCapacity?.totalPlayers ?? 11),
      casualConfirmedSlots: Number(session.rsvpCapacity?.casualConfirmedSlots ?? 3),
      waitlistEnabled: session.rsvpCapacity?.waitlistEnabled ?? true,
      cutoffAt: toInputDateTime(session.rsvpCapacity?.cutoffAt),
    });
  }, [sessionId, session?.rsvpCapacity]);

  const refreshRsvpRoster = useCallback(async () => {
    if (!canManage || !session?.rsvpCode) return;
    const result = await getSessionRsvpAdminRoster(sessionId).catch((error) => ({
      ok: false as const,
      message: error.message,
    }));
    if (result?.ok) {
      setRsvpRoster(result.data);
      setRsvpRosterError(null);
    } else {
      setRsvpRosterError(result?.message ?? "Could not load the RSVP roster.");
    }
  }, [canManage, session?.rsvpCode, sessionId]);

  useEffect(() => {
    void refreshRsvpRoster();
  }, [refreshRsvpRoster]);

  const handleAddToSession = async (playerId: string) => {
    setAddingId(playerId);
    setAddError(null);
    try {
      const result = await addGroupMemberToSession(sessionId, playerId);
      if (!result.ok) setAddError(result.message);
      else await refreshRsvpRoster();
    } catch {
      setAddError("Failed to add player. Try again.");
    } finally {
      setAddingId(null);
    }
  };

  const handleAddAllToSession = async () => {
    if (rosterNotInSession.length === 0 || isAddingAll) return;
    setIsAddingAll(true);
    setAddError(null);
    const results = await Promise.allSettled(rosterNotInSession.map((player) => addGroupMemberToSession(sessionId, player.id)));
    const failed = results.filter((result) => result.status === "rejected" || (result.status === "fulfilled" && !result.value.ok));
    if (failed.length > 0) {
      setAddError(`${failed.length} player${failed.length === 1 ? "" : "s"} could not be added. Try the individual Add buttons.`);
    }
    if (failed.length < results.length) await refreshRsvpRoster();
    setIsAddingAll(false);
  };

  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim() || !guestGender || isAddingGuest || !canManage) return;
    setIsAddingGuest(true);
    setGuestError(null);
    try {
      const result = await addGuestPlayerToSession({
        sessionId,
        displayName: guestName,
        gender: guestGender,
        skillLevel: guestSkill,
      });
      if (result.data.rebalanceRecommended) {
        await rebalanceSession({ sessionId, trigger: "player_added" });
      }
      setGuestName("");
      setGuestGender("");
      setGuestSkill("unknown");
    } catch (error: any) {
      setGuestError(error?.message ?? "Could not add guest. Try again.");
    } finally {
      setIsAddingGuest(false);
    }
  };

  const handleSaveRsvpCapacity = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSavingRsvpCapacity) return;
    setIsSavingRsvpCapacity(true);
    setRsvpCapacityError(null);
    const result = await updateSessionRsvpCapacity(sessionId, {
      totalPlayers: rsvpCapacityForm.totalPlayers,
      casualConfirmedSlots: rsvpCapacityForm.casualConfirmedSlots,
      waitlistEnabled: rsvpCapacityForm.waitlistEnabled,
      cutoffAt: rsvpCapacityForm.cutoffAt ? new Date(rsvpCapacityForm.cutoffAt) : null,
    }).catch((error) => ({ ok: false as const, message: error.message }));
    setIsSavingRsvpCapacity(false);
    if (!result?.ok) {
      setRsvpCapacityError(result?.message ?? "Could not save this session's RSVP capacity.");
    } else {
      await refreshRsvpRoster();
    }
  };

  const handleSyncRsvpRoster = async () => {
    if (isSyncingRsvp) return;
    setIsSyncingRsvp(true);
    setRsvpSyncMessage(null);
    setRsvpCapacityError(null);
    const result = await syncConfirmedRsvpsToSessionPlayers(sessionId).catch((error) => ({
      ok: false as const,
      message: error.message,
    }));
    setIsSyncingRsvp(false);
    if (result?.ok) {
      setRsvpSyncMessage(`${result.data.added} added. ${result.data.waiting} waiting.`);
      await refreshRsvpRoster();
    } else {
      setRsvpCapacityError(result?.message ?? "Could not sync the confirmed RSVP roster.");
    }
  };

  const handleRsvpOverride = async (
    rsvpId: string,
    action: "promote" | "waiting" | "remove",
  ) => {
    if (rsvpOverrideBusyId) return;
    setRsvpOverrideBusyId(rsvpId);
    setRsvpRosterError(null);
    const result = await (
      action === "promote"
        ? promoteCasualRsvp(sessionId, rsvpId)
        : action === "waiting"
          ? demoteCasualRsvp(sessionId, rsvpId)
          : removeCasualRsvp(sessionId, rsvpId)
    ).catch((error) => ({ ok: false as const, message: error.message }));
    setRsvpOverrideBusyId(null);
    if (!result?.ok) {
      setRsvpRosterError(result?.message ?? "Could not update this RSVP.");
      return;
    }
    await refreshRsvpRoster();
  };

  const scoreLinkPath = session?.scoreCode ? `/score/${session.scoreCode}` : null;

  const handleCopyScoreLink = async () => {
    if (!scoreLinkPath) return;
    await navigator.clipboard?.writeText(shareUrl(scoreLinkPath));
  };

  const handleToggleScoreLink = async () => {
    if (!session) return;
    await updateSessionDraft(sessionId, { scoreLinkEnabled: !session.scoreLinkEnabled });
  };

  const boardEnabled = session?.boardEnabled !== false;
  const boardPath = session?.scoreCode ? `/board/${session.scoreCode}` : null;
  const boardUrl = boardPath ? shareUrl(boardPath) : "";
  const rsvpPath = session?.rsvpCode ? `/rsvp/${session.rsvpCode}` : null;
  const rsvpUrl = rsvpPath ? shareUrl(rsvpPath) : "";
  const [boardCopied, setBoardCopied] = useState(false);

  const handleCopyBoardLink = async () => {
    if (!boardPath) return;
    await navigator.clipboard?.writeText(shareUrl(boardPath));
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

  const handleCopyRsvpLink = async () => {
    if (!rsvpPath) return;
    await navigator.clipboard?.writeText(shareUrl(rsvpPath));
    setRsvpCopied(true);
    setTimeout(() => setRsvpCopied(false), 1600);
  };

  const handleCreateRsvpLink = async () => {
    if (isCreatingRsvpLink) return;
    setIsCreatingRsvpLink(true);
    setRsvpCreateError(null);
    const result = await ensureSessionRsvpLink(sessionId).catch((error) => ({
      ok: false as const,
      message: error.message,
    }));
    setIsCreatingRsvpLink(false);
    if (!result?.ok) {
      setRsvpCreateError(result?.message ?? "Could not create an RSVP link for this session.");
      return;
    }
    setSession((current) => current ? { ...current, rsvpCode: result.data.rsvpCode, rsvpEnabled: true } : current);
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
  const runSessionLabel =
    session.status === "active" || session.status === "paused"
      ? "Run Session"
      : session.status === "completed"
        ? "View Results"
        : "Start Playing";
  const runSessionHint =
    session.status === "active" || session.status === "paused"
      ? "Score games and manage courts."
      : session.status === "completed"
        ? "Review matches and scores."
        : "Set up the first games.";

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
              <div style={{ display: "grid", gap: "0.35rem", justifyItems: "end" }}>
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
                  {runSessionLabel}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </a>
                <span style={{ color: "rgba(246,248,244,0.62)", fontSize: "0.75rem", fontWeight: 700 }}>
                  {runSessionHint}
                </span>
              </div>
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

      {/* Court booking — links out to venue booking pages */}
      {isGroupMember && (
        <section className="pb-card pb-session-booking-card">
          <div>
            <span className="pb-mono-label">Need a court?</span>
            <p>Book a court at a Brisbane venue for this session.</p>
          </div>
          <div className="pb-booking-actions">
            <a href="/bookings" className="pb-secondary-action">Book a court ↗</a>
          </div>
        </section>
      )}

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
                  Player View
                </h2>
                <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>Share court assignments with players.</p>
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
              <p style={{ color: "var(--text-3)", fontSize: "0.8125rem" }}>Turn this on when players should see their courts.</p>
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
            animation: "pb-rise 400ms 85ms var(--ease-out) both",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.875rem" }}>
              <div style={{ width: 40, height: 40, borderRadius: "var(--r-lg)", background: "var(--volt-500)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-800)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 6h13" />
                  <path d="M8 12h13" />
                  <path d="M8 18h13" />
                  <path d="M3 6h.01" />
                  <path d="M3 12h.01" />
                  <path d="M3 18h.01" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
                  {rsvpPath ? `RSVP list for ${session.name}` : "Create RSVP link"}
                </h2>
                <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>
                  {rsvpPath ? "These numbers apply only to this session." : "Share this with regulars and casuals for this session."}
                </p>
              </div>
            </div>

            {rsvpPath ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.625rem", alignItems: "center", background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "0.625rem", marginBottom: "0.75rem" }}>
                  <a href={rsvpPath} style={{ color: "var(--emerald-600)", fontWeight: 800, fontSize: "0.875rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {rsvpUrl}
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyRsvpLink}
                    style={{ height: 38, padding: "0 0.75rem", border: "none", borderRadius: "var(--r-md)", background: "var(--ink-800)", color: "var(--volt-500)", fontWeight: 900, cursor: "pointer" }}
                  >
                    {rsvpCopied ? "Copied" : "Copy"}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSyncRsvpRoster}
                  disabled={isSyncingRsvp || (session.status !== "draft" && session.status !== "scheduled")}
                  style={{
                    width: "100%",
                    minHeight: 42,
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-md)",
                    background: "var(--surface-sunken)",
                    color: "var(--ink-800)",
                    fontWeight: 900,
                    cursor: isSyncingRsvp || (session.status !== "draft" && session.status !== "scheduled") ? "default" : "pointer",
                    opacity: isSyncingRsvp || (session.status !== "draft" && session.status !== "scheduled") ? 0.55 : 1,
                    marginBottom: "0.75rem",
                  }}
                >
                  {isSyncingRsvp ? "Syncing..." : "Sync confirmed roster"}
                </button>
                {rsvpSyncMessage && (
                  <p role="status" style={{ color: "var(--text-2)", fontSize: "0.8125rem", fontWeight: 800, margin: "-0.3rem 0 0.65rem" }}>
                    {rsvpSyncMessage}
                  </p>
                )}

                {rsvpRoster && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: "0.625rem", marginBottom: "0.75rem" }}>
                    {[
                      { title: "Confirmed casuals", rows: rsvpRoster.casualsConfirmed, empty: "No casuals confirmed." },
                      { title: "Waiting casuals", rows: rsvpRoster.casualsWaiting, empty: "No casuals waiting." },
                    ].map((bucket) => (
                      <div key={bucket.title} style={{ border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-sunken)", padding: "0.625rem", display: "grid", gap: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                          <h3 style={{ fontFamily: "var(--font-display-tight)", fontSize: "0.95rem", fontWeight: 900 }}>{bucket.title}</h3>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-3)", fontWeight: 900 }}>{bucket.rows.length}</span>
                        </div>
                        {bucket.rows.length === 0 ? (
                          <p style={{ color: "var(--text-3)", fontSize: "0.8125rem" }}>{bucket.empty}</p>
                        ) : (
                          <div style={{ display: "grid", gap: "0.45rem" }}>
                            {bucket.rows.map((entry) => {
                              const isBusy = rsvpOverrideBusyId === entry.rsvpId;
                              const isConfirmedBucket = bucket.title === "Confirmed casuals";
                              return (
                                <div key={entry.rsvpId} style={{ display: "grid", gap: "0.45rem", padding: "0.55rem", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface)" }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 900 }}>{entry.displayName}</span>
                                    <span style={{
                                      padding: "2px 6px",
                                      borderRadius: "var(--r-pill)",
                                      background: entry.isPublic ? "rgba(198,241,53,0.16)" : "var(--surface-sunken)",
                                      color: entry.isPublic ? "var(--ink-800)" : "var(--text-3)",
                                      fontFamily: "var(--font-mono)",
                                      fontSize: "0.5625rem",
                                      fontWeight: 900,
                                      letterSpacing: "0.06em",
                                      textTransform: "uppercase",
                                      flexShrink: 0,
                                    }}>
                                      {entry.isPublic ? "Link" : "Member"}
                                    </span>
                                  </div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                                    <button
                                      type="button"
                                      disabled={isBusy || isConfirmedBucket}
                                      onClick={() => handleRsvpOverride(entry.rsvpId, "promote")}
                                      style={{
                                        height: 30,
                                        padding: "0 0.55rem",
                                        border: "none",
                                        borderRadius: "var(--r-md)",
                                        background: isConfirmedBucket ? "var(--surface-sunken)" : "var(--volt-500)",
                                        color: isConfirmedBucket ? "var(--text-3)" : "var(--ink-800)",
                                        fontSize: "0.6875rem",
                                        fontWeight: 900,
                                        cursor: isBusy || isConfirmedBucket ? "default" : "pointer",
                                      }}
                                    >
                                      Promote
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isBusy || !isConfirmedBucket}
                                      onClick={() => handleRsvpOverride(entry.rsvpId, "waiting")}
                                      style={{
                                        height: 30,
                                        padding: "0 0.55rem",
                                        border: "1px solid var(--border)",
                                        borderRadius: "var(--r-md)",
                                        background: isConfirmedBucket ? "var(--surface-sunken)" : "var(--surface)",
                                        color: isConfirmedBucket ? "var(--text-1)" : "var(--text-3)",
                                        fontSize: "0.6875rem",
                                        fontWeight: 900,
                                        cursor: isBusy || !isConfirmedBucket ? "default" : "pointer",
                                      }}
                                    >
                                      Move to waiting
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => handleRsvpOverride(entry.rsvpId, "remove")}
                                      style={{
                                        height: 30,
                                        padding: "0 0.55rem",
                                        border: "1px solid var(--border)",
                                        borderRadius: "var(--r-md)",
                                        background: "transparent",
                                        color: "var(--danger)",
                                        fontSize: "0.6875rem",
                                        fontWeight: 900,
                                        cursor: isBusy ? "default" : "pointer",
                                        opacity: isBusy ? 0.55 : 1,
                                      }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {rsvpRosterError && (
                  <p role="status" style={{ color: "var(--danger)", fontSize: "0.8125rem", fontWeight: 800, margin: "-0.2rem 0 0.65rem" }}>
                    {rsvpRosterError}
                  </p>
                )}

                <form onSubmit={handleSaveRsvpCapacity} style={{ display: "grid", gap: "0.625rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: "0.5rem" }}>
                    <label style={{ display: "grid", gap: "0.35rem", color: "var(--text-2)", fontSize: "0.8125rem", fontWeight: 800 }}>
                      Total player capacity
                      <input
                        className="pb-input"
                        type="number"
                        min={4}
                        value={rsvpCapacityForm.totalPlayers}
                        onChange={(event) => setRsvpCapacityForm((current) => ({ ...current, totalPlayers: Number(event.target.value) }))}
                        style={{ height: 40, borderRadius: "var(--r-md)", marginTop: 0 }}
                      />
                    </label>
                  </div>
                  <label style={{ display: "grid", gap: "0.35rem", color: "var(--text-2)", fontSize: "0.8125rem", fontWeight: 800 }}>
                    RSVP cutoff
                    <input
                      className="pb-input"
                      type="datetime-local"
                      value={rsvpCapacityForm.cutoffAt}
                      onChange={(event) => setRsvpCapacityForm((current) => ({ ...current, cutoffAt: event.target.value }))}
                      style={{ height: 40, borderRadius: "var(--r-md)", marginTop: 0 }}
                    />
                  </label>
                  <label style={{
                    minHeight: 40,
                    display: "flex", alignItems: "center", gap: "0.5rem",
                    padding: "0 0.75rem", border: "1px solid var(--border)",
                    borderRadius: "var(--r-md)", background: "var(--surface-sunken)",
                    color: "var(--text-2)", fontSize: "0.8125rem", fontWeight: 800,
                  }}>
                    <input
                      type="checkbox"
                      checked={rsvpCapacityForm.waitlistEnabled}
                      onChange={(event) => setRsvpCapacityForm((current) => ({ ...current, waitlistEnabled: event.target.checked }))}
                    />
                    Casual waiting list
                  </label>
                  {rsvpCapacityError && (
                    <p role="status" style={{ color: "var(--danger)", fontSize: "0.8125rem", fontWeight: 800 }}>
                      {rsvpCapacityError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={isSavingRsvpCapacity}
                    style={{
                      height: 42,
                      border: "none",
                      borderRadius: "var(--r-md)",
                      background: "var(--ink-800)",
                      color: "var(--volt-500)",
                      fontWeight: 900,
                      cursor: isSavingRsvpCapacity ? "default" : "pointer",
                      opacity: isSavingRsvpCapacity ? 0.6 : 1,
                    }}
                  >
                    {isSavingRsvpCapacity ? "Saving..." : "Save session RSVP"}
                  </button>
                </form>
              </>
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <p style={{ color: "var(--text-2)", fontSize: "0.875rem" }}>
                  Create a share link so regulars can view the roster and casuals can add their names.
                </p>
                <button
                  type="button"
                  onClick={handleCreateRsvpLink}
                  disabled={isCreatingRsvpLink}
                  style={{
                    width: "100%",
                    minHeight: 44,
                    border: "none",
                    borderRadius: "var(--r-md)",
                    background: "var(--volt-500)",
                    color: "var(--ink-800)",
                    fontWeight: 900,
                    cursor: isCreatingRsvpLink ? "default" : "pointer",
                    opacity: isCreatingRsvpLink ? 0.6 : 1,
                  }}
                >
                  {isCreatingRsvpLink ? "Creating..." : "Create share link"}
                </button>
                {rsvpCreateError && (
                  <p role="status" style={{ color: "var(--danger)", fontSize: "0.8125rem", fontWeight: 800 }}>
                    {rsvpCreateError}
                  </p>
                )}
              </div>
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
                  Score Entry Link
                </h2>
                <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>Let each court submit results quickly.</p>
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
                  {shareUrl(scoreLinkPath)}
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
                      {formatPlayerStatus(player.status)}
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
                  {canManage ? "Add players for this session, one at a time or all at once." : "Squad members who haven't joined this session."}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                <span style={{
                  minWidth: 34, height: 34, padding: "0 0.65rem", borderRadius: "var(--r-pill)",
                  background: "var(--surface-sunken)", border: "1px solid var(--border)", color: "var(--text-2)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "0.875rem",
                }}>
                  {rosterNotInSession.length}
                </span>
                {canManage && rosterNotInSession.length > 0 && (
                  <button
                    type="button"
                    data-testid="roster-add-all-btn"
                    disabled={isAddingAll || addingId !== null}
                    onClick={handleAddAllToSession}
                    style={{
                      minHeight: 34, padding: "0 0.75rem", border: "none", borderRadius: "var(--r-md)",
                      background: isAddingAll ? "var(--n-200)" : "var(--ink-800)", color: "var(--volt-500)",
                      fontWeight: 900, fontSize: "0.8125rem", cursor: isAddingAll ? "wait" : "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    {isAddingAll ? "Adding all..." : "Add all"}
                  </button>
                )}
              </div>
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

            {canManage && (
              <div style={{ marginTop: "0.875rem", paddingTop: "0.875rem", borderTop: "1px solid var(--border)" }}>
                <h3 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1rem", fontWeight: 900, marginBottom: "0.25rem" }}>
                  Add a guest
                </h3>
                <p style={{ color: "var(--text-3)", fontSize: "0.8125rem", marginBottom: "0.625rem" }}>
                  For this session only. Their session results will be available here, but they will not appear in lifetime or overall rankings.
                </p>
                {guestError && (
                  <p role="alert" style={{ color: "var(--danger)", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.625rem" }}>{guestError}</p>
                )}
                <form onSubmit={handleAddGuest} className="pb-guest-add-form">
                  <input
                    data-testid="session-detail-guest-name-input"
                    className="pb-input"
                    type="text"
                    placeholder="Guest name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    required
                    style={{ height: 44, borderRadius: "var(--r-md)" }}
                  />
                  <select
                    className="pb-input"
                    value={guestGender}
                    onChange={(e) => setGuestGender(e.target.value as PlayerGender | "")}
                    style={{ height: 44, borderRadius: "var(--r-md)" }}
                    aria-label="Guest gender"
                    required
                  >
                    <option value="" disabled>Gender</option>
                    {PLAYER_GENDERS.map((option) => (
                      <option key={option} value={option}>{PLAYER_GENDER_LABELS[option]}</option>
                    ))}
                  </select>
                  <select
                    className="pb-input"
                    value={guestSkill}
                    onChange={(e) => setGuestSkill(e.target.value)}
                    style={{ height: 44, borderRadius: "var(--r-md)" }}
                    aria-label="Guest skill"
                  >
                    <option value="unknown">Skill: Unknown</option>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                  <button
                    type="submit"
                    data-testid="session-detail-guest-add-btn"
                    disabled={!guestName.trim() || !guestGender || isAddingGuest}
                    style={{
                      minHeight: 44, padding: "0 1rem", border: "none", borderRadius: "var(--r-md)",
                      background: "var(--ink-800)", color: "var(--volt-500)", fontWeight: 900,
                      opacity: guestName.trim() && guestGender && !isAddingGuest ? 1 : 0.5, cursor: isAddingGuest ? "wait" : "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    {isAddingGuest ? "Adding..." : "Add guest"}
                  </button>
                </form>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
