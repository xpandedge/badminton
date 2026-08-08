import { addDoc, collection, onSnapshot, query, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { getFirebaseServices } from "@/lib/firebase/client";
import { safeUnsubscribe } from "@/lib/realtime/watchWithFallback";
import type { SkillLevel } from "@picklebaddies/domain";
import type { NewPlayerInput } from "./types";

export async function addPlayer(groupId: string, input: NewPlayerInput): Promise<string> {
  const { db } = getFirebaseServices();
  const ref = await addDoc(collection(db, `groups/${groupId}/players`), {
    userId: null,
    displayName: input.displayName,
    email: input.email ?? null,
    phone: input.phone ?? null,
    skillLevel: input.skillLevel ?? "unknown",
    isGuest: input.isGuest ?? true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function watchGroupPlayers(
  groupId: string,
  cb: (players: Array<{ id: string } & Record<string, unknown>>) => void,
  onError?: (error: Error) => void,
): () => void {
  const { db } = getFirebaseServices();
  const unsub = onSnapshot(query(collection(db, `groups/${groupId}/players`)), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
  return () => safeUnsubscribe(unsub);
}
