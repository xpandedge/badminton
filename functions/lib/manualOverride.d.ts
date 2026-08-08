/** PRD §12.10: swap two players in a future (scheduled, not locked) match. */
export declare const swapPlayers: import("firebase-functions/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
/** PRD §12.10: reassign a future match to a different court. */
export declare const moveMatch: import("firebase-functions/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
/** DELTA_SPEC D2: disable a court for future scheduling. */
export declare const disableCourt: import("firebase-functions/https").CallableFunction<any, Promise<{
    success: boolean;
    rebalanceRecommended: boolean;
}>, unknown>;
