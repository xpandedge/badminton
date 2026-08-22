"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { canGenerateSchedule } from "@picklebaddies/domain";
import { buildRound, createInitialState, seededOrder, DEFAULT_SEED } from "@picklebaddies/match-engine";
import { getAdminDb } from "@/server/firebase/admin";
import { requireSession } from "@/server/auth/dal";
import { ok, err, type ActionResult } from "@/server/result";
import { requireActiveSessionSquad } from "./actions";
import { toEnginePlayers, toEngineCourts, buildMatchDocs, serializeEngineState } from "./scheduling";

/**
 * One-shot session seed: fills every active court in a single joint call
 * (never a per-court loop — that would double-count sit-outs for players who
 * never actually sat out). Steady-state fills after this happen in score.ts
 * as each individual court frees up.
 */
export async function generateSchedule(
  sessionId: string,
): Promise<ActionResult<{ matchCount: number; sitOutCount: number }>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  if (!sessionId) return err("INVALID_ARGUMENT", "sessionId is required");

  const db = getAdminDb();
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const activeSquad = await requireActiveSessionSquad(db, sessionId, session.uid);
  if (!activeSquad.ok) return activeSquad;

  try {
    const result = await db.runTransaction(async (t) => {
      // ── ALL READS FIRST ──
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const s = sessionSnap.data()!;

      const memberSnap = await t.get(db.doc(`groups/${s.groupId}/members/${session.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as any).role : null;
      if (!canGenerateSchedule(role)) {
        throw Object.assign(new Error("Only group owners and admins can generate games"), { code: "FORBIDDEN" });
      }
      if (s.status !== "draft" && s.status !== "scheduled") {
        throw Object.assign(
          new Error("Session must be draft or scheduled to generate an initial schedule"),
          { code: "FAILED_PRECONDITION" },
        );
      }
      if (s.scheduleGeneratedAt) {
        throw Object.assign(
          new Error("A schedule has already been generated."),
          { code: "ALREADY_EXISTS" },
        );
      }

      const playersSnap = await t.get(db.collection(`sessions/${sessionId}/players`));
      const players = playersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const enginePlayers = toEnginePlayers(players);
      const engineCourts = toEngineCourts(s.courts || []);
      if (enginePlayers.length < 4) {
        throw Object.assign(new Error("Need at least 4 active players to generate a schedule"), { code: "FAILED_PRECONDITION" });
      }
      if (engineCourts.length === 0) {
        throw Object.assign(new Error("Session has no active courts"), { code: "FAILED_PRECONDITION" });
      }

      // ── THEN ALL WRITES ──
      const state = createInitialState(enginePlayers);
      const order = seededOrder(enginePlayers.map((p) => p.playerId), DEFAULT_SEED);
      const { matches, sitOuts } = buildRound(state, enginePlayers, engineCourts, 1, order);

      const nameById = new Map(players.map((p: any) => [p.id, p.displayName ?? "Player"]));
      const courtNameById = new Map(engineCourts.map((c) => [c.courtId, c.name]));

      for (const doc of buildMatchDocs(sessionId, nameById, matches, courtNameById)) {
        t.set(db.collection(`sessions/${sessionId}/matches`).doc(), doc);
      }
      for (const sitOut of sitOuts) {
        t.set(db.collection(`sessions/${sessionId}/sitOuts`).doc(), sitOut);
      }
      for (const player of players as any[]) {
        t.set(db.doc(`sessions/${sessionId}/leaderboard/${player.id}`), {
          displayName: player.displayName ?? null,
          gamesPlayed: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifference: 0, sitOutCount: 0,
        });
      }

      t.set(db.doc(`sessions/${sessionId}/engine/state`), serializeEngineState(state));
      t.update(sessionRef, { scheduleGeneratedAt: FieldValue.serverTimestamp(), nextCycleNumber: 2 });

      t.set(db.collection(`sessions/${sessionId}/generationRuns`).doc(), {
        mode: "initial",
        matchCount: matches.length,
        sitOutCount: sitOuts.length,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: session.uid,
      });
      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: session.uid,
        action: "generation/created",
        createdAt: FieldValue.serverTimestamp(),
      });

      return { matchCount: matches.length, sitOutCount: sitOuts.length };
    });

    return ok(result);
  } catch (e: any) {
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FORBIDDEN") return err("FORBIDDEN", e.message);
    if (e.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", e.message);
    if (e.code === "ALREADY_EXISTS") return err("ALREADY_EXISTS", e.message);
    throw e;
  }
}
