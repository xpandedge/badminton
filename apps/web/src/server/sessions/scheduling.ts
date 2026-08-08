import "server-only";
import type { EngineState, EnginePlayer, EngineCourt, GeneratedMatch, GeneratedSitOut } from "@picklebaddies/match-engine";
import { createInitialState, buildRound, seededOrder, DEFAULT_SEED } from "@picklebaddies/match-engine";
import { isSchedulable, type ScoringMode, type SessionPlayerStatus } from "@picklebaddies/domain";

/**
 * Firestore-serializable mirror of EngineState (Maps aren't Firestore-native).
 * Persisted at sessions/{id}/engine/state and updated incrementally — see
 * server/sessions/score.ts — so fairness bookkeeping is O(1) per score
 * submission instead of replaying full match history on every write.
 */
export interface FirestoreEngineState {
  gamesPlayed: Record<string, number>;
  sitOuts: Record<string, number>;
  lastSitOutRound: Record<string, number>;
  partnerCount: Record<string, number>;
  opponentCount: Record<string, number>;
  lastPartner: Record<string, string>;
  lastOpponents: Record<string, string[]>;
  lastPlayedRound: Record<string, number>;
}

export function serializeEngineState(state: EngineState): FirestoreEngineState {
  const rec = (m: Map<string, number>) => Object.fromEntries(m);
  const recStr = (m: Map<string, string>) => Object.fromEntries(m);
  return {
    gamesPlayed: rec(state.gamesPlayed),
    sitOuts: rec(state.sitOuts),
    lastSitOutRound: rec(state.lastSitOutRound),
    partnerCount: rec(state.partnerCount),
    opponentCount: rec(state.opponentCount),
    lastPartner: recStr(state.lastPartner),
    lastOpponents: Object.fromEntries([...state.lastOpponents].map(([k, v]) => [k, [...v]])),
    lastPlayedRound: rec(state.lastPlayedRound),
  };
}

export function deserializeEngineState(data: FirestoreEngineState | undefined, players: EnginePlayer[]): EngineState {
  if (!data) return createInitialState(players);
  return {
    gamesPlayed: new Map(Object.entries(data.gamesPlayed ?? {})),
    sitOuts: new Map(Object.entries(data.sitOuts ?? {})),
    lastSitOutRound: new Map(Object.entries(data.lastSitOutRound ?? {})),
    partnerCount: new Map(Object.entries(data.partnerCount ?? {})),
    opponentCount: new Map(Object.entries(data.opponentCount ?? {})),
    lastPartner: new Map(Object.entries(data.lastPartner ?? {})),
    lastOpponents: new Map(Object.entries(data.lastOpponents ?? {}).map(([k, v]) => [k, new Set(v)])),
    lastPlayedRound: new Map(Object.entries(data.lastPlayedRound ?? {})),
  };
}

export function toEnginePlayers(players: Array<{ id?: string; playerId?: string; displayName?: string; skillLevel?: string; status?: string }>): EnginePlayer[] {
  return players
    .filter((p) => isSchedulable((p.status ?? "") as SessionPlayerStatus))
    .map((p) => ({
      playerId: (p.id || p.playerId)!,
      displayName: p.displayName ?? "Player",
      skillLevel: (p.skillLevel as EnginePlayer["skillLevel"]) || "unknown",
    }));
}

export function toEngineCourts(courts: Array<{ courtId?: string; id?: string; name: string; courtNumber: number; isActive?: boolean }>): EngineCourt[] {
  return (courts || [])
    .filter((c) => c.isActive !== false)
    .map((c) => ({ courtId: (c.courtId || c.id)!, name: c.name, courtNumber: c.courtNumber }));
}

/** Builds the Firestore match-doc payloads for a set of engine-generated matches. */
export function buildMatchDocs(
  sessionId: string,
  playerNameById: Map<string, string>,
  matches: GeneratedMatch[],
  courtNameById: Map<string, string>,
) {
  return matches.map((match) => ({
    sessionId,
    roundNumber: match.roundNumber,
    courtId: match.courtId,
    courtName: courtNameById.get(match.courtId) ?? match.courtId,
    matchNumber: match.matchNumber,
    teamA: match.teamA.map((pid) => ({ playerId: pid, displayName: playerNameById.get(pid) ?? "Unknown" })),
    teamB: match.teamB.map((pid) => ({ playerId: pid, displayName: playerNameById.get(pid) ?? "Unknown" })),
    teamAIds: match.teamA,
    teamBIds: match.teamB,
    status: "scheduled" as const,
    isLocked: false,
  }));
}

