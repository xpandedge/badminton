"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import {
  canGenerateSchedule,
  generateFixedPairRoundRobin,
  type FixedPairRoundRobinTeam,
} from "@picklebaddies/domain";
import { getAdminDb } from "@/server/firebase/admin";
import { requireSession } from "@/server/auth/dal";
import { ok, err, type ActionResult } from "@/server/result";
import { requireActiveSessionSquad } from "./actions";
import { toEngineCourts } from "./scheduling";

export interface RoundRobinTeamInput {
  playerAId: string;
  playerBId: string;
  displayName?: string;
}

interface ActiveSessionPlayer {
  id: string;
  playerId: string;
  displayName: string;
  status?: string;
}

function normalizeName(value: unknown): string {
  return String(value ?? "").trim();
}

function teamDisplayName(playerA: ActiveSessionPlayer, playerB: ActiveSessionPlayer, override?: string): string {
  const custom = normalizeName(override);
  return custom || `${playerA.displayName} / ${playerB.displayName}`;
}

export async function generateRoundRobinSchedule(input: {
  sessionId: string;
  teams: RoundRobinTeamInput[];
}): Promise<ActionResult<{ matchCount: number; teamCount: number; roundCount: number }>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const sessionId = normalizeName(input.sessionId);
  if (!sessionId) return err("INVALID_ARGUMENT", "sessionId is required");

  const db = getAdminDb();
  const activeSquad = await requireActiveSessionSquad(db, sessionId, user.uid);
  if (!activeSquad.ok) return activeSquad;

  try {
    const result = await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);

      const [sessionSnap, playersSnap, existingMatchesSnap] = await Promise.all([
        t.get(sessionRef),
        t.get(db.collection(`sessions/${sessionId}/players`)),
        t.get(db.collection(`sessions/${sessionId}/matches`).limit(1)),
      ]);

      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const session = sessionSnap.data()!;

      const memberSnap = await t.get(db.doc(`groups/${session.groupId}/members/${user.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as { role?: string }).role ?? null : null;
      if (!canGenerateSchedule(role as any)) {
        throw Object.assign(new Error("Only squad owners and admins can generate games"), { code: "FORBIDDEN" });
      }
      if (session.status !== "draft" && session.status !== "scheduled") {
        throw Object.assign(
          new Error("Session must be draft or scheduled to generate an initial schedule"),
          { code: "FAILED_PRECONDITION" },
        );
      }
      if (session.scheduleGeneratedAt || !existingMatchesSnap.empty) {
        throw Object.assign(new Error("A schedule has already been generated."), { code: "ALREADY_EXISTS" });
      }
      if ((session.sessionFormat ?? "social_rotation") !== "fixed_pair_round_robin") {
        throw Object.assign(new Error("This session is not a round robin session"), { code: "FAILED_PRECONDITION" });
      }

      const courts = toEngineCourts(session.courts || []);
      if (courts.length === 0) {
        throw Object.assign(new Error("Session has no active courts"), { code: "FAILED_PRECONDITION" });
      }

      const activePlayers: ActiveSessionPlayer[] = playersSnap.docs
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            playerId: String(data.playerId ?? doc.id),
            displayName: normalizeName(data.displayName) || "Player",
            status: String(data.status ?? ""),
          };
        })
        .filter((player) => player.status === "active" || player.status === "checked_in");
      const playerById = new Map(activePlayers.flatMap((player) => [[player.id, player], [player.playerId, player]]));

      if (input.teams.length < 2) {
        throw Object.assign(new Error("Add at least 2 teams before generating round robin games"), { code: "FAILED_PRECONDITION" });
      }

      const usedPlayerIds = new Set<string>();
      const roundRobinTeams: FixedPairRoundRobinTeam[] = input.teams.map((team, index) => {
        const playerA = playerById.get(normalizeName(team.playerAId));
        const playerB = playerById.get(normalizeName(team.playerBId));
        if (!playerA || !playerB) {
          throw Object.assign(new Error(`Team ${index + 1} has a player who is not active in this session`), { code: "INVALID_ARGUMENT" });
        }
        if (playerA.playerId === playerB.playerId) {
          throw Object.assign(new Error(`Team ${index + 1} needs two different players`), { code: "INVALID_ARGUMENT" });
        }
        for (const playerId of [playerA.playerId, playerB.playerId]) {
          if (usedPlayerIds.has(playerId)) {
            throw Object.assign(new Error("Each player can only be used in one round robin team"), { code: "INVALID_ARGUMENT" });
          }
          usedPlayerIds.add(playerId);
        }
        return {
          teamId: `team_${index + 1}`,
          displayName: teamDisplayName(playerA, playerB, team.displayName),
          playerIds: [playerA.playerId, playerB.playerId],
        };
      });

      const schedule = generateFixedPairRoundRobin({ teams: roundRobinTeams, courtCount: courts.length });
      const teamById = new Map(roundRobinTeams.map((team) => [team.teamId, team]));
      const courtByIndex = (index: number) => courts[index % courts.length]!;

      for (const team of roundRobinTeams) {
        const players = team.playerIds.map((playerId) => playerById.get(playerId)!);
        t.set(db.doc(`sessions/${sessionId}/roundRobinTeams/${team.teamId}`), {
          teamId: team.teamId,
          displayName: team.displayName,
          playerIds: team.playerIds,
          players: players.map((player) => ({ playerId: player.playerId, displayName: player.displayName })),
          createdAt: FieldValue.serverTimestamp(),
          createdBy: user.uid,
        });
        t.set(db.doc(`sessions/${sessionId}/teamLeaderboard/${team.teamId}`), {
          teamId: team.teamId,
          displayName: team.displayName,
          playerIds: team.playerIds,
          playerNames: players.map((player) => player.displayName),
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointDifference: 0,
        });
      }

      for (const match of schedule.matches) {
        const teamA = teamById.get(match.teamAId)!;
        const teamB = teamById.get(match.teamBId)!;
        const court = courtByIndex(match.courtIndex);
        const teamAPlayers = teamA.playerIds.map((playerId) => playerById.get(playerId)!);
        const teamBPlayers = teamB.playerIds.map((playerId) => playerById.get(playerId)!);
        t.set(db.collection(`sessions/${sessionId}/matches`).doc(), {
          sessionId,
          sessionFormat: "fixed_pair_round_robin",
          roundRobinTeamAId: teamA.teamId,
          roundRobinTeamBId: teamB.teamId,
          roundRobinTeamAName: teamA.displayName,
          roundRobinTeamBName: teamB.displayName,
          roundNumber: match.roundNumber,
          courtId: court.courtId,
          courtName: court.name,
          matchNumber: match.matchNumber,
          teamA: teamAPlayers.map((player) => ({ playerId: player.playerId, displayName: player.displayName })),
          teamB: teamBPlayers.map((player) => ({ playerId: player.playerId, displayName: player.displayName })),
          teamAIds: teamA.playerIds,
          teamBIds: teamB.playerIds,
          status: "scheduled",
          isLocked: false,
        });
      }

      for (const bye of schedule.byes) {
        const team = teamById.get(bye.teamId)!;
        t.set(db.collection(`sessions/${sessionId}/roundRobinByes`).doc(), {
          teamId: team.teamId,
          displayName: team.displayName,
          roundNumber: bye.roundNumber,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      t.update(sessionRef, {
        scheduleGeneratedAt: FieldValue.serverTimestamp(),
        roundRobinTeamCount: roundRobinTeams.length,
        roundRobinMatchCount: schedule.matches.length,
        nextCycleNumber: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      t.set(db.collection(`sessions/${sessionId}/generationRuns`).doc(), {
        mode: "fixed_pair_round_robin",
        matchCount: schedule.matches.length,
        teamCount: roundRobinTeams.length,
        roundCount: schedule.totalRounds,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: user.uid,
      });
      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: "generation/round_robin_created",
        details: {
          matchCount: schedule.matches.length,
          teamCount: roundRobinTeams.length,
          roundCount: schedule.totalRounds,
        },
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        matchCount: schedule.matches.length,
        teamCount: roundRobinTeams.length,
        roundCount: schedule.totalRounds,
      };
    });

    return ok(result);
  } catch (e: any) {
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FORBIDDEN") return err("FORBIDDEN", e.message);
    if (e.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", e.message);
    if (e.code === "ALREADY_EXISTS") return err("ALREADY_EXISTS", e.message);
    if (e.code === "INVALID_ARGUMENT") return err("INVALID_ARGUMENT", e.message);
    throw e;
  }
}
