import {
  getBoardData as serverGetBoardData,
  type BoardData,
  type BoardMatch,
  type BoardPlayer,
  type BoardCourt,
  type BoardLeaderRow,
} from "@/server/sessions/board";

export type { BoardData, BoardMatch, BoardPlayer, BoardCourt, BoardLeaderRow };

export async function getBoardData(boardCode: string): Promise<BoardData> {
  const result = await serverGetBoardData(boardCode);
  if (!result.ok) throw new Error(result.message);
  return result.data;
}

export interface ViewerState {
  playingNow: BoardMatch | null;   // an in_progress match containing the viewer
  upNext: BoardMatch | null;       // a scheduled match containing the viewer
  results: BoardMatch[];           // completed matches containing the viewer (newest first)
}

function inMatch(m: BoardMatch, playerId: string): boolean {
  return m.teamA.some((p) => p.playerId === playerId) || m.teamB.some((p) => p.playerId === playerId);
}

/** Derive the viewer's personal state from the full match list. */
export function deriveViewerState(matches: BoardMatch[], playerId: string): ViewerState {
  const mine = matches.filter((m) => inMatch(m, playerId));
  const playingNow = mine.find((m) => m.status === "in_progress") ?? null;
  const upNext = mine.find((m) => m.status === "scheduled") ?? null;
  const results = mine.filter((m) => m.status === "completed").reverse();
  return { playingNow, upNext, results };
}

/** Court display: the match currently occupying each active court (in_progress preferred, else scheduled). */
export function courtCurrentMatch(matches: BoardMatch[], courtId: string): BoardMatch | null {
  const onCourt = matches.filter((m) => m.courtId === courtId);
  return (
    onCourt.find((m) => m.status === "in_progress") ??
    onCourt.find((m) => m.status === "scheduled") ??
    null
  );
}

/** Players not currently on a court (no scheduled/in_progress match) = the bench. */
export function benchPlayers(matches: BoardMatch[], roster: BoardPlayer[]): BoardPlayer[] {
  const busy = new Set<string>();
  for (const m of matches) {
    if (m.status === "scheduled" || m.status === "in_progress") {
      for (const p of [...m.teamA, ...m.teamB]) busy.add(p.playerId);
    }
  }
  return roster.filter((p) => !busy.has(p.playerId));
}
