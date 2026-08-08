export declare const updatePlayerStatus: import("firebase-functions/https").CallableFunction<any, Promise<{
    success: boolean;
    rebalanceRecommended: boolean;
}>, unknown>;
export declare const addLatePlayer: import("firebase-functions/https").CallableFunction<any, Promise<{
    success: boolean;
    availableFromRound: any;
    rebalanceRecommended: boolean;
}>, unknown>;
