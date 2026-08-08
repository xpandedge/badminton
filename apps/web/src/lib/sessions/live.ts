import { getFirebaseServices } from "@/lib/firebase/client";
import { httpsCallable } from "firebase/functions";
import { collection, query, onSnapshot, orderBy, getDocs } from "firebase/firestore";
import { leaderboardCompare, ScoringMode, LeaderboardRow } from "@picklebaddies/domain";
import { logEvent } from "@/lib/analytics/events";
import { watchWithFallback } from "@/lib/realtime/watchWithFallback";

export async function generateSchedule(data: { sessionId: string }) {
  const { functions } = getFirebaseServices();
  const result = await httpsCallable(functions, "generateSchedule")(data);
  void logEvent("schedule_generated", { sessionId: data.sessionId });
  return result;
}

export async function startSession(data: { sessionId: string }) {
  const { functions } = getFirebaseServices();
  const result = await httpsCallable(functions, "startSession")(data);
  void logEvent("session_started", { sessionId: data.sessionId });
  return result;
}

export async function advanceRound(data: { sessionId: string; force?: boolean }) {
  const { functions } = getFirebaseServices();
  const result = await httpsCallable(functions, "advanceRound")(data);
  const res = result.data as any;
  if (!res?.needsConfirmation) {
    void logEvent("round_advanced", { sessionId: data.sessionId });
  }
  return result;
}

export async function completeSession(data: { sessionId: string }) {
  const { functions } = getFirebaseServices();
  const result = await httpsCallable(functions, "completeSession")(data);
  void logEvent("session_completed", { sessionId: data.sessionId });
  return result;
}

export function pauseSession(data: { sessionId: string }) {
  const { functions } = getFirebaseServices();
  return httpsCallable(functions, "pauseSession")(data);
}

export function resumeSession(data: { sessionId: string }) {
  const { functions } = getFirebaseServices();
  return httpsCallable(functions, "resumeSession")(data);
}

export function submitScore(data: unknown) {
  const { functions } = getFirebaseServices();
  return httpsCallable(functions, "submitScore")(data);
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
