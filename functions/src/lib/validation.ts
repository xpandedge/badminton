import { HttpsError } from "firebase-functions/v2/https";
import type { ScorePayload, ScoringMode } from "@picklebaddies/domain";

export function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpsError("invalid-argument", `${field} must be a non-empty string.`);
  }
  return value;
}

export function assertInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new HttpsError("invalid-argument", `${field} must be an integer.`);
  }
  return value;
}

export function assertEnum<T extends string>(value: unknown, field: string, allowed: ReadonlyArray<T>): T {
  if (!allowed.includes(value as T)) {
    throw new HttpsError("invalid-argument", `${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

export function assertScorePayload(value: unknown, mode: ScoringMode): ScorePayload {
  if (!value || typeof value !== "object") {
    throw new HttpsError("invalid-argument", "scorePayload must be an object.");
  }
  const p = value as Record<string, unknown>;
  if (mode === "points") {
    if (typeof p.teamAScore !== "number" || typeof p.teamBScore !== "number") {
      throw new HttpsError("invalid-argument", "points mode requires numeric teamAScore and teamBScore.");
    }
    if (p.teamAScore === p.teamBScore) {
      throw new HttpsError("invalid-argument", "Tied scores are not allowed.");
    }
    return { teamAScore: p.teamAScore as number, teamBScore: p.teamBScore as number };
  }
  if (p.winnerTeam !== "A" && p.winnerTeam !== "B") {
    throw new HttpsError("invalid-argument", "winner_only mode requires winnerTeam of 'A' or 'B'.");
  }
  return { winnerTeam: p.winnerTeam as "A" | "B" };
}
