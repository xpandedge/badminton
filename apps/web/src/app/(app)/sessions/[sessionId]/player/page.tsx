"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import { watchSession } from "@/lib/sessions/sessions";
import { watchMatches } from "@/lib/sessions/live";
import { findPlayerMatch, PlayerMatchInfo } from "@/lib/sessions/player-view";
import type { Session } from "@/lib/sessions/types";
import { LoadingState } from "@/components/LoadingState";
import { SessionStatusBadge } from "@/components/StatusBadge";

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
    ).sort((a, b) => b.roundNumber - a.roundNumber); // descending

    setCompletedMatches(completed);
  }, [allMatches, user?.uid]);

  if (!session) return <LoadingState message="Loading session…" />;
  if (!user) return <LoadingState message="Checking authentication…" />;

  return (
    <div className="p-4 space-y-8 max-w-2xl mx-auto">
      <header className="text-center">
        <h1 className="text-3xl font-bold">{session.name}</h1>
        <p className="text-gray-500">Live Player View</p>
      </header>

      {session.status !== "active" && session.status !== "paused" && (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded text-center flex items-center justify-center gap-2">
          <SessionStatusBadge status={session.status} />
          <span className="text-sm text-yellow-800">Matches will appear when the session is active.</span>
        </div>
      )}

      {session.status === "active" && matchInfo && (
        <div className="space-y-6">
          <section className="bg-blue-50 border border-blue-200 p-6 rounded-lg text-center">
            <h2 className="text-2xl font-bold mb-4">Current Match</h2>
            {matchInfo.waiting ? (
              <p className="text-xl">You're waiting for a court to free up.</p>
            ) : (
              <div>
                <p className="text-lg font-bold">{matchInfo.currentMatch?.courtName ?? `Court ${matchInfo.currentMatch?.courtId}`}</p>
                <div className="flex justify-around mt-4 text-xl">
                  <div>
                    <span className="block font-bold text-gray-500 text-sm">Team A</span>
                    {matchInfo.currentMatch?.teamA.map((p: any) => <div key={p.playerId}>{p.displayName}</div>)}
                  </div>
                  <div className="font-bold pt-4">VS</div>
                  <div>
                    <span className="block font-bold text-gray-500 text-sm">Team B</span>
                    {matchInfo.currentMatch?.teamB.map((p: any) => <div key={p.playerId}>{p.displayName}</div>)}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {completedMatches.length > 0 && (
        <section>
          <h3 className="text-xl font-bold mb-4">Your Results</h3>
          <div className="space-y-2">
            {completedMatches.map(m => {
              const isTeamA = m.teamA.some((p:any) => p.playerId === user.uid);
              const didWin = m.winnerTeam === (isTeamA ? "A" : "B");
              return (
                <div key={m.id} className="p-3 border rounded flex justify-between items-center">
                  <div>{m.courtName ?? `Court ${m.courtId}`}</div>
                  {session.scoringMode === "points" && m.scorePayload && (
                    <div className="font-mono">{m.scorePayload.teamAScore} - {m.scorePayload.teamBScore}</div>
                  )}
                  <div className={`font-bold ${didWin ? "text-green-600" : "text-red-600"}`}>
                    {didWin ? "Win" : "Loss"}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
