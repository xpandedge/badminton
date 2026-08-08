import {
  addDoc, collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp,
  setDoc, deleteDoc, query, where, updateDoc, arrayUnion, arrayRemove
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebaseServices } from "@/lib/firebase/client";
import { safeUnsubscribe } from "@/lib/realtime/watchWithFallback";
import { type GroupMember, generateJoinCode } from "@picklebaddies/domain";
import type { Group, GroupMemberDoc } from "./types";

/** Watches all groups the given user is a member of. */
export function watchUserGroups(
  uid: string,
  cb: (groups: Array<{ id: string; name: string }>) => void,
  onError?: (error: Error) => void,
): () => void {
  const { db } = getFirebaseServices();
  const q = query(collection(db, "groups"), where("memberIds", "array-contains", uid));
  const unsub = onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) })));
  }, onError);
  return () => safeUnsubscribe(unsub);
}

/** Super-admin view of every team. Firestore rules gate this by email. */
export function watchAllGroups(
  cb: (groups: Array<{ id: string; name: string; memberIds: string[] }>) => void,
  onError?: (error: Error) => void,
): () => void {
  const { db } = getFirebaseServices();
  const unsub = onSnapshot(collection(db, "groups"), (snap) => {
    cb(snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name as string,
        memberIds: (data.memberIds as string[] | undefined) ?? [],
      };
    }));
  }, onError);
  return () => safeUnsubscribe(unsub);
}

/** One-shot read of a group document. */
export async function getGroup(
  groupId: string,
): Promise<{ name: string; description: string | null; groupInviteCode?: string } | null> {
  const { db } = getFirebaseServices();
  const snap = await getDoc(doc(db, "groups", groupId));
  return snap.exists() ? (snap.data() as { name: string; description: string | null; groupInviteCode?: string }) : null;
}

/** Creates the group and writes the creator as owner (PRD §12.2). */
export async function createGroup(input: { name: string; description?: string }): Promise<string> {
  const { db, auth } = getFirebaseServices();
  const uid = auth.currentUser!.uid;
  const ref = await addDoc(collection(db, "groups"), {
    name: input.name,
    description: input.description ?? null,
    createdBy: uid,
    memberIds: [uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    groupInviteCode: generateJoinCode(),
  });
  await setDoc(doc(db, `groups/${ref.id}/members/${uid}`), {
    userId: uid, role: "owner", createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Super-admin team creation. Owner assignment can happen separately by email. */
export async function createTeam(input: { name: string; description?: string }): Promise<string> {
  const { db, auth } = getFirebaseServices();
  const uid = auth.currentUser!.uid;
  const ref = await addDoc(collection(db, "groups"), {
    name: input.name,
    description: input.description ?? null,
    createdBy: uid,
    memberIds: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export interface JoinRequest {
  userId: string;
  displayName: string;
  email: string | null;
  status: string;
}

/** Watches pending self-join requests for a squad (members only, per rules). */
export function watchJoinRequests(
  groupId: string,
  cb: (requests: JoinRequest[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const { db } = getFirebaseServices();
  const unsub = onSnapshot(query(collection(db, `groups/${groupId}/joinRequests`)), (snap) => {
    cb(snap.docs.map((d) => ({ userId: d.id, ...(d.data() as Omit<JoinRequest, "userId">) })));
  }, onError);
  return () => safeUnsubscribe(unsub);
}

/** Watches the group doc itself (name + live invite code). */
export function watchGroupDoc(
  groupId: string,
  cb: (data: { name: string; inviteCode?: string } | null) => void,
  onError?: (error: Error) => void,
): () => void {
  const { db } = getFirebaseServices();
  const unsub = onSnapshot(doc(db, "groups", groupId), (snap) => {
    cb(snap.exists() ? (snap.data() as { name: string; inviteCode?: string }) : null);
  }, onError);
  return () => safeUnsubscribe(unsub);
}

export function watchGroupMembers(
  groupId: string,
  cb: (members: GroupMember[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const { db } = getFirebaseServices();
  const unsub = onSnapshot(query(collection(db, `groups/${groupId}/members`)), (snap) => {
    cb(snap.docs.map((d) => d.data() as GroupMember));
  }, onError);
  return () => safeUnsubscribe(unsub);
}

export async function addMember(groupId: string, userId: string, role: GroupMemberDoc["role"]): Promise<void> {
  const { db } = getFirebaseServices();
  await setDoc(doc(db, `groups/${groupId}/members/${userId}`), {
    userId, role, createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "groups", groupId), {
    memberIds: arrayUnion(userId)
  });
}

export async function addMemberByEmail(groupId: string, email: string, role: Exclude<GroupMemberDoc["role"], "owner">): Promise<void> {
  const { functions } = getFirebaseServices();
  const callable = httpsCallable<
    { groupId: string; email: string; role: Exclude<GroupMemberDoc["role"], "owner"> },
    { userId: string; role: Exclude<GroupMemberDoc["role"], "owner"> }
  >(functions, "addGroupMemberByEmail");
  await callable({ groupId, email, role });
}

export async function addTeamOwnerByEmail(groupId: string, email: string): Promise<void> {
  const { db } = getFirebaseServices();
  const normalizedEmail = email.trim().toLowerCase();
  let usersSnap = await getDocs(query(collection(db, "users"), where("emailLower", "==", normalizedEmail)));
  if (usersSnap.empty) {
    usersSnap = await getDocs(query(collection(db, "users"), where("email", "==", normalizedEmail)));
  }
  const userDoc = usersSnap.docs[0];
  if (!userDoc) {
    throw new Error("User must sign up before they can become a team owner.");
  }
  await addMember(groupId, userDoc.id, "owner");
}
export async function removeMember(groupId: string, userId: string): Promise<void> {
  const { db } = getFirebaseServices();
  await deleteDoc(doc(db, `groups/${groupId}/members/${userId}`));
  await updateDoc(doc(db, "groups", groupId), {
    memberIds: arrayRemove(userId)
  });
}
