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
  /** Squad grade (A+ … D) for members; null for guests, who have no squad record. */
  grade: string | null;
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

  const [playerSnap, matchSnap, leaderboardSnap, squadPlayerSnap] = await Promise.all([
    db.collection(`sessions/${sessionId}/players`).get(),
    db.collection(`sessions/${sessionId}/matches`).get(),
    db.collection(`sessions/${sessionId}/leaderboard`).get(),
    // Grades live on the squad player, not the session player (squad-rating.ts).
    session.groupId
      ? db.collection(`groups/${session.groupId}/players`).get()
      : Promise.resolve(null),
  ]);

  const gradeByPlayerId = new Map<string, string>();
  for (const doc of squadPlayerSnap?.docs ?? []) {
    const grade = doc.data().squadGrade;
    if (typeof grade === "string" && grade) gradeByPlayerId.set(doc.id, grade);
  }

  const playerNameById = new Map<string, string>();
  const sessionStatsByPlayerId = new Map<string, Record<string, unknown>>();
  const leaderboardStatsByPlayerId = new Map<string, Record<string, unknown>>();
  const rememberName = (playerId: string, value: unknown) => {
    const displayName = cleanDisplayName(value);
    if (!displayName) return;

    const current = playerNameById.get(playerId);
    if (!current || current === "Player") playerNameById.set(playerId, displayName);
  };

  const activePlayerIds: string[] = [];
  for (const doc of playerSnap.docs) {
    const p = doc.data();
    sessionStatsByPlayerId.set(doc.id, p);
    rememberName(doc.id, p.displayName);
    const status = (p.status as string) ?? "active";
    if (ACTIVE_STATUSES.has(status)) {
      activePlayerIds.push(doc.id);
    }
  }

  for (const doc of leaderboardSnap.docs) {
    const row = doc.data();
    leaderboardStatsByPlayerId.set(doc.id, row);
    rememberName(doc.id, row.displayName);
  }

  for (const doc of matchSnap.docs) {
    const m = doc.data();
    for (const p of asBoardPlayers(m.teamA)) rememberName(p.playerId, p.displayName);
    for (const p of asBoardPlayers(m.teamB)) rememberName(p.playerId, p.displayName);
  }
  const roster: BoardPlayer[] = activePlayerIds
    .map((playerId) => ({
      playerId,
      displayName: displayNameFor(playerId, sessionStatsByPlayerId.get(playerId)?.displayName, playerNameById),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const leaderRows: Array<BoardLeaderRow & { sitOutCount: number }> = [];
  const leaderIds = new Set([
    ...leaderboardStatsByPlayerId.keys(),
    ...sessionStatsByPlayerId.keys(),
  ]);
  for (const playerId of leaderIds) {
    const leaderboardStats = leaderboardStatsByPlayerId.get(playerId);
    const sessionStats = sessionStatsByPlayerId.get(playerId);
    const stats = numberField(leaderboardStats, "gamesPlayed") > 0 ? leaderboardStats : sessionStats;
    if (!stats) continue;

    const gamesPlayed = numberField(stats, "gamesPlayed");
    if (gamesPlayed <= 0) continue;

    const pointsFor = numberField(stats, "pointsFor");
    const pointsAgainst = numberField(stats, "pointsAgainst");
    leaderRows.push({
      playerId,
      displayName: displayNameFor(playerId, stats.displayName, playerNameById),
      grade: gradeByPlayerId.get(playerId) ?? null,
      wins: numberField(stats, "wins"),
      losses: numberField(stats, "losses"),
      gamesPlayed,
      pointDifference: typeof stats.pointDifference === "number" ? stats.pointDifference : pointsFor - pointsAgainst,
      sitOutCount: numberField(stats, "sitOutCount"),
    });
  }

  const leaderboard = leaderRows
    .sort((a, b) => leaderboardCompare(a as LeaderboardRow, b as LeaderboardRow, scoringMode))
    .map(({ sitOutCount: _sitOutCount, ...row }) => row);

  const matches: BoardMatch[] = matchSnap.docs.map((doc) => {
    const m = doc.data();
    const sp = m.scorePayload ?? null;
    return {
      matchId: doc.id,
      courtId: m.courtId,
      courtName: m.courtName ?? courtNameById.get(m.courtId) ?? m.courtId,
      status: m.status as string,
      teamA: asBoardPlayers(m.teamA).map((p) => ({ playerId: p.playerId, displayName: displayNameFor(p.playerId, p.displayName, playerNameById) })),
      teamB: asBoardPlayers(m.teamB).map((p) => ({ playerId: p.playerId, displayName: displayNameFor(p.playerId, p.displayName, playerNameById) })),
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

function cleanDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const displayName = value.trim();
  return displayName.length > 0 ? displayName : null;
}

function displayNameFor(playerId: string, preferred: unknown, playerNameById: Map<string, string>): string {
  return cleanDisplayName(preferred) ?? playerNameById.get(playerId) ?? "Player";
}

function numberField(data: Record<string, unknown> | undefined, key: string): number {
  const value = data?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asBoardPlayers(value: unknown): BoardPlayer[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((player) => {
    const playerId = typeof player?.playerId === "string" ? player.playerId : "";
    if (!playerId) return [];

    return [{
      playerId,
      displayName: cleanDisplayName(player?.displayName) ?? "Player",
    }];
  });
}
