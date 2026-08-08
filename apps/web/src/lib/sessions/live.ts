import { getFirebaseServices } from "@/lib/firebase/client";
import { collection, query, onSnapshot, orderBy, getDocs } from "firebase/firestore";
import { leaderboardCompare, ScoringMode, LeaderboardRow } from "@picklebaddies/domain";
import { logEvent } from "@/lib/analytics/events";
import { watchWithFallback } from "@/lib/realtime/watchWithFallback";
import { generateSchedule as serverGenerateSchedule } from "@/server/sessions/generate";
import { updateSessionStatus, advanceRound as serverAdvanceRound } from "@/server/sessions/actions";

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

export async function advanceRound(data: { sessionId: string; force?: boolean }) {
  const result = await serverAdvanceRound(data.sessionId, data.force);
  if (!result.ok) throw new Error(result.message);
  if (!result.data.needsConfirmation) {
    void logEvent("round_advanced", { sessionId: data.sessionId });
  }
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

export function watchRounds(sessionId: string, callback: (rounds: any[]) => void) {
  const { db } = getFirebaseServices();
  const q = query(collection(db, `sessions/${sessionId}/rounds`), orderBy("roundNumber", "asc"));
  const emit = (snapshot: { docs: any[] }) =>
    callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  return watchWithFallback(
    (onData, onError) => onSnapshot(q, (snap) => { emit(snap); onData(snap); }, onError),
    () => { void getDocs(q).then(emit).catch(() => {}); },
  );
}

export function watchMatches(sessionId: string, roundNumber: number, callback: (matches: any[]) => void) {
  const { db } = getFirebaseServices();
  const q = query(
    collection(db, `sessions/${sessionId}/rounds/round_${roundNumber}/matches`),
    orderBy("matchNumber", "asc")
  );
  const emit = (snapshot: { docs: any[] }) =>
    callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  return watchWithFallback(
    (onData, onError) => onSnapshot(q, (snap) => { emit(snap); onData(snap); }, onError),
    () => { void getDocs(q).then(emit).catch(() => {}); },
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
