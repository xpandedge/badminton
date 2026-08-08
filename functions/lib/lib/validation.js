"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertString = assertString;
exports.assertInt = assertInt;
exports.assertEnum = assertEnum;
exports.assertScorePayload = assertScorePayload;
const https_1 = require("firebase-functions/v2/https");
function assertString(value, field) {
    if (typeof value !== "string" || value.trim() === "") {
        throw new https_1.HttpsError("invalid-argument", `${field} must be a non-empty string.`);
    }
    return value;
}
function assertInt(value, field) {
    if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new https_1.HttpsError("invalid-argument", `${field} must be an integer.`);
    }
    return value;
}
function assertEnum(value, field, allowed) {
    if (!allowed.includes(value)) {
        throw new https_1.HttpsError("invalid-argument", `${field} must be one of: ${allowed.join(", ")}.`);
    }
    return value;
}
function assertScorePayload(value, mode) {
    if (!value || typeof value !== "object") {
        throw new https_1.HttpsError("invalid-argument", "scorePayload must be an object.");
    }
    const p = value;
    if (mode === "points") {
        if (typeof p.teamAScore !== "number" || typeof p.teamBScore !== "number") {
            throw new https_1.HttpsError("invalid-argument", "points mode requires numeric teamAScore and teamBScore.");
        }
        if (p.teamAScore === p.teamBScore) {
            throw new https_1.HttpsError("invalid-argument", "Tied scores are not allowed.");
        }
        return { teamAScore: p.teamAScore, teamBScore: p.teamBScore };
    }
    if (p.winnerTeam !== "A" && p.winnerTeam !== "B") {
        throw new https_1.HttpsError("invalid-argument", "winner_only mode requires winnerTeam of 'A' or 'B'.");
    }
    return { winnerTeam: p.winnerTeam };
}
