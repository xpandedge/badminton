import { httpsCallable } from "firebase/functions";
import { doc, updateDoc } from "firebase/firestore";
import { getFirebaseServices } from "@/lib/firebase/client";
import { generateJoinCode } from "@picklebaddies/domain";

export async function joinGroupByInvite(
  inviteCode: string,
): Promise<{ groupId: string; role: string }> {
  const { functions } = getFirebaseServices();
  const fn = httpsCallable<
    { inviteCode: string },
    { groupId: string; role: string }
  >(functions, "joinGroupByInvite");
  const result = await fn({ inviteCode });
  return result.data;
}

export async function regenerateGroupInviteCode(groupId: string): Promise<string> {
  const { db } = getFirebaseServices();
  const newCode = generateJoinCode();
  await updateDoc(doc(db, "groups", groupId), { groupInviteCode: newCode });
  return newCode;
}