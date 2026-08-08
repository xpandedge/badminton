export declare const advanceRound: import("firebase-functions/https").CallableFunction<any, Promise<{
    needsConfirmation: boolean;
    pendingCount: number;
    success?: undefined;
    nextRound?: undefined;
} | {
    success: boolean;
    nextRound: any;
    needsConfirmation?: undefined;
    pendingCount?: undefined;
}>, unknown>;
