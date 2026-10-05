"use client";
import { useEffect, useState } from "react";
import type { BoardData } from "@/lib/sessions/board";
import { TvBoard } from "./TvBoard";
import styles from "./tv.module.css";

function sample(count: number): BoardData {
  const names = ["Sarah Chen", "James Wilson", "Priya Patel", "Tom Davies", "Emma Clarke", "Noah Williams", "Olivia Brown", "Liam Taylor", "Mia Johnson", "Ethan Lee", "Sophie Martin", "Lucas Nguyen", "Ava Thompson", "Jack Harris", "Chloe Anderson", "Ben Walker", "Grace Kim", "Oliver Scott", "Zoe Wright", "Henry Evans", "Ruby Carter", "Leo Singh", "Amelia Jones", "Oscar Wang", "Isla Moore", "Archie Hill", "Ella King", "Hugo Green"];
  const roster = names.slice(0, count * 4 + 4).map((displayName, i) => ({ playerId: `p${i}`, displayName, availability: "active" }));
  const courts = Array.from({ length: count }, (_, i) => ({ courtId: `c${i + 1}`, courtName: `Court ${i + 1}` }));
  return { sessionId: "tv-demo", sessionName: "Friday night social", sessionStatus: "active", sport: "pickleball", scoringMode: "winner_only", courts, roster,
    matches: courts.map((court, i) => ({ ...court, matchId: `m${i}`, roundNumber: 1, status: "scheduled", teamA: roster.slice(i * 4, i * 4 + 2), teamB: roster.slice(i * 4 + 2, i * 4 + 4), winnerTeam: null, teamAScore: null, teamBScore: null })), leaderboard: [] };
}
export function TvDemo() {
  const [data, setData] = useState(() => sample(6));
  const [generation, setGeneration] = useState(0);
  const [disconnected, setDisconnected] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  useEffect(() => {
    if (disconnected) return;
    setUpdatedAt(Date.now());
    const timer = setInterval(() => setUpdatedAt(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [disconnected, data]);
  function finish(two: boolean) {
    setData(previous => {
      const next = { ...previous, matches: [...previous.matches] };
      const indexes = two ? [previous.courts.length - 2, previous.courts.length - 1] : [previous.courts.length - 1];
      indexes.forEach((index, i) => {
        const old = next.matches[index];
        if (!old) return;
        const occupied = new Set(previous.matches.flatMap(m => [...m.teamA, ...m.teamB].map(p => p.playerId)));
        const incoming = previous.roster.filter(p => !occupied.has(p.playerId)).slice(i * 2, i * 2 + 2);
        next.matches[index] = { ...old, matchId: `${old.matchId}-next`, teamA: incoming, teamB: old.teamA };
      });
      return next;
    });
  }
  return <div className={styles.demoShell}>
    <div style={{ background: "#12231f", color: "white", padding: "8px 16px", display: "flex", flexWrap: "wrap", gap: 12 }}>
      <b>TV rehearsal · fictional players</b>
      {[2, 4, 6].map(n => <button key={n} onClick={() => { setData(sample(n)); setGeneration(g => g + 1); }}>{n} courts</button>)}
      <button onClick={() => finish(false)}>A court finishes</button>
      <button onClick={() => finish(true)}>Two courts finish</button>
      <button onClick={() => setDisconnected(v => !v)}>{disconnected ? "Reconnect" : "Disconnect"}</button>
      <button onClick={() => setData(d => ({ ...d, sessionStatus: d.sessionStatus === "paused" ? "active" : "paused" }))}>{data.sessionStatus === "paused" ? "Resume" : "Pause"}</button>
      <button onClick={() => setData(d => ({ ...d, sessionStatus: "completed" }))}>End session</button>
    </div>
    <TvBoard key={generation} data={data} updatedAt={updatedAt} disconnected={disconnected} demo />
  </div>;
}
