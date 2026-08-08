import { httpsCallable } from "firebase/functions";
import { getFirebaseServices } from "@/lib/firebase/client";
import { collection, onSnapshot } from "firebase/firestore";
import { safeUnsubscribe } from "@/lib/realtime/watchWithFallback";
import type { SkillLevel } from "@picklebaddies/domain";

export interface JoinRequest {
  id: string;
  displayName: string;
  isGuest: boolean;
  userId: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: unknown;
}

export async function requestJoin(joinCode: string, displayName: string, isGuest: boolean): Promise<{ sessionId: string; requestId: string }> {
  const { functions } = getFirebaseServices();
  const requestJoinFn = httpsCallable<{ joinCode: string; displayName: string; isGuest: boolean }, { sessionId: string; requestId: string }>(functions, "requestJoin");
  const result = await requestJoinFn({ joinCode, displayName, isGuest });
  return result.data;
}

export async function approveJoinRequest(sessionId: string, requestId: string, skillLevel: SkillLevel): Promise<void> {
  const { functions } = getFirebaseServices();
  const approveFn = httpsCallable<{ sessionId: string; requestId: string; skillLevel: SkillLevel }, void>(functions, "approveJoinRequest");
  await approveFn({ sessionId, requestId, skillLevel });
}

export async function rejectJoinRequest(sessionId: string, requestId: string): Promise<void> {
  const { functions } = getFirebaseServices();
  const rejectFn = httpsCallable<{ sessionId: string; requestId: string }, void>(functions, "rejectJoinRequest");
  await rejectFn({ sessionId, requestId });
}

export function watchJoinRequests(
  sessionId: string,
  cb: (requests: JoinRequest[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const { db } = getFirebaseServices();
  const unsub = onSnapshot(collection(db, `sessions/${sessionId}/joinRequests`), (snap) => {
    const requests = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as JoinRequest));
    cb(requests);
  }, onError);
  return () => safeUnsubscribe(unsub);
}
