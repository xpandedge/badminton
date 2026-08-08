export declare const getScoreLinkData: import("firebase-functions/https").CallableFunction<any, Promise<{
    sessionId: string;
    sessionName: any;
    sport: any;
    scoringMode: any;
    currentRoundNumber: any;
    sessionStatus: any;
    courts: ({
        courtId: string;
        courtName: string;
        match: null;
    } | {
        courtId: string;
        courtName: string;
        match: {
            matchId: string;
            teamA: {
                playerId: string;
                displayName: string;
            }[];
            teamB: {
                playerId: string;
                displayName: string;
            }[];
            status: string;
        };
    })[];
}>, unknown>;
export declare const submitScoreByLink: import("firebase-functions/https").CallableFunction<any, Promise<{
    success: boolean;
    courtName: string;
    winnerTeam: "A" | "B";
}>, unknown>;
