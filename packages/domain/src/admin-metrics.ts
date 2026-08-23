export interface AdminMetricsSnapshot {
  capturedAtIso: string;
  users: { total: number; registeredPlayers: number; active30d: number };
  squads: { total: number; active30d: number; repeatSessionSquads: number; archived: number };
  geography: {
    topRegions: Array<{ label: string; squadCount: number; active30d: number }>;
    unknownSquads: number;
    source: "venue-address" | "session-venue" | "mixed" | "unknown";
  };
  sessions: { total: number; created7d: number; started: number; completed: number; abandoned: number };
  matches: { total: number; scored: number; unscored: number };
  support: { scoreCorrections: number; ownershipTransfers: number; statRecomputes: number };
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export function unscoredMatchRate(snapshot: AdminMetricsSnapshot): number {
  return rate(snapshot.matches.unscored, snapshot.matches.total);
}

export function sessionCompletionRate(snapshot: AdminMetricsSnapshot): number {
  return rate(snapshot.sessions.completed, snapshot.sessions.total);
}

export function sessionAbandonmentRate(snapshot: AdminMetricsSnapshot): number {
  return rate(snapshot.sessions.abandoned, snapshot.sessions.total);
}

export function repeatSquadRate(snapshot: AdminMetricsSnapshot): number {
  return rate(snapshot.squads.repeatSessionSquads, snapshot.squads.total);
}
