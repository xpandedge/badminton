"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardData } from "@/lib/sessions/board";
import { advanceTv, currentTvMatches, initialTvState, tvPage } from "@/lib/sessions/tv";
import styles from "./tv.module.css";

export function TvBoard({ data, disconnected = false, updatedAt, demo = false }: {
  data: BoardData; disconnected?: boolean; updatedAt: number; demo?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [state, setState] = useState(initialTvState);
  const [fullscreenError, setFullscreenError] = useState("");
  const wasSuspended = useRef(false);
  const courtIds = useMemo(() => data.courts.map(c => c.courtId), [data.courts]);
  const matches = useMemo(() => currentTvMatches(data.matches, courtIds, data.sessionFormat === "fixed_pair_round_robin"), [data.matches, courtIds, data.sessionFormat]);
  const stale = disconnected || now - updatedAt > 45_000;
  const active = data.sessionStatus === "active";
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const baseline = stale || !active || wasSuspended.current;
    wasSuspended.current = stale || !active;
    setState(previous => advanceTv(previous, matches, now, baseline));
  }, [matches, now, stale, active]);
  const page = tvPage(state, courtIds, now);
  const priority = active && !stale ? state.pending.slice(0, 4).map(p => p.courtId) : [];
  const busy = new Set(matches.flatMap(m => [...m.teamA, ...m.teamB].map(p => p.playerId)));
  const waiting = data.roster.filter(p => !busy.has(p.playerId) && ["active", "checked_in"].includes(p.availability ?? "active"));
  const waitingPage = Math.floor(now / 10_000) % Math.max(1, Math.ceil(waiting.length / 6));
  const completed = data.sessionStatus === "completed";
  const status = stale ? "Connection lost — assignments may be outdated" : data.sessionStatus === "paused" ? "Session paused" : completed ? "Session complete" : active ? "Live" : "Waiting for the session to start";
  async function fullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch { setFullscreenError("Use your browser’s fullscreen option if available."); }
  }
  return <div className={styles.screen} data-testid="tv-board">
    <header className={styles.header}>
      <div className={styles.brand}>DUO<span>RALLY</span>{demo && <small>DEMO</small>}</div>
      <h1>{data.sessionName}</h1>
      <div className={styles.connection} role="status">{status}</div>
    </header>
    {completed ? <main className={styles.results}><h2>Final standings</h2>
      {data.leaderboard.length ? data.leaderboard.slice((Math.floor(now / 10_000) % Math.ceil(data.leaderboard.length / 8)) * 8, ((Math.floor(now / 10_000) % Math.ceil(data.leaderboard.length / 8)) + 1) * 8).map((p) => <div key={p.playerId}><b>{data.leaderboard.indexOf(p) + 1}. {p.displayName}</b><span>{p.wins} wins · {p.gamesPlayed} games</span></div>) : <p>Thanks for playing.</p>}
    </main> : active || data.sessionStatus === "paused" ? <main className={`${styles.courts} ${page.length <= 2 ? styles.two : ""}`}>
      {page.map(id => {
        const court = data.courts.find(c => c.courtId === id)!;
        const match = matches.find(m => m.courtId === id);
        const highlighted = priority.includes(id);
        return <section className={`${styles.court} ${highlighted ? styles.highlight : ""}`} key={id} data-testid="tv-court">
          <div className={styles.courtHeading}><h2>{court.courtName}</h2><span>{highlighted ? "Head to court" : match ? "On court" : "Open"}</span></div>
          {match ? <div className={styles.teams}>
            <div>{match.teamA.map(p => <p key={p.playerId}>{p.displayName}</p>)}</div>
            <span className={styles.vs}>VS</span>
            <div>{match.teamB.map(p => <p key={p.playerId}>{p.displayName}</p>)}</div>
          </div> : <p className={styles.empty}>Waiting for an assignment</p>}
        </section>;
      })}
      {!page.length && <p>No active courts.</p>}
    </main> : <main className={styles.results}><h2>{status}</h2><p>Court assignments will appear here.</p></main>}
    <footer className={styles.footer}>
      {priority.length > 0 ? <div className={styles.notice}><b>NEW ASSIGNMENT</b> {priority.map(id => data.courts.find(c => c.courtId === id)?.courtName).join(" · ")}<span>Find your name above</span></div>
        : <div className={styles.waiting}><b>{completed ? "THANKS FOR PLAYING" : "WAITING TO PLAY"}</b><span>{completed ? "See you next time." : waiting.slice(waitingPage * 6, waitingPage * 6 + 6).map(p => p.displayName).join(" · ") || "No players waiting"}</span>{waiting.length > 6 && <small>{waitingPage + 1}/{Math.ceil(waiting.length / 6)}</small>}</div>}
      <div className={styles.bottom}><span>{priority.length ? "New assignments take priority" : courtIds.length > 4 && !completed ? `Courts ${page.map(id => courtIds.indexOf(id) + 1).join(", ")} of ${courtIds.length} · changes every 10s` : `${courtIds.length} courts`}</span><span>{stale ? "Reconnecting…" : `Updated ${Math.max(0, Math.floor((now - updatedAt) / 1000))}s ago`}</span><button onClick={fullscreen}>Fullscreen</button></div>
      {fullscreenError && <small role="status">{fullscreenError}</small>}
    </footer>
  </div>;
}
