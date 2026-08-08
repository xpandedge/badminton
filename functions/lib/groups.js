"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addGroupMemberByEmail = void 0;
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const domain_1 = require("@picklebaddies/domain");
const auth_js_1 = require("./lib/auth.js");
const validation_js_1 = require("./lib/validation.js");
function assertAssignableRole(value) {
    if (value === "member" || value === "organiser")
        return value;
    throw new https_1.HttpsError("invalid-argument", "role must be member or organiser");
}
async function findUserIdByEmail(emailLower) {
    const db = (0, firestore_1.getFirestore)();
    const byEmailLower = await db.collection("users").where("emailLower", "==", emailLower).limit(1).get();
    if (!byEmailLower.empty)
        return byEmailLower.docs[0].id;
    const byEmail = await db.collection("users").where("email", "==", emailLower).limit(1).get();
    if (!byEmail.empty)
        return byEmail.docs[0].id;
    try {
        const user = await (0, auth_1.getAuth)().getUserByEmail(emailLower);
        return user.uid;
    }
    catch {
        return null;
    }
}
exports.addGroupMemberByEmail = (0, https_1.onCall)({ cors: true }, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be signed in");
    const groupId = (0, validation_js_1.assertString)(req.data?.groupId, "groupId");
    const email = (0, validation_js_1.assertString)(req.data?.email, "email").trim().toLowerCase();
    const role = assertAssignableRole(req.data?.role);
    if (!email.includes("@")) {
        throw new https_1.HttpsError("invalid-argument", "Enter a valid email address");
    }
    await (0, auth_js_1.requireGroupRole)(req.auth.uid, groupId, domain_1.canManageGroup);
    const userId = await findUserIdByEmail(email);
    if (!userId) {
        throw new https_1.HttpsError("not-found", "User must sign up before you can add them to this team.");
    }
    const db = (0, firestore_1.getFirestore)();
    const memberRef = db.doc(`groups/${groupId}/members/${userId}`);
    const groupRef = db.doc(`groups/${groupId}`);
    await db.runTransaction(async (tx) => {
        const memberSnap = await tx.get(memberRef);
        const existingRole = memberSnap.exists ? memberSnap.data().role : null;
        if (existingRole === "owner") {
            throw new https_1.HttpsError("failed-precondition", "Team owner role can only be managed by a super admin.");
        }
        tx.set(memberRef, {
            userId,
            email,
            role,
            createdAt: memberSnap.exists ? memberSnap.data()?.createdAt ?? firestore_1.FieldValue.serverTimestamp() : firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.update(groupRef, {
            memberIds: firestore_1.FieldValue.arrayUnion(userId),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    return { userId, role };
});
