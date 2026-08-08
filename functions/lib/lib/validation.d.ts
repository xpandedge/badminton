import type { ScorePayload, ScoringMode } from "@picklebaddies/domain";
export declare function assertString(value: unknown, field: string): string;
export declare function assertInt(value: unknown, field: string): number;
export declare function assertEnum<T extends string>(value: unknown, field: string, allowed: ReadonlyArray<T>): T;
export declare function assertScorePayload(value: unknown, mode: ScoringMode): ScorePayload;
