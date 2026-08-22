"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isSuperAdminEmail } from "@picklebaddies/domain";
import { useAuth } from "@/lib/auth/useAuth";
import { watchUserGroups } from "@/lib/groups/groups";
import { getMySessionsAction, rsvpToSession, type SessionSummaryData } from "@/server/sessions/actions";
import { joinSquadByCode, requestToJoinSquad, searchSquads, type SquadSearchResult } from "@/server/squads/actions";
import { formatSessionStatus } from "@/lib/format/status";

type Group = { id: string; name: string };
type DashboardSession = SessionSummaryData & { role: "managing" | "member" };

const utilityLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 42,
  padding: "0 0.75rem",
  borderRadius: "var(--r-lg)",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text-1)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.6875rem",
  fontWeight: 900,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  textDecoration: "none",
  whiteSpace: "nowrap" as const,
};

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [mySessions, setMySessions] = useState<{ organising: SessionSummaryData[]; playing: SessionSummaryData[] } | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [squadQuery, setSquadQuery] = useState("");
  const [squadResults, setSquadResults] = useState<SquadSearchResult[]>([]);
  const [searchingSquads, setSearchingSquads] = useState(false);
  const [requestedIds, setRequestedIds] = useState<Record<string, boolean>>({});
  const [rsvpLoading, setRsvpLoading] = useState<Set<string>>(new Set());
  const [rsvpErrors, setRsvpErrors] = useState<Record<string, string>>({});
  const squadSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayName = user?.displayName?.trim() || "Player";
  const firstName = displayName.split(/[\s@]/)[0] || "Player";
  const isSuperAdmin = isSuperAdminEmail(user?.email);
  const sessions = useMemo<DashboardSession[]>(() => {
    if (!mySessions) return [];

    const statusRank = (status: string) => {
      if (status === "active") return 0;
      if (status === "paused") return 1;
      if (status === "scheduled" || status === "draft") return 2;
      if (status === "completed") return 3;
      return 4;
    };

    return [
      ...mySessions.organising.map((session) => ({ ...session, role: "managing" as const })),
      ...mySessions.playing.map((session) => ({ ...session, role: "member" as const })),
    ].filter((session) => session.status !== "cancelled").sort((a, b) => {
      const byStatus = statusRank(a.status) - statusRank(b.status);
      if (byStatus !== 0) return byStatus;
      const aTime = new Date(a.startsAt ?? 0).getTime();
      const bTime = new Date(b.startsAt ?? 0).getTime();
      return a.status === "scheduled" || a.status === "draft" ? aTime - bTime : bTime - aTime;
    });
  }, [mySessions]);

  const activeSession = sessions.find((session) =>
    (session.status === "active" || session.status === "paused")
    && (session.role === "managing" || session.myRsvpStatus === "going"),
  );
  const nextSession = sessions.find((session) =>
    (session.status === "scheduled" || session.status === "draft")
    && session.myRsvpStatus !== "not_going",
  );
  const primarySession = activeSession ?? nextSession ?? null;
  const primaryHref = primarySession
    ? primarySession.role === "managing"
      ? `/sessions/${primarySession.id}/live`
      : `/sessions/${primarySession.id}/player`
    : "/sessions/new";
  const primaryLabel = primarySession
    ? primarySession.status === "active" || primarySession.status === "paused"
      ? primarySession.role === "managing" ? "Run session" : "View my court"
      : primarySession.role === "managing" ? "Start playing" : "Open session"
    : "Start a session";
  const showJoinSquadPanel = groupsLoaded && groups.length === 0;
  const hasSessionFocus = Boolean(primarySession);
  const topCardIsProminent = hasSessionFocus || showJoinSquadPanel;
  const summaryLabel = activeSession ? "Playing now" : nextSession ? "Next session" : showJoinSquadPanel ? "Join your squad" : `Hi, ${firstName}`;
  const summaryTitle = showJoinSquadPanel
    ? "Find your people"
    : primarySession
      ? primarySession.name
      : "Your squads are ready";
  const summaryDetail = primarySession
    ? `${primarySession.name} - ${formatSessionStatus(primarySession.status)}`
    : showJoinSquadPanel
      ? "Use an invite code or search below."
      : `${groups.length} ${groups.length === 1 ? "squad" : "squads"} - ${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}`;

  useEffect(() => {
    if (!user) return;
    const unsub = watchUserGroups(
      user.uid,
      (g) => {
        setGroups(g);
        setGroupsLoaded(true);
      },
      () => {
        setGroups([]);
        setGroupsLoaded(true);
      },
    );
    void getMySessionsAction().then((r) => { if (r.ok) setMySessions(r.data); }).catch(() => {});
    return unsub;
  }, [user?.uid]);

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || joinBusy) return;
    setJoinBusy(true);
    setJoinError(null);
    const res = await joinSquadByCode(joinCode).catch(() => null);
    setJoinBusy(false);
    if (!res || !res.ok) {
      setJoinError(res?.message ?? "Could not join. Check the code.");
      return;
    }
    router.push(`/groups/${res.data.squadId}`);
  };

  const runSquadSearch = (query: string) => {
    setSquadQuery(query);
    if (squadSearchDebounce.current) clearTimeout(squadSearchDebounce.current);
    if (query.trim().length < 2) {
      setSquadResults([]);
      setSearchingSquads(false);
      return;
    }
    squadSearchDebounce.current = setTimeout(async () => {
      setSearchingSquads(true);
      const res = await searchSquads(query).catch(() => null);
      setSearchingSquads(false);
      if (res?.ok) setSquadResults(res.data);
    }, 300);
  };

  const handleRequestToJoin = async (squadId: string) => {
    setRequestedIds((prev) => ({ ...prev, [squadId]: true }));
    const res = await requestToJoinSquad(squadId).catch(() => null);
    if (res?.ok && res.data.status === "joined") router.push(`/groups/${squadId}`);
  };

  const updateDashboardSession = (
    sessionId: string,
    update: (session: SessionSummaryData) => SessionSummaryData,
  ) => {
    setMySessions((current) => current ? {
      organising: current.organising.map((session) => session.id === sessionId ? update(session) : session),
      playing: current.playing.map((session) => session.id === sessionId ? update(session) : session),
    } : current);
  };

  const handleRsvp = async (session: DashboardSession, status: "going" | "not_going") => {
    if (rsvpLoading.has(session.id) || session.myRsvpStatus === status) return;

    const previous = {
      myRsvpStatus: session.myRsvpStatus,
      rsvpGoingCount: session.rsvpGoingCount,
      rsvpNotGoingCount: session.rsvpNotGoingCount,
    };
    setRsvpLoading((current) => new Set(current).add(session.id));
    setRsvpErrors((current) => ({ ...current, [session.id]: "" }));
    updateDashboardSession(session.id, (current) => ({
      ...current,
      myRsvpStatus: status,
      rsvpGoingCount: Math.max(0, current.rsvpGoingCount
        + (status === "going" ? 1 : 0)
        - (current.myRsvpStatus === "going" ? 1 : 0)),
      rsvpNotGoingCount: Math.max(0, current.rsvpNotGoingCount
        + (status === "not_going" ? 1 : 0)
        - (current.myRsvpStatus === "not_going" ? 1 : 0)),
    }));

    const result = await rsvpToSession(session.id, status).catch(() => null);
    if (!result?.ok) {
      updateDashboardSession(session.id, (current) => ({ ...current, ...previous }));
      setRsvpErrors((current) => ({
        ...current,
        [session.id]: result?.message ?? "Could not update RSVP.",
      }));
    } else {
      updateDashboardSession(session.id, (current) => ({
        ...current,
        myRsvpStatus: result.data.status,
        rsvpGoingCount: result.data.rsvpGoingCount,
        rsvpNotGoingCount: result.data.rsvpNotGoingCount,
      }));
    }
    setRsvpLoading((current) => {
      const next = new Set(current);
      next.delete(session.id);
      return next;
    });
  };

  return (
    <div style={{
      maxWidth: 480,
      margin: "0 auto",
      padding: "0.875rem 1rem 2rem",
      display: "flex",
      flexDirection: "column",
      gap: "0.875rem",
    }}>
      <section style={{
        background: "var(--ink-800)",
        borderRadius: "var(--r-xl)",
        padding: topCardIsProminent ? "1rem" : "0.875rem 1rem",
        position: "relative",
        overflow: "hidden",
        animation: "pb-rise 400ms var(--ease-out) both",
      }}>
        <div aria-hidden="true" style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(198,241,53,0.05) 0 1px, transparent 1px 18px), repeating-linear-gradient(-45deg, rgba(198,241,53,0.05) 0 1px, transparent 1px 18px)",
          pointerEvents: "none",
        }} />
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: primarySession ? "minmax(0, 1fr) auto" : "minmax(0, 1fr)", alignItems: "center", gap: "0.875rem" }}>
          <div style={{ minWidth: 0 }}>
            <span style={{
              display: "inline-flex",
              padding: "3px 9px",
              borderRadius: "var(--r-pill)",
              background: "var(--volt-500)",
              color: "var(--ink-800)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.625rem",
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "0.5rem",
            }}>
              {summaryLabel}
            </span>
            <h1 style={{
              color: "var(--n-50)",
              fontFamily: "var(--font-display-tight)",
              fontSize: topCardIsProminent ? "1.45rem" : "1.15rem",
              fontWeight: 900,
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {summaryTitle}
            </h1>
            <p style={{
              color: "rgba(246,248,244,0.62)",
              fontSize: "0.8125rem",
              marginTop: "0.3rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {summaryDetail}
            </p>
          </div>
          {primarySession && (
            <Link href={primaryHref} style={{
              minHeight: 48,
              padding: "0 0.875rem",
              borderRadius: "var(--r-lg)",
              background: "var(--volt-500)",
              color: "var(--ink-800)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}>
              {primaryLabel}
            </Link>
          )}
        </div>
      </section>

      {isSuperAdmin && (
        <Link href="/admin" className="pb-btn pb-btn-secondary" style={{ textDecoration: "none", justifyContent: "center" }}>
          Super Admin
        </Link>
      )}

      {showJoinSquadPanel && (
        <section style={{
          background: "rgba(198,241,53,0.12)",
          border: "1.5px solid rgba(198,241,53,0.55)",
          borderRadius: "var(--r-xl)",
          padding: "1rem",
          boxShadow: "var(--shadow-volt)",
          animation: "pb-rise 400ms 80ms var(--ease-out) both",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.875rem" }}>
            <div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
                New here?
              </span>
              <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.35rem", fontWeight: 900, letterSpacing: "-0.02em", marginTop: "0.15rem" }}>
                Find your squad
              </h2>
            </div>
            <Link href="/groups" style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)", textDecoration: "none", whiteSpace: "nowrap", paddingTop: "0.25rem" }}>
              Create
            </Link>
          </div>

          <form onSubmit={handleJoinByCode} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <input className="pb-input" value={joinCode} onChange={(e) => { setJoinCode(e.target.value); setJoinError(null); }} placeholder="Invite code" style={{ marginTop: 0, textTransform: "uppercase", letterSpacing: "0.08em" }} />
            <button type="submit" disabled={!joinCode.trim() || joinBusy} className="pb-btn pb-btn-volt" style={{ width: "auto", padding: "0 1rem", minWidth: 74 }}>
              {joinBusy ? "..." : "Join"}
            </button>
          </form>
          {joinError && <p style={{ color: "var(--danger)", fontSize: "0.8125rem", fontWeight: 800, marginBottom: "0.5rem" }}>{joinError}</p>}

          <div className="pb-divider" style={{ margin: "0.25rem 0 0.625rem" }}>or search by name</div>

          <input className="pb-input" value={squadQuery} onChange={(e) => runSquadSearch(e.target.value)} placeholder="Search squads" style={{ marginTop: 0 }} />

          {squadQuery.trim().length >= 2 && (
            <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.625rem" }}>
              {searchingSquads && <p style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>Searching...</p>}
              {!searchingSquads && squadResults.length === 0 && <p style={{ color: "var(--text-3)", fontSize: "0.8125rem", margin: 0 }}>No squads match that name.</p>}
              {squadResults.map((squad) => {
                const requested = squad.relation === "requested" || requestedIds[squad.squadId];
                return (
                  <div key={squad.squadId} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.5rem", alignItems: "center", background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "0.625rem 0.75rem" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: "var(--text-1)", fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{squad.name}</div>
                      <div style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>{squad.memberCount} member{squad.memberCount !== 1 ? "s" : ""}</div>
                    </div>
                    {squad.relation === "member" ? (
                      <Link href={`/groups/${squad.squadId}`} className="pb-btn pb-btn-ghost" style={{ width: "auto", height: 36, padding: "0 0.875rem", fontSize: "0.8125rem" }}>Open</Link>
                    ) : requested ? (
                      <span style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>Requested</span>
                    ) : (
                      <button type="button" onClick={() => handleRequestToJoin(squad.squadId)} style={{ height: 36, padding: "0 0.875rem", border: "none", borderRadius: "var(--r-md)", background: "var(--ink-800)", color: "var(--volt-500)", fontWeight: 900, cursor: "pointer", fontSize: "0.8125rem" }}>Request</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section style={{ animation: "pb-rise 400ms 100ms var(--ease-out) both" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.625rem" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
            Your squads
          </span>
          <Link href="/groups" className="pb-dashboard-create">
            Create
          </Link>
        </div>

        {!groupsLoaded ? (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.25rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-3)", letterSpacing: "0.05em" }}>Loading squads...</span>
          </div>
        ) : groups.length === 0 ? (
          <div style={{ background: "var(--surface)", border: "2px dashed var(--border)", borderRadius: "var(--r-xl)", padding: "1.25rem", textAlign: "center" }}>
            <p style={{ color: "var(--text-2)", fontSize: "0.9375rem", lineHeight: 1.5 }}>Join a squad above, or create one for your regular crew.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {groups.map((group, i) => {
              const initial = group.name[0]?.toUpperCase() ?? "?";
              return (
                <Link key={group.id} href={`/groups/${group.id}`} className="press" style={{ display: "flex", alignItems: "center", gap: "0.875rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "0.875rem 1rem", textDecoration: "none", boxShadow: "var(--shadow-sm)", animation: `pb-rise 400ms ${100 + i * 40}ms var(--ease-out) both` }}>
                  <div style={{ width: 40, height: 40, borderRadius: "var(--r-lg)", background: "var(--ink-800)", display: "grid", placeItems: "center", fontFamily: "var(--font-display-tight)", fontWeight: 900, fontSize: "1.0625rem", color: "var(--volt-500)", flexShrink: 0 }}>
                    {initial}
                  </div>
                  <span style={{ fontWeight: 800, fontSize: "0.9375rem", color: "var(--text-1)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.name}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {groupsLoaded && groups.length > 0 && (
        <nav aria-label="Dashboard shortcuts" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.5rem", animation: "pb-rise 400ms 120ms var(--ease-out) both" }}>
          <Link href="/groups" style={utilityLinkStyle}>Join squad</Link>
          <Link href="/leaderboard" style={utilityLinkStyle}>Rankings</Link>
          <Link href="/bookings" style={utilityLinkStyle}>Book court</Link>
        </nav>
      )}

      <section style={{ animation: "pb-rise 400ms 140ms var(--ease-out) both" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.625rem" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>Sessions</span>
          {sessions.length > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{sessions.length} total</span>}
        </div>

        {!mySessions ? (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.25rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-3)" }}>Loading...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ background: "var(--surface)", border: "2px dashed var(--border)", borderRadius: "var(--r-xl)", padding: "1.25rem", textAlign: "center" }}>
            <p style={{ color: "var(--text-2)", fontSize: "0.9375rem" }}>No sessions yet.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {sessions.map((session, i) => {
              const statusTone = session.status === "active"
                ? { bg: "var(--volt-500)", fg: "var(--ink-800)" }
                : session.status === "paused"
                  ? { bg: "var(--warning-bg)", fg: "var(--warning)" }
                  : session.status === "completed"
                    ? { bg: "var(--emerald-100)", fg: "var(--emerald-700)" }
                    : { bg: "var(--surface-sunken)", fg: "var(--text-3)" };
              const roleTone = session.role === "managing"
                ? { bg: "var(--ink-800)", fg: "var(--volt-500)", label: "Managing" }
                : null;
              const dateLabel = session.startsAt
                ? new Date(session.startsAt).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
                : "";
              const href = session.role === "managing" ? `/sessions/${session.id}/live` : `/sessions/${session.id}/player`;
              const canRsvp = session.status === "scheduled" || session.status === "draft";
              const isRsvpBusy = rsvpLoading.has(session.id);
              const isCasual = session.myPlayerKind === "casual";
              const actionLabel = session.role === "managing"
                ? session.status === "active" || session.status === "paused"
                  ? "Run session"
                  : session.status === "completed"
                    ? "View results"
                    : "Start playing"
                : session.status === "completed"
                  ? "View results"
                  : session.status === "active" || session.status === "paused"
                    ? session.myRsvpStatus === "going" ? "View my court" : "Open session"
                    : isCasual
                      ? session.myRsvpStatus === "going" ? "Interested" : "Show interest"
                      : session.myRsvpStatus === "not_going" ? "Away" : "You're in by default";

              return (
                <div key={session.id} data-testid="session-list-item" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-sm)", overflow: "hidden", animation: `pb-rise 400ms ${140 + i * 30}ms var(--ease-out) both` }}>
                  <Link href={href} style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: "0.75rem", padding: "0.875rem 1rem", textDecoration: "none" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", alignItems: "flex-start" }}>
                      <span style={{ padding: "2px 7px", borderRadius: "var(--r-pill)", background: statusTone.bg, color: statusTone.fg, fontFamily: "var(--font-mono)", fontSize: "0.5625rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{formatSessionStatus(session.status)}</span>
                      {roleTone && <span style={{ padding: "2px 7px", borderRadius: "var(--r-pill)", background: roleTone.bg, color: roleTone.fg, fontFamily: "var(--font-mono)", fontSize: "0.5625rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{roleTone.label}</span>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text-1)" }}>{session.name}</div>
                      {dateLabel && <div style={{ color: "var(--text-3)", fontSize: "0.8125rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{session.venueName ? `${session.venueName} - ` : ""}{dateLabel}</div>}
                      <div style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: "0.625rem", fontWeight: 800, letterSpacing: "0.06em", marginTop: "0.25rem", textTransform: "uppercase" }}>{actionLabel}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
                  </Link>

                  {canRsvp && (
                    <div style={{ borderTop: "1px solid var(--border)", padding: "0.75rem 1rem", display: "grid", gap: "0.5rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)" }}>
                          {isCasual ? "Casual interest" : "You're in by default"}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>
                          {session.rsvpGoingCount} going
                        </span>
                      </div>
                      <div role="group" aria-label={`RSVP for ${session.name}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                        <button
                          type="button"
                          data-testid="rsvp-going-btn"
                          aria-pressed={session.myRsvpStatus === "going"}
                          disabled={isRsvpBusy}
                          onClick={() => handleRsvp(session, "going")}
                          style={{ minHeight: 40, borderRadius: "var(--r-md)", border: session.myRsvpStatus === "going" ? "1px solid var(--volt-500)" : "1px solid var(--border)", background: session.myRsvpStatus === "going" ? "var(--volt-500)" : "var(--surface-sunken)", color: "var(--ink-800)", fontWeight: 900, cursor: isRsvpBusy ? "wait" : "pointer", opacity: isRsvpBusy ? 0.6 : 1 }}
                        >
                          {isCasual ? "I'm interested" : session.myRsvpStatus === "not_going" ? "I'm back in" : "I'm in"}
                        </button>
                        <button
                          type="button"
                          data-testid="rsvp-not-going-btn"
                          aria-pressed={session.myRsvpStatus === "not_going"}
                          disabled={isRsvpBusy}
                          onClick={() => handleRsvp(session, "not_going")}
                          style={{ minHeight: 40, borderRadius: "var(--r-md)", border: session.myRsvpStatus === "not_going" ? "1px solid var(--danger)" : "1px solid var(--border)", background: session.myRsvpStatus === "not_going" ? "rgba(240,62,62,0.1)" : "var(--surface-sunken)", color: session.myRsvpStatus === "not_going" ? "var(--danger)" : "var(--text-1)", fontWeight: 900, cursor: isRsvpBusy ? "wait" : "pointer", opacity: isRsvpBusy ? 0.6 : 1 }}
                        >
                          {isCasual ? "Not interested" : "I'm away"}
                        </button>
                      </div>
                      {rsvpErrors[session.id] && <p role="alert" style={{ color: "var(--danger)", fontSize: "0.75rem", fontWeight: 800 }}>{rsvpErrors[session.id]}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
