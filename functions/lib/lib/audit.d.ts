export declare function writeAudit(batchOrTx: FirebaseFirestore.WriteBatch | FirebaseFirestore.Transaction, sessionId: string, entry: {
    actorUid: string;
    action: string;
    details?: any;
    timestamp?: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
}): void;
