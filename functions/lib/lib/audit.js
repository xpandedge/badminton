"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeAudit = writeAudit;
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-admin/firestore");
function writeAudit(batchOrTx, sessionId, entry) {
    const db = (0, firestore_1.getFirestore)();
    const ref = db.collection(`sessions/${sessionId}/auditLogs`).doc();
    const data = {
        ...entry,
        timestamp: entry.timestamp || firestore_2.FieldValue.serverTimestamp(),
    };
    if ("commit" in batchOrTx) {
        batchOrTx.set(ref, data);
    }
    else {
        batchOrTx.set(ref, data);
    }
}
