"use server";
import "server-only";
import { normalizeJoinCode, leaderboardCompare, type ScoringMode, type LeaderboardRow } from "@picklebaddies/domain";
import { getAdminDb } from "@/server/firebase/admin";
import { ok, err, type ActionResult } from "@/server/result";

// Public, unauthenticated, READ-ONLY "player board" — the see-your-matches
// surface players open from a shared link / QR. Mirrors the score-link lookup
// (by scoreCode) but never writes. Gated on boardEnabled (absent = enabled, so
// legacy sessions keep working without a migration).

export interface BoardPlayer {
  playerId: string;
  displayName: string;
}

export interface BoardMatch {
  matchId: string;
  courtId: string;
  courtName: string;
  status: string; // scheduled | in_progress | completed
  teamA: BoardPlayer[];
  teamB: BoardPlayer[];
  winnerTeam: "A" | "B" | null;
  teamAScore: number | null;
  teamBScore: number | null;
}

export interface BoardCourt {
  courtId: string;
  courtName: string;
}

export interface BoardLeaderRow {
  playerId: string;
  displayName: string;
  wins: number;
  losses: number;
  gamesPlayed: number;
  pointDifference: number;
}

export interface BoardData {
  sessionId: string;
  sessionName: string;
  sport: string;
  scoringMode: ScoringMode;
  sessionStatus: string;
  courts: BoardCourt[];
  roster: BoardPlayer[];       // active players, for the name picker
  matches: BoardMatch[];       // scheduled + in_progress + completed (session-scale, bounded)
  leaderboard: BoardLeaderRow[];
}

const ACTIVE_STATUSES = new Set(["invited", "registered", "checked_in", "active", "waiting"]);

export async function getBoardData(boardCode: string): Promise<ActionResult<BoardData>> {
  const db = getAdminDb();
  const code = normalizeJoinCode(boardCode);

  const q = await db.collection("sessions").where("scoreCode", "==", code).limit(1).get();
  if (q.empty) return err("NOT_FOUND", "Invalid board link.");

  const sessionDoc = q.docs[0]!;
  const session = sessionDoc.data();
  if (session.boardEnabled === false) return err("NOT_FOUND", "This board has been turned off.");

  const sessionId = sessionDoc.id;
  const scoringMode = session.scoringMode as ScoringMode;

  const courts: BoardCourt[] = (session.courts as Array<{ courtId: string; name: string; isActive?: boolean }>)
    .filter((c) => c.isActive !== false)
    .map((c) => ({ courtId: c.courtId, courtName: c.name }));
  const courtNameById = new Map(
    (session.courts as Array<{ courtId: string; name: string }>).map((c) => [c.courtId, c.name]),
  );

  const [playerSnap, matchSnap] = await Promise.all([
    db.collection(`sessions/${sessionId}/players`).get(),
    db.collection(`sessions/${sessionId}/matches`).get(),
  ]);

  const roster: BoardPlayer[] = [];
  const leaderRows: BoardLeaderRow[] = [];
  for (const doc of playerSnap.docs) {
    const p = doc.data();
    const status = (p.status as string) ?? "active";
    if (ACTIVE_STATUSES.has(status)) {
      roster.push({ playerId: doc.id, displayName: p.displayName ?? "Player" });
    }
    const gamesPlayed = p.gamesPlayed ?? 0;
    if (gamesPlayed > 0 || ACTIVE_STATUSES.has(status)) {
      const pointsFor = p.pointsFor ?? 0;
      const pointsAgainst = p.pointsAgainst ?? 0;
      leaderRows.push({
        playerId: doc.id,
        displayName: p.displayName ?? "Player",
        wins: p.wins ?? 0,
        losses: p.losses ?? 0,
        gamesPlayed,
        pointDifference: p.pointDifference ?? pointsFor - pointsAgainst,
      });
    }
  }
  roster.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const leaderboard = leaderRows
    .map((r) => ({ r, key: { ...r, sitOutCount: 0 } as LeaderboardRow }))
    .sort((a, b) => leaderboardCompare(a.key, b.key, scoringMode))
    .map((x) => x.r);

  const matches: BoardMatch[] = matchSnap.docs.map((doc) => {
    const m = doc.data();
    const sp = m.scorePayload ?? null;
    return {
      matchId: doc.id,
      courtId: m.courtId,
      courtName: m.courtName ?? courtNameById.get(m.courtId) ?? m.courtId,
      status: m.status as string,
      teamA: (m.teamA as BoardPlayer[]).map((p) => ({ playerId: p.playerId, displayName: p.displayName })),
      teamB: (m.teamB as BoardPlayer[]).map((p) => ({ playerId: p.playerId, displayName: p.displayName })),
      winnerTeam: (m.winnerTeam as "A" | "B" | null) ?? null,
      teamAScore: typeof sp?.teamAScore === "number" ? sp.teamAScore : null,
      teamBScore: typeof sp?.teamBScore === "number" ? sp.teamBScore : null,
    };
  });

  return ok({
    sessionId,
    sessionName: session.name,
    sport: session.sport,
    scoringMode,
    sessionStatus: session.status,
    courts,
    roster,
    matches,
    leaderboard,
  });
}
