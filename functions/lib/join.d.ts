export declare const requestJoin: import("firebase-functions/https").CallableFunction<any, Promise<{
    sessionId: string;
    requestId: string;
}>, unknown>;
export declare const approveJoinRequest: import("firebase-functions/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
export declare const rejectJoinRequest: import("firebase-functions/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
