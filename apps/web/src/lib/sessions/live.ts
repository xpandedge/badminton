import { getFirebaseServices } from "@/lib/firebase/client";
import { collection, doc, query, onSnapshot, orderBy, getDocs, getDoc } from "firebase/firestore";
import { leaderboardCompare, ScoringMode, LeaderboardRow } from "@picklebaddies/domain";
import { logEvent } from "@/lib/analytics/events";
import { watchWithFallback } from "@/lib/realtime/watchWithFallback";
import { generateSchedule as serverGenerateSchedule } from "@/server/sessions/generate";
import { updateSessionStatus, deleteSession as serverDeleteSession } from "@/server/sessions/actions";

export async function deleteSession(data: { sessionId: string }) {
  const result = await serverDeleteSession(data.sessionId);
  if (!result.ok) throw new Error(result.message);
  return { data: result.data };
}

export async function generateSchedule(data: { sessionId: string }) {
  const result = await serverGenerateSchedule(data.sessionId);
  if (!result.ok) throw new Error(result.message);
  void logEvent("schedule_generated", { sessionId: data.sessionId });
  return { data: result.data };
}

export async function startSession(data: { sessionId: string }) {
  const result = await updateSessionStatus(data.sessionId, "active");
  if (!result.ok) throw new Error(result.message);
  void logEvent("session_started", { sessionId: data.sessionId });
  return { data: result.data };
}

export async function completeSession(data: { sessionId: string }) {
  const result = await updateSessionStatus(data.sessionId, "completed");
  if (!result.ok) throw new Error(result.message);
  void logEvent("session_completed", { sessionId: data.sessionId });
  return { data: result.data };
}

export async function pauseSession(data: { sessionId: string }) {
  const result = await updateSessionStatus(data.sessionId, "paused");
  if (!result.ok) throw new Error(result.message);
  return { data: result.data };
}

export async function resumeSession(data: { sessionId: string }) {
  const result = await updateSessionStatus(data.sessionId, "active");
  if (!result.ok) throw new Error(result.message);
  return { data: result.data };
}

/**
 * Continuous per-court scheduling: matches live in a flat collection, not
 * nested under a round doc — each court has at most one `scheduled` match at
 * a time, filled automatically as courts free up (see server/sessions/score.ts).
 * `roundNumber` on a match is a monotonic display label only.
 */
export function watchMatches(sessionId: string, callback: (matches: any[]) => void) {
  const { db } = getFirebaseServices();
  const q = query(collection(db, `sessions/${sessionId}/matches`), orderBy("roundNumber", "asc"));
  const emit = (snapshot: { docs: any[] }) =>
    callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  return watchWithFallback(
    (onData, onError) => onSnapshot(q, (snap) => { emit(snap); onData(snap); }, onError),
    () => { void getDocs(q).then(emit).catch(() => {}); },
  );
}

/** Live fairness bookkeeping doc (see server/sessions/scheduling.ts) — used to
 *  derive a lightweight "sit-out spread" health stat on the live console. */
export function watchEngineState(sessionId: string, callback: (state: any | null) => void) {
  const { db } = getFirebaseServices();
  const ref = doc(db, `sessions/${sessionId}/engine/state`);
  const emit = (snap: { exists(): boolean; data(): any }) => callback(snap.exists() ? snap.data() : null);
  return watchWithFallback(
    (onData, onError) => onSnapshot(ref, (snap) => { emit(snap); onData(snap); }, onError),
    () => { void getDoc(ref).then(emit).catch(() => {}); },
  );
}

export function watchLeaderboard(sessionId: string, mode: ScoringMode, callback: (leaderboard: any[]) => void) {
  const { db } = getFirebaseServices();
  const q = query(collection(db, `sessions/${sessionId}/leaderboard`));
  const emit = (snapshot: { docs: any[] }) => {
    const lb = snapshot.docs.map((doc) => ({ playerId: doc.id, ...doc.data() }));
    lb.sort((a: any, b: any) => leaderboardCompare(a as LeaderboardRow, b as LeaderboardRow, mode));
    callback(lb);
  };
  return watchWithFallback(
    (onData, onError) => onSnapshot(q, (snap) => { emit(snap); onData(snap); }, onError),
    () => { void getDocs(q).then(emit).catch(() => {}); },
  );
}
