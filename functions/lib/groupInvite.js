"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.joinGroupByInvite = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const domain_1 = require("@picklebaddies/domain");
const validation_js_1 = require("./lib/validation.js");
exports.joinGroupByInvite = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be signed in to join a group.");
    const rawCode = (0, validation_js_1.assertString)(request.data?.inviteCode, "inviteCode");
    const inviteCode = (0, domain_1.normalizeJoinCode)(rawCode);
    const uid = request.auth.uid;
    const db = (0, firestore_1.getFirestore)();
    const q = await db.collection("groups")
        .where("groupInviteCode", "==", inviteCode)
        .limit(1)
        .get();
    if (q.empty)
        throw new https_1.HttpsError("not-found", "Invite link is no longer valid.");
    const groupDoc = q.docs[0];
    const groupId = groupDoc.id;
    const memberRef = db.doc(`groups/${groupId}/members/${uid}`);
    const memberSnap = await memberRef.get();
    if (memberSnap.exists) {
        return { groupId, role: memberSnap.data().role };
    }
    await db.runTransaction(async (t) => {
        const groupRef = db.doc(`groups/${groupId}`);
        t.set(memberRef, {
            userId: uid,
            role: "member",
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        t.update(groupRef, {
            memberIds: firestore_1.FieldValue.arrayUnion(uid),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    return { groupId, role: "member" };
});
