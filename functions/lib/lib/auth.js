"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireGroupRole = requireGroupRole;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
/**
 * Loads the caller's group role and asserts the predicate, else throws permission-denied.
 *
 * When called inside a transaction, pass `tx` so the membership read participates
 * in the transaction's consistent snapshot (DELTA_SPEC D5 / review F-C1). Callers
 * must invoke this BEFORE any transactional write (Firestore: all reads before writes).
 */
async function requireGroupRole(uid, groupId, predicate, tx) {
    const db = (0, firestore_1.getFirestore)();
    const ref = db.doc(`groups/${groupId}/members/${uid}`);
    const doc = tx ? await tx.get(ref) : await ref.get();
    const role = doc.exists ? doc.data().role : null;
    if (!predicate(role)) {
        throw new https_1.HttpsError("permission-denied", "Insufficient role");
    }
    return role;
}
