import { query, collection, where, orderBy, limit, getDocs } from "firebase/firestore";
import { getFirebaseServices } from "@/lib/firebase/client";
import type { QuickSession } from "./types";

export async function loadSessionHistory(uid: string, count = 30): Promise<QuickSession[]> {
  const { db } = getFirebaseServices();
  const q = query(
    collection(db, "quickSessions"),
    where("ownerUid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(count)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as QuickSession));
}
