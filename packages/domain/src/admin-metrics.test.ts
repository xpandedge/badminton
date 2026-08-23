import { describe, expect, it } from "vitest";
import {
  sessionAbandonmentRate,
  sessionCompletionRate,
  repeatSquadRate,
  unscoredMatchRate,
  type AdminMetricsSnapshot,
} from "./admin-metrics.js";

function snapshot(overrides: Partial<AdminMetricsSnapshot>): AdminMetricsSnapshot {
  return {
    capturedAtIso: "2026-08-23T00:00:00.000Z",
    users: { total: 0, registeredPlayers: 0, active30d: 0 },
    squads: { total: 0, active30d: 0, repeatSessionSquads: 0, archived: 0 },
    geography: { topRegions: [], unknownSquads: 0, source: "unknown" },
    sessions: { total: 0, created7d: 0, started: 0, completed: 0, abandoned: 0 },
    matches: { total: 0, scored: 0, unscored: 0 },
    support: { scoreCorrections: 0, ownershipTransfers: 0, statRecomputes: 0 },
    ...overrides,
  };
}

describe("admin metrics rates", () => {
  it("returns zero when the denominator is zero", () => {
    expect(unscoredMatchRate(snapshot({ matches: { total: 0, scored: 0, unscored: 0 } }))).toBe(0);
    expect(sessionCompletionRate(snapshot({ sessions: { total: 0, created7d: 0, started: 0, completed: 0, abandoned: 0 } }))).toBe(0);
    expect(sessionAbandonmentRate(snapshot({ sessions: { total: 0, created7d: 0, started: 0, completed: 0, abandoned: 0 } }))).toBe(0);
    expect(repeatSquadRate(snapshot({ squads: { total: 0, active30d: 0, repeatSessionSquads: 0, archived: 0 } }))).toBe(0);
  });

  it("rounds rates to whole percentages", () => {
    expect(unscoredMatchRate(snapshot({ matches: { total: 3, scored: 2, unscored: 1 } }))).toBe(33);
    expect(sessionCompletionRate(snapshot({ sessions: { total: 10, created7d: 0, started: 8, completed: 7, abandoned: 1 } }))).toBe(70);
    expect(sessionAbandonmentRate(snapshot({ sessions: { total: 8, created7d: 0, started: 8, completed: 6, abandoned: 2 } }))).toBe(25);
    expect(repeatSquadRate(snapshot({ squads: { total: 6, active30d: 4, repeatSessionSquads: 2, archived: 0 } }))).toBe(33);
  });
});
