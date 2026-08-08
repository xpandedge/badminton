import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { normalizeJoinCode } from "@picklebaddies/domain";
import { assertString } from "./lib/validation.js";

export const joinGroupByInvite = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in to join a group.");

  const rawCode = assertString(request.data?.inviteCode, "inviteCode");
  const inviteCode = normalizeJoinCode(rawCode);
  const uid = request.auth.uid;

  const db = getFirestore();
  const q = await db.collection("groups")
    .where("groupInviteCode", "==", inviteCode)
    .limit(1)
    .get();

  if (q.empty) throw new HttpsError("not-found", "Invite link is no longer valid.");

  const groupDoc = q.docs[0]!;
  const groupId = groupDoc.id;

  const memberRef = db.doc(`groups/${groupId}/members/${uid}`);
  const memberSnap = await memberRef.get();

  if (memberSnap.exists) {
    return { groupId, role: memberSnap.data()!.role };
  }

  await db.runTransaction(async (t) => {
    const groupRef = db.doc(`groups/${groupId}`);
    t.set(memberRef, {
      userId: uid,
      role: "member",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.update(groupRef, {
      memberIds: FieldValue.arrayUnion(uid),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { groupId, role: "member" };
});