"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { canGenerateSchedule, buildRebalanceSummary } from "@picklebaddies/domain";
import { buildRound, seededOrder, DEFAULT_SEED } from "@picklebaddies/match-engine";
import { getAdminDb } from "@/server/firebase/admin";
import { requireSession } from "@/server/auth/dal";
import { ok, err, type ActionResult } from "@/server/result";
import { requireActiveSessionSquad } from "./actions";
import { toEnginePlayers, toEngineCourts, buildMatchDocs, serializeEngineState, buildEngineStateFromAssignments } from "./scheduling";

type RebalanceTrigger = "manual_rebalance" | "player_added" | "player_removed" | "settings_changed";

export interface RebalanceResult {
  summary: string;
}

/**
 * Continuous scheduling has at most ONE not-yet-started match per court at any
 * time. A visible scheduled match is treated as the court's current assignment,
 * so background rebalancing preserves it and only fills idle courts from the
 * now-available player pool. Completed matches and their stats are never
 * touched.
 */
export async function rebalanceSession(
  sessionId: string,
  trigger: RebalanceTrigger = "manual_rebalance",
): Promise<ActionResult<RebalanceResult>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  if (!sessionId) return err("INVALID_ARGUMENT", "sessionId is required");

  const db = getAdminDb();
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const activeSquad = await requireActiveSessionSquad(db, sessionId, user.uid);
  if (!activeSquad.ok) return activeSquad;

  try {
    const result = await db.runTransaction(async (t) => {
      // ── ALL READS FIRST ──
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const session = sessionSnap.data()!;

      const memberSnap = await t.get(db.doc(`groups/${session.groupId}/members/${user.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as any).role : null;
      if (!canGenerateSchedule(role)) {
        throw Object.assign(new Error("Only group owners and admins can shuffle games"), { code: "FORBIDDEN" });
      }
      if (session.status !== "active" && session.status !== "paused") {
        throw Object.assign(new Error("Session must be active or paused to rebalance"), { code: "FAILED_PRECONDITION" });
      }

      const [playersSnap, matchesSnap, sitOutsSnap] = await Promise.all([
        t.get(db.collection(`sessions/${sessionId}/players`)),
        t.get(db.collection(`sessions/${sessionId}/matches`)),
        t.get(db.collection(`sessions/${sessionId}/sitOuts`)),
      ]);
      const players = playersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      const matches = matchesSnap.docs.map((d) => ({ id: d.id, ref: d.ref, ...(d.data() as any) }));
      const sitOuts = sitOutsSnap.docs.map((d) => d.data() as any);

      // ── COMPUTE ──
      const completedMatches = matches.filter((m) => m.status === "completed");
      const scheduledMatches = matches.filter((m) => m.status === "scheduled");

      const enginePlayers = toEnginePlayers(players);
      const engineCourts = toEngineCourts(session.courts || []);
      // Preserve visible court assignments and only schedule onto idle courts.
      const occupiedCourtIds = new Set(scheduledMatches.map((m) => m.courtId as string));
      const busyPlayerIds = new Set(
        scheduledMatches.flatMap((m) => [...(m.teamAIds ?? []), ...(m.teamBIds ?? [])] as string[]),
      );
      const idlePlayers = enginePlayers.filter((p) => !busyPlayerIds.has(p.playerId));
      const idleCourts = engineCourts.filter((c) => !occupiedCourtIds.has(c.courtId));
      const state = buildEngineStateFromAssignments(enginePlayers, matches as any[], sitOuts);
      const order = seededOrder(idlePlayers.map((p) => p.playerId), DEFAULT_SEED);
      const cycle = session.nextCycleNumber || 2;

      const next = idlePlayers.length >= 4 && idleCourts.length > 0
        ? buildRound(state, idlePlayers, idleCourts, cycle, order)
        : { matches: [], sitOuts: [] };
      const { matches: newMatches, sitOuts: newSitOuts } = next;

      const removedPlayers = players.filter((p) => p.status === "left" || p.status === "removed" || p.status === "no_show");

      // ── WRITES ──
      const nameById = new Map(players.map((p: any) => [p.id, p.displayName ?? "Player"]));
      const courtNameById = new Map(engineCourts.map((c) => [c.courtId, c.name]));
      for (const doc of buildMatchDocs(sessionId, nameById, newMatches, courtNameById)) {
        t.set(db.collection(`sessions/${sessionId}/matches`).doc(), doc);
      }
      for (const sitOut of newSitOuts) {
        t.set(db.collection(`sessions/${sessionId}/sitOuts`).doc(), sitOut);
      }
      t.set(db.doc(`sessions/${sessionId}/engine/state`), serializeEngineState(state));
      if (newMatches.length > 0) {
        t.update(sessionRef, { nextCycleNumber: cycle + 1 });
      }

      t.set(db.collection(`sessions/${sessionId}/generationRuns`).doc(), {
        mode: "rebalance",
        trigger,
        matchCount: newMatches.length,
        sitOutCount: newSitOuts.length,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: user.uid,
      });
      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: "generation/rebalanced",
        details: { trigger, matchCount: newMatches.length },
        createdAt: FieldValue.serverTimestamp(),
      });

      const summary = buildRebalanceSummary({
        completedPreserved: completedMatches.length,
        cancelled: 0,
        regenerated: newMatches.length,
        removed: removedPlayers.map((p) => p.displayName),
      });

      return { summary };
    });

    return ok(result);
  } catch (e: any) {
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FORBIDDEN") return err("FORBIDDEN", e.message);
    if (e.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", e.message);
    throw e;
  }
}
