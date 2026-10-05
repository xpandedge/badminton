import type { BoardMatch } from "./board";

export const PAGE_MS = 10_000;
export const ANNOUNCEMENT_MS = 20_000;
export interface TvState {
  seen: Record<string, string> | null;
  pending: Array<{ courtId: string; signature: string; shownAt: number | null }>;
  cycleSince: number;
}
export const initialTvState = (): TvState => ({ seen: null, pending: [], cycleSince: 0 });

export function currentTvMatches(matches: BoardMatch[], courtIds: string[], roundRobin = false): BoardMatch[] {
  const eligible = matches.filter(m => courtIds.includes(m.courtId) && ["scheduled", "in_progress"].includes(m.status));
  const rounds = eligible.map(m => m.roundNumber ?? 0);
  const currentRound = rounds.length ? Math.min(...rounds) : 0;
  return courtIds.flatMap(courtId => {
    const sorted = eligible.filter(m => m.courtId === courtId).sort((a, b) =>
      (a.roundNumber ?? 0) - (b.roundNumber ?? 0) || (a.matchNumber ?? 0) - (b.matchNumber ?? 0) || a.matchId.localeCompare(b.matchId));
    const match = sorted.find(m => m.status === "in_progress") ?? sorted.find(m => !roundRobin || (m.roundNumber ?? 0) === currentRound);
    return match ? [match] : [];
  });
}

const signature = (m: BoardMatch) => JSON.stringify([m.matchId, m.teamA.map(p => p.playerId), m.teamB.map(p => p.playerId)]);

/** Only current, committed assignments enter this presentation queue. No scheduler writes. */
export function advanceTv(state: TvState, matches: BoardMatch[], now: number, baseline = false): TvState {
  const seen = Object.fromEntries(matches.map(m => [m.courtId, signature(m)]));
  if (state.seen === null || baseline) return { seen, pending: [], cycleSince: now };
  let pending = state.pending.filter(p => seen[p.courtId] === p.signature && (p.shownAt === null || now - p.shownAt < ANNOUNCEMENT_MS));
  let cycleSince = state.cycleSince;
  if (state.pending.length && !pending.length) cycleSince = now;
  const additions = matches.filter(m => state.seen![m.courtId] !== seen[m.courtId]).map(m => ({ courtId: m.courtId, signature: signature(m), shownAt: null }));
  pending = [...pending, ...additions];
  pending = pending.map((p, i) => i < 4 && p.shownAt === null ? { ...p, shownAt: now } : p);
  return { seen, pending, cycleSince };
}

export function tvPage(state: TvState, courtIds: string[], now: number): string[] {
  if (state.seen === null) return courtIds.slice(0, 4);
  const priority = state.pending.slice(0, 4).map(p => p.courtId).filter(id => courtIds.includes(id));
  if (priority.length) return [...priority, ...courtIds.filter(id => !priority.includes(id))].slice(0, 4);
  const pages = Math.max(1, Math.ceil(courtIds.length / 4));
  const index = Math.floor(Math.max(0, now - state.cycleSince) / PAGE_MS) % pages;
  return courtIds.slice(index * 4, index * 4 + 4);
}
