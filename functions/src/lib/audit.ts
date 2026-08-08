import { getFirestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

export function writeAudit(
  batchOrTx: FirebaseFirestore.WriteBatch | FirebaseFirestore.Transaction,
  sessionId: string,
  entry: {
    actorUid: string;
    action: string;
    details?: any;
    timestamp?: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  }
) {
  const db = getFirestore();
  const ref = db.collection(`sessions/${sessionId}/auditLogs`).doc();
  const data = {
    ...entry,
    timestamp: entry.timestamp || FieldValue.serverTimestamp(),
  };

  if ("commit" in batchOrTx) {
    (batchOrTx as FirebaseFirestore.WriteBatch).set(ref, data);
  } else {
    (batchOrTx as FirebaseFirestore.Transaction).set(ref, data);
  }
}
