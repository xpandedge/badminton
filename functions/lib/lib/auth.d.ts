import { type Transaction } from "firebase-admin/firestore";
import { type GroupRole } from "@picklebaddies/domain";
/**
 * Loads the caller's group role and asserts the predicate, else throws permission-denied.
 *
 * When called inside a transaction, pass `tx` so the membership read participates
 * in the transaction's consistent snapshot (DELTA_SPEC D5 / review F-C1). Callers
 * must invoke this BEFORE any transactional write (Firestore: all reads before writes).
 */
export declare function requireGroupRole(uid: string, groupId: string, predicate: (role: GroupRole | null) => boolean, tx?: Transaction): Promise<GroupRole>;
