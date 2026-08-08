import { getFirebaseServices } from "@/lib/firebase/client";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { logEvent } from "@/lib/analytics/events";
import { safeUnsubscribe } from "@/lib/realtime/watchWithFallback";
import { rebalanceSession as serverRebalance } from "@/server/sessions/rebalance";
import {
  updatePlayerStatus as serverUpdateStatus,
  addLatePlayer as serverAddLate,
  markPlayerInjured as serverMarkInjured,
  swapPlayers as serverSwapPlayers,
  moveMatch as serverMoveMatch,
  disableCourt as serverDisableCourt,
} from "@/server/sessions/players";

export async function rebalanceSession(data: { sessionId: string; trigger?: string }) {
  const result = await serverRebalance(
    data.sessionId,
    (data.trigger as any) ?? "manual_rebalance",
  );
  if (!result.ok) throw new Error(result.message);
  void logEvent("rebalance_triggered", { sessionId: data.sessionId, trigger: data.trigger });
  // Return shape expected by live page: { data: { summary, metadata } }
  return { data: result.data };
}

export async function updatePlayerStatus(data: { sessionId: string; sessionPlayerId: string; status: string }) {
  const result = await serverUpdateStatus(data.sessionId, data.sessionPlayerId, data.status);
  if (!result.ok) throw new Error(result.message);
  return { data: result.data };
}

export async function addLatePlayer(data: { sessionId: string; playerId: string; displayName: string; skillLevel?: string }) {
  const result = await serverAddLate(data.sessionId, data.playerId, data.displayName, data.skillLevel);
  if (!result.ok) throw new Error(result.message);
  return { data: result.data };
}

export async function markPlayerInjured(data: { sessionId: string; sessionPlayerId: string }) {
  const result = await serverMarkInjured(data.sessionId, data.sessionPlayerId);
  if (!result.ok) throw new Error(result.message);
  return { data: result.data };
}

export async function swapPlayers(data: { sessionId: string; matchId: string; roundNumber: number; outPlayerId: string; inPlayerId: string }) {
  const result = await serverSwapPlayers(data.sessionId, data.matchId, data.roundNumber, data.outPlayerId, data.inPlayerId);
  if (!result.ok) throw new Error(result.message);
  return { data: result.data };
}

export async function moveMatch(data: { sessionId: string; matchId: string; roundNumber: number; courtId: string }) {
  const result = await serverMoveMatch(data.sessionId, data.matchId, data.roundNumber, data.courtId);
  if (!result.ok) throw new Error(result.message);
  return { data: result.data };
}

export async function disableCourt(data: { sessionId: string; courtId: string }) {
  const result = await serverDisableCourt(data.sessionId, data.courtId);
  if (!result.ok) throw new Error(result.message);
  return { data: result.data };
}

export function watchGenerationRuns(
  sessionId: string,
  callback: (runs: any[]) => void,
  onError?: (error: Error) => void,
) {
  const { db } = getFirebaseServices();
  const q = query(
    collection(db, `sessions/${sessionId}/generationRuns`),
    orderBy("createdAt", "desc")
  );
  const unsub = onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, onError);
  return () => safeUnsubscribe(unsub);
}
