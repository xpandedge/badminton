/**
 * Rebalance future rounds, preserving locked (completed/in-progress) matches.
 *
 * Fully transactional (F-C3): every read — session, role, players, rounds,
 * matches, sit-outs — happens inside one transaction snapshot before any write,
 * so a concurrent score submission can't cause a now-locked match to be deleted
 * or double-counted. `elapsedRounds` is derived once from round status (D4) and
 * drives the delete boundary, the write boundary, and the engine identically
 * (F-H1/F-H2). The pure engine is invoked between the reads and the writes.
 */
export declare const rebalanceSession: import("firebase-functions/https").CallableFunction<any, Promise<{
    summary: string;
    metadata: import("@picklebaddies/match-engine").FairnessMetadata;
    success: boolean;
}>, unknown>;
