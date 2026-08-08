import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { canManageGroup, type GroupRole } from "@picklebaddies/domain";
import { requireGroupRole } from "./lib/auth.js";
import { assertString } from "./lib/validation.js";

function assertAssignableRole(value: unknown): Exclude<GroupRole, "owner"> {
  if (value === "member" || value === "organiser") return value;
  throw new HttpsError("invalid-argument", "role must be member or organiser");
}

async function findUserIdByEmail(emailLower: string): Promise<string | null> {
  const db = getFirestore();
  const byEmailLower = await db.collection("users").where("emailLower", "==", emailLower).limit(1).get();
  if (!byEmailLower.empty) return byEmailLower.docs[0]!.id;

  const byEmail = await db.collection("users").where("email", "==", emailLower).limit(1).get();
  if (!byEmail.empty) return byEmail.docs[0]!.id;

  try {
    const user = await getAuth().getUserByEmail(emailLower);
    return user.uid;
  } catch {
    return null;
  }
}

export const addGroupMemberByEmail = onCall({ cors: true }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in");

  const groupId = assertString(req.data?.groupId, "groupId");
  const email = assertString(req.data?.email, "email").trim().toLowerCase();
  const role = assertAssignableRole(req.data?.role);

  if (!email.includes("@")) {
    throw new HttpsError("invalid-argument", "Enter a valid email address");
  }

  await requireGroupRole(req.auth.uid, groupId, canManageGroup);

  const userId = await findUserIdByEmail(email);
  if (!userId) {
    throw new HttpsError("not-found", "User must sign up before you can add them to this team.");
  }

  const db = getFirestore();
  const memberRef = db.doc(`groups/${groupId}/members/${userId}`);
  const groupRef = db.doc(`groups/${groupId}`);

  await db.runTransaction(async (tx) => {
    const memberSnap = await tx.get(memberRef);
    const existingRole = memberSnap.exists ? (memberSnap.data() as { role?: GroupRole }).role : null;
    if (existingRole === "owner") {
      throw new HttpsError("failed-precondition", "Team owner role can only be managed by a super admin.");
    }

    tx.set(memberRef, {
      userId,
      email,
      role,
      createdAt: memberSnap.exists ? memberSnap.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.update(groupRef, {
      memberIds: FieldValue.arrayUnion(userId),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { userId, role };
});
