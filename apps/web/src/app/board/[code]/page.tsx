"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import {
  getBoardData,
  deriveViewerState,
  courtCurrentMatch,
  benchPlayers,
  type BoardData,
  type BoardMatch,
} from "@/lib/sessions/board";
import { formatSessionStatus } from "@/lib/format/status";

function titleCase(v: string) {
  return v.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}
function firstName(n: string) {
  return n.split(" ")[0];
}
const POLL_MS = 15000;

export default function BoardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);

  const [data, setData] = useState<BoardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    try {
      const fresh = await getBoardData(code);
      setData(fresh);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e.message || "Failed to load board.");
    }
  }, [code]);

  useEffect(() => {
    void load();

    // The board is left open on a phone all evening. Polling a hidden tab burns
    // a full session read every 15s for nobody, so pause while it is not
    // visible and refetch immediately when it comes back.
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => void load(), POLL_MS);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void load();
        start();
      } else {
        stop();
      }
    };

    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [load]);

  const storeKey = data ? `pb-board-me:${data.sessionId}` : null;
  useEffect(() => {
    if (!storeKey) return;
    try {
      setMeId(window.localStorage.getItem(storeKey));
    } catch {
      /* ignore */
    }
  }, [storeKey]);

  const pickMe = (playerId: string | null) => {
    setMeId(playerId);
    setPicking(false);
    if (!storeKey) return;
    try {
      if (playerId) window.localStorage.setItem(storeKey, playerId);
      else window.localStorage.removeItem(storeKey);
    } catch {
      /* ignore */
    }
  };

  const me = useMemo(
    () => (data && meId ? data.roster.find((p) => p.playerId === meId) ?? null : null),
    [data, meId],
  );
  const viewer = useMemo(
    () => (data && meId ? deriveViewerState(data.matches, meId) : null),
    [data, meId],
  );
  const bench = useMemo(
    () => (data ? benchPlayers(data.matches, data.roster) : []),
    [data],
  );

  if (loadError) {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "grid", placeItems: "center", padding: "1.25rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem", maxWidth: 400, width: "100%", textAlign: "center" }}>
          <p style={{ color: "var(--danger)", fontWeight: 800 }}>{loadError}</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "grid", placeItems: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Loading…
        </span>
      </div>
    );
  }

  const isLive = data.sessionStatus === "active" || data.sessionStatus === "paused";
  const showPicker = picking || (isLive && !meId);

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "2.5rem" }}>
      {/* Header */}
      <header style={{ background: "var(--ink-800)", maxWidth: 900, margin: "0.75rem auto 0", borderRadius: "var(--r-2xl)", padding: "1.35rem 1.25rem 1.15rem", position: "relative", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(45deg, rgba(198,241,53,0.055) 0 1px, transparent 1px 18px), repeating-linear-gradient(-45deg, rgba(198,241,53,0.055) 0 1px, transparent 1px 18px)", pointerEvents: "none" }} />
        <div style={{ position: "relative", maxWidth: 760, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 9px", borderRadius: "var(--r-pill)", background: "var(--volt-500)", color: "var(--ink-800)", fontFamily: "var(--font-mono)", fontSize: "0.625rem", fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {titleCase(data.sport)} · score board
              </span>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.8rem, 5vw, 2.75rem)", lineHeight: 1, fontWeight: 900, color: "var(--n-50)", textTransform: "uppercase", letterSpacing: "-0.025em", marginTop: "0.65rem", overflowWrap: "anywhere" }}>
                {data.sessionName}
              </h1>
              <p style={{ color: "rgba(246,248,244,0.62)", fontSize: "0.875rem", marginTop: "0.4rem" }}>
                Follow the courts and your place in the session.
              </p>
            </div>
            <span style={{ display: "inline-flex", flexShrink: 0, padding: "4px 10px", borderRadius: "var(--r-pill)", background: isLive ? "var(--volt-500)" : "rgba(246,248,244,0.12)", color: isLive ? "var(--ink-800)" : "var(--n-50)", fontFamily: "var(--font-mono)", fontSize: "0.625rem", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {isLive ? "● Playing now" : formatSessionStatus(data.sessionStatus)}
            </span>
          </div>

          {/* Identity row */}
          {isLive && (
            <div style={{ marginTop: "0.85rem" }}>
              {me && !showPicker ? (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ padding: "6px 12px", borderRadius: "var(--r-pill)", background: "var(--volt-500)", color: "var(--ink-800)", fontWeight: 800, fontSize: "0.8125rem" }}>
                    {me.displayName} ✓
                  </span>
                  <button onClick={() => setPicking(true)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "rgba(246,248,244,0.55)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    not you?
                  </button>
                </div>
              ) : (
                <div style={{ background: "rgba(246,248,244,0.08)", border: "1px solid rgba(246,248,244,0.12)", borderRadius: "var(--r-md)", padding: "0.6rem 0.7rem" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--volt-300)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.45rem" }}>
                    Tap your name to follow your matches
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                    {data.roster.map((p) => (
                      <button
                        key={p.playerId}
                        onClick={() => pickMe(p.playerId)}
                        style={{ padding: "7px 12px", borderRadius: "var(--r-pill)", background: p.playerId === meId ? "var(--volt-500)" : "var(--surface-sunken)", border: p.playerId === meId ? "1.5px solid var(--ink-800)" : "1.5px solid var(--border)", color: p.playerId === meId ? "var(--ink-800)" : "var(--text-2)", fontWeight: 700, fontSize: "0.8125rem", cursor: "pointer" }}
                      >
                        {p.displayName}
                      </button>
                    ))}
                    {data.roster.length === 0 && (
                      <span style={{ color: "rgba(246,248,244,0.55)", fontSize: "0.8125rem" }}>No players yet.</span>
                    )}
                  </div>
                  {meId && (
                    <button onClick={() => pickMe(null)} style={{ marginTop: "0.5rem", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "rgba(246,248,244,0.55)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      clear my pick
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "1rem 1.15rem", display: "grid", gap: "0.9rem" }}>

        {!isLive && (
          <div style={{ background: "var(--surface)", border: "2px dashed var(--border)", borderRadius: "var(--r-xl)", padding: "2rem 1.25rem", textAlign: "center" }}>
            <p style={{ color: "var(--text-2)", fontWeight: 700 }}>
              {data.sessionStatus === "completed" ? "This session has ended — final standings below." : "Matches appear here once the organiser starts the session."}
            </p>
          </div>
        )}

        {/* Personalised viewer block */}
        {isLive && viewer && me && (
          <PersonalBlock viewer={viewer} scoringMode={data.scoringMode} />
        )}

        {/* Courts */}
        {isLive && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
              <SectionLabel>On court now</SectionLabel>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{data.courts.length} {data.courts.length === 1 ? "court" : "courts"}</span>
            </div>
            {data.courts.map((court) => {
              const m = courtCurrentMatch(data.matches, court.courtId);
              const mine = m && meId ? m.teamA.concat(m.teamB).some((p) => p.playerId === meId) : false;
              return (
                <div key={court.courtId} style={{ border: mine ? "2px solid var(--volt-500)" : "1px solid var(--border)", background: mine ? "rgba(198,241,53,0.12)" : "var(--surface)", borderRadius: "var(--r-xl)", padding: "1rem 1.05rem", boxShadow: "var(--shadow-sm)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: m ? "0.5rem" : 0 }}>
                    <span style={{ fontFamily: "var(--font-display-tight)", fontSize: "1rem", fontWeight: 900, letterSpacing: "-0.02em" }}>{court.courtName}</span>
                    {m ? (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: m.status === "in_progress" ? "var(--volt-600)" : "var(--text-3)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        {m.status === "in_progress" ? "● Playing" : "Warming up"}
                      </span>
                    ) : (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-3)" }}>Open</span>
                    )}
                  </div>
                  {m && <TeamsRow m={m} meId={meId} />}
                </div>
              );
            })}

            {/* Bench */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", background: "var(--warning-bg)", border: "1px solid rgba(217,147,24,0.22)", borderRadius: "var(--r-lg)", padding: "0.7rem 0.85rem" }}>
              <span style={{ fontSize: "1rem", lineHeight: 1 }}>🪑</span>
              <div style={{ fontSize: "0.8125rem", color: "#8a5a08" }}>
                <b>On the bench:</b> {bench.length ? bench.map((p) => p.displayName).join(", ") : "nobody — everyone's on."}
              </div>
            </div>
          </>
        )}

        {/* Leaderboard */}
        {data.leaderboard.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-2xl)", padding: "1rem 1.05rem", boxShadow: "var(--shadow-sm)" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.7rem" }}>
              <div>
                <SectionLabel>Standings</SectionLabel>
                <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.35rem", lineHeight: 1, fontWeight: 900, letterSpacing: "-0.02em", marginTop: "0.35rem" }}>Leaderboard</h2>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{Math.min(data.leaderboard.length, 12)} players</span>
            </div>
            <div style={{ ...boardLeaderGrid(data.scoringMode), padding: "0 0.15rem 0.35rem", fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <span>#</span>
              <span>Player</span>
              <span style={{ textAlign: "right" }}>Grade</span>
              <span style={{ textAlign: "right" }}>G</span>
              <span style={{ textAlign: "right" }}>W</span>
              <span style={{ textAlign: "right" }}>L</span>
              <span style={{ textAlign: "right" }}>Win%</span>
              {data.scoringMode === "points" && <span style={{ textAlign: "right" }}>PD</span>}
            </div>
            {data.leaderboard.slice(0, 12).map((row, i) => {
              const mine = row.playerId === meId;
              const pct = row.gamesPlayed > 0 ? Math.round((row.wins / row.gamesPlayed) * 100) : 0;
              return (
                <div key={row.playerId} style={{ ...boardLeaderGrid(data.scoringMode), alignItems: "center", padding: "0.7rem 0.15rem", borderBottom: i === Math.min(data.leaderboard.length, 12) - 1 ? "none" : "1px solid var(--border)", background: mine ? "rgba(198,241,53,0.11)" : "transparent", borderRadius: mine ? "var(--r-md)" : 0 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 900, color: i === 0 ? "var(--volt-600)" : "var(--text-3)", fontSize: "0.8125rem" }}>{i + 1}</span>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: mine ? 900 : 700, color: mine ? "var(--volt-600)" : "var(--text-1)", fontSize: "0.9rem" }}>{row.displayName}{mine ? " (you)" : ""}</span>
                  <span style={{ fontFamily: "var(--font-display-tight)", fontSize: "0.8125rem", fontWeight: 900, color: row.grade ? "var(--ink-800)" : "var(--text-3)", textAlign: "right" }}>{row.grade ?? "–"}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 800, color: "var(--text-1)", textAlign: "right" }}>{row.gamesPlayed}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 800, color: "var(--volt-600)", textAlign: "right" }}>{row.wins}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-3)", textAlign: "right" }}>{row.losses}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 800, textAlign: "right", color: pct >= 50 ? "var(--volt-600)" : "var(--text-2)" }}>{pct}%</span>
                  {data.scoringMode === "points" && (
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 900, fontSize: "0.875rem", textAlign: "right", color: row.pointDifference > 0 ? "var(--volt-600)" : row.pointDifference < 0 ? "var(--danger)" : "var(--text-1)" }}>{row.pointDifference > 0 ? `+${row.pointDifference}` : row.pointDifference}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

/** One column template for the standings header and its rows. */
function boardLeaderGrid(scoringMode: string): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: `1.75rem minmax(0, 1fr) 2.75rem 2.25rem 2.25rem 2.25rem 3rem${scoringMode === "points" ? " 3.25rem" : ""}`,
    gap: "0.4rem",
  };
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-3)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{children}</div>
  );
}

function TeamsRow({ m, meId }: { m: BoardMatch; meId: string | null }) {
  const name = (p: { playerId: string; displayName: string }) => (
    <div key={p.playerId} style={{ fontWeight: 800, fontSize: "0.875rem", color: p.playerId === meId ? "var(--volt-600)" : "var(--text-1)" }}>{p.displayName}</div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "0.5rem", alignItems: "center" }}>
      <div>{m.teamA.map(name)}</div>
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-3)", fontSize: "0.75rem" }}>VS</span>
      <div style={{ textAlign: "right" }}>{m.teamB.map(name)}</div>
    </div>
  );
}

function PersonalBlock({ viewer, scoringMode }: { viewer: NonNullable<ReturnType<typeof deriveViewerState>>; scoringMode: string }) {
  const { playingNow, upNext, results } = viewer;

  return (
    <div style={{ display: "grid", gap: "0.7rem" }}>
      {/* Primary state */}
      {playingNow ? (
        <HeroCard kicker="You're on court now" court={playingNow.courtName} m={playingNow} />
      ) : upNext ? (
        <HeroCard kicker="You're up — head to court" court={upNext.courtName} m={upNext} />
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-2xl)", padding: "1.5rem 1.25rem", textAlign: "center", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ fontSize: "1.6rem", marginBottom: "0.35rem" }}>🪑</div>
          <div style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.2rem", fontWeight: 900 }}>You're on the bench</div>
          <p style={{ color: "var(--text-2)", marginTop: "0.25rem", fontSize: "0.9rem" }}>Hang tight — you'll be assigned the moment a court frees up.</p>
        </div>
      )}

      {/* Secondary "up next" only when also playing now */}
      {playingNow && upNext && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "0.85rem 0.95rem", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.4rem" }}>Up next</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
            <div style={{ fontWeight: 800, fontSize: "0.9rem" }}>{upNext.courtName}</div>
            <div style={{ color: "var(--text-2)", fontSize: "0.8125rem", textAlign: "right" }}>
              {upNext.teamA.concat(upNext.teamB).map((p) => firstName(p.displayName)).join(" · ")}
            </div>
          </div>
        </div>
      )}

      {/* Honest "next unknown" note when playing and nothing queued */}
      {playingNow && !upNext && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-3)", letterSpacing: "0.04em", padding: "0 0.25rem" }}>
          Your next match isn't decided yet — it depends on who finishes first.
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.4rem" }}>Your results</div>
          <div style={{ display: "grid", gap: "0.4rem" }}>
            {results.map((m) => (
              <ResultRow key={m.matchId} m={m} scoringMode={scoringMode} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultRow({ m, scoringMode }: { m: BoardMatch; scoringMode: string }) {
  const hasScore = m.teamAScore !== null && m.teamBScore !== null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0.6rem", alignItems: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "0.6rem 0.75rem" }}>
      <span style={{ color: "var(--text-2)", fontWeight: 700, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {m.teamA.map((p) => firstName(p.displayName)).join(" & ")} vs {m.teamB.map((p) => firstName(p.displayName)).join(" & ")}
      </span>
      {scoringMode === "points" && hasScore && (
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)", fontSize: "0.8125rem" }}>{m.teamAScore}–{m.teamBScore}</span>
      )}
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--text-3)" }}>Done</span>
    </div>
  );
}

function HeroCard({ kicker, court, m }: { kicker: string; court: string; m: BoardMatch }) {
  return (
    <div style={{ background: "rgba(198,241,53,0.14)", border: "2px solid var(--volt-500)", borderRadius: "var(--r-2xl)", padding: "1.25rem", textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--volt-600)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.3rem" }}>{kicker}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em" }}>{court}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "0.6rem", alignItems: "center", marginTop: "0.9rem" }}>
        <div style={{ background: "var(--surface)", borderRadius: "var(--r-md)", padding: "0.6rem" }}>
          {m.teamA.map((p) => <div key={p.playerId} style={{ fontWeight: 800, fontSize: "0.9rem" }}>{p.displayName}</div>)}
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-3)", fontSize: "0.75rem" }}>VS</span>
        <div style={{ background: "var(--surface)", borderRadius: "var(--r-md)", padding: "0.6rem" }}>
          {m.teamB.map((p) => <div key={p.playerId} style={{ fontWeight: 800, fontSize: "0.9rem" }}>{p.displayName}</div>)}
        </div>
      </div>
    </div>
  );
}
