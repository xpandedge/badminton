import { addDoc, collection, onSnapshot, query, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { getFirebaseServices } from "@/lib/firebase/client";
import { safeUnsubscribe } from "@/lib/realtime/watchWithFallback";

export async function addVenue(groupId: string, name: string, address?: string): Promise<string> {
  const { db } = getFirebaseServices();
  const ref = await addDoc(collection(db, `groups/${groupId}/venues`), {
    name, address: address ?? null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function addCourt(groupId: string, venueId: string, name: string, courtNumber: number): Promise<string> {
  const { db } = getFirebaseServices();
  const ref = await addDoc(collection(db, `groups/${groupId}/venues/${venueId}/courts`), {
    name, courtNumber, isActive: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function setCourtActive(groupId: string, venueId: string, courtId: string, isActive: boolean): Promise<void> {
  const { db } = getFirebaseServices();
  await updateDoc(doc(db, `groups/${groupId}/venues/${venueId}/courts/${courtId}`), { isActive, updatedAt: serverTimestamp() });
}

export function watchCourts(
  groupId: string,
  venueId: string,
  cb: (courts: Array<{ id: string } & Record<string, unknown>>) => void,
  onError?: (error: Error) => void,
): () => void {
  const { db } = getFirebaseServices();
  const unsub = onSnapshot(query(collection(db, `groups/${groupId}/venues/${venueId}/courts`)), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
  return () => safeUnsubscribe(unsub);
}

export function watchVenues(
  groupId: string,
  cb: (venues: Array<{ id: string; name: string; isHome?: boolean }>) => void,
  onError?: (error: Error) => void,
): () => void {
  const { db } = getFirebaseServices();
  const unsub = onSnapshot(query(collection(db, `groups/${groupId}/venues`)), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as { name: string; isHome?: boolean }) }))), onError);
  return () => safeUnsubscribe(unsub);
}

export async function setHomeVenue(groupId: string, venueId: string, venueName: string): Promise<void> {
  const { db } = getFirebaseServices();
  await updateDoc(doc(db, "groups", groupId), {
    homeVenueId: venueId,
    homeVenueName: venueName,
    updatedAt: serverTimestamp(),
  });
}

