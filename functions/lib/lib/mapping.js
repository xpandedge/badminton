"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapSessionToEngineInput = mapSessionToEngineInput;
const domain_1 = require("@picklebaddies/domain");
function mapSessionToEngineInput(session, players, rounds, matches, mode) {
    const enginePlayers = players
        .filter((p) => (0, domain_1.isSchedulable)(p.status))
        .map((p) => ({
        playerId: p.id || p.playerId,
        displayName: p.displayName,
        skillLevel: p.skillLevel || "unknown",
        // Late joiners have availableFromRound > 1 (DELTA_SPEC D7 / PRD §23)
        availableFromRound: mode === "rebalance" ? (p.availableFromRound || 1) : 1,
    }));
    const engineCourts = (session.courts || [])
        .filter((c) => c.isActive)
        .map((c) => ({
        courtId: c.courtId || c.id,
        name: c.name,
        courtNumber: c.courtNumber,
    }));
    const elapsedRounds = rounds.filter((r) => r.status === "completed" || r.status === "in_progress").length;
    const lockedMatches = matches
        .filter((m) => m.isLocked)
        .map((m) => ({
        roundNumber: m.roundNumber,
        courtId: m.courtId,
        teamA: m.teamAIds || [m.teamA[0]?.playerId, m.teamA[1]?.playerId],
        teamB: m.teamBIds || [m.teamB[0]?.playerId, m.teamB[1]?.playerId],
    }));
    return {
        mode,
        players: enginePlayers,
        courts: engineCourts,
        sessionDurationMinutes: session.durationMinutes || 60,
        estimatedGameMinutes: session.estimatedGameMinutes || 15,
        elapsedRounds,
        lockedMatches,
    };
}