export function buildSitOutDocs(sitOuts: GeneratedSitOut[]) {
  return sitOuts;
}

/**
 * Points are always optional — a match can be finished with just a winner
 * tap, regardless of the session's scoring mode. If points are given, they
 * must be numeric and not tied; otherwise an explicit winner is required.
 */
export function validatePayload(
  payload: unknown,
  _mode: ScoringMode,
): { ok: true } | { ok: false; message: string } {
  if (!payload || typeof payload !== "object") return { ok: false, message: "payload must be an object" };
  const p = payload as Record<string, unknown>;
  if (typeof p.teamAScore === "number" && typeof p.teamBScore === "number") {
    if (p.teamAScore === p.teamBScore) return { ok: false, message: "Tied scores are not allowed" };
    return { ok: true };
  }
  if (p.winnerTeam === "A" || p.winnerTeam === "B") return { ok: true };
  return { ok: false, message: "Pick a winner, or enter both scores" };
}

// ── Continuous per-court auto-fill ──────────────────────────────────────────
//
// When a match completes, the court it was on frees up. Rather than a manual
// "Advance Round", the next match for whoever's currently idle is assigned to
// that court (and any other currently-empty court) right here, in the same
// transaction that completes the match — this is also what serializes two
// courts finishing near-simultaneously against each other (see plan).

export interface AutoFillInputs {
  idlePlayers: EnginePlayer[];
  freedCourts: EngineCourt[];
  state: EngineState;
  cycle: number;
  nameById: Map<string, string>;
  courtNameById: Map<string, string>;
}

export async function readAutoFillInputs(
  t: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  sessionId: string,
  completingMatchId: string,
): Promise<AutoFillInputs | null> {
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const [sessionSnap, scheduledSnap, stateSnap, playersSnap] = await Promise.all([
    t.get(sessionRef),
    t.get(db.collection(`sessions/${sessionId}/matches`).where("status", "==", "scheduled")),
    t.get(db.doc(`sessions/${sessionId}/engine/state`)),
    t.get(db.collection(`sessions/${sessionId}/players`)),
  ]);
  const session = sessionSnap.data()!;

  const otherScheduled = scheduledSnap.docs.filter((d) => d.id !== completingMatchId);
  const occupiedCourtIds = new Set(otherScheduled.map((d) => d.data().courtId as string));
  const busyPlayerIds = new Set(
    otherScheduled.flatMap((d) => {
      const m = d.data();
      return [...(m.teamAIds ?? []), ...(m.teamBIds ?? [])] as string[];
    }),
  );

  const players = playersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const enginePlayers = toEnginePlayers(players);
  const idlePlayers = enginePlayers.filter((p) => !busyPlayerIds.has(p.playerId));

  const engineCourts = toEngineCourts(session.courts || []);
  const freedCourts = engineCourts.filter((c) => !occupiedCourtIds.has(c.courtId));

  if (idlePlayers.length < 4 || freedCourts.length === 0) return null;

  const state = deserializeEngineState(stateSnap.data() as FirestoreEngineState | undefined, enginePlayers);
  const nameById = new Map(players.map((p: any) => [p.id, p.displayName ?? "Player"]));
  const courtNameById = new Map(engineCourts.map((c) => [c.courtId, c.name]));
  const cycle = session.nextCycleNumber || 2;

  return { idlePlayers, freedCourts, state, cycle, nameById, courtNameById };
}

export function writeAutoFill(
  t: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  sessionId: string,
  sessionRef: FirebaseFirestore.DocumentReference,
  auto: AutoFillInputs,
): void {
  const order = seededOrder(auto.idlePlayers.map((p) => p.playerId), DEFAULT_SEED);
  const { matches, sitOuts } = buildRound(auto.state, auto.idlePlayers, auto.freedCourts, auto.cycle, order);
  if (matches.length === 0) return;

  for (const doc of buildMatchDocs(sessionId, auto.nameById, matches, auto.courtNameById)) {
    t.set(db.collection(`sessions/${sessionId}/matches`).doc(), doc);
  }
  for (const sitOut of sitOuts) {
    t.set(db.collection(`sessions/${sessionId}/sitOuts`).doc(), sitOut);
  }
  t.set(db.doc(`sessions/${sessionId}/engine/state`), serializeEngineState(auto.state));
  t.update(sessionRef, { nextCycleNumber: auto.cycle + 1 });
}
