import { describe, expect, it } from "vitest";
import {
  sessionAbandonmentRate,
  sessionCompletionRate,
  repeatSquadRate,
  squadSecondSessionRate,
  unscoredMatchRate,
  type AdminMetricsSnapshot,
} from "./admin-metrics.js";

function snapshot(overrides: Partial<AdminMetricsSnapshot>): AdminMetricsSnapshot {
  return {
    capturedAtIso: "2026-08-23T00:00:00.000Z",
    period: { days: 90, label: "Last 90 days" },
    users: { total: 0, registeredPlayers: 0, active30d: 0, guestPlayersSampled: 0 },
    squads: { total: 0, active30d: 0, repeatSessionSquads: 0, archived: 0, new30d: 0 },
    retention: { fivePlus: 0, twoToFour: 0, once: 0 },
    geography: { topRegions: [], unknownSquads: 0, source: "unknown" },
    sessions: { total: 0, created7d: 0, created30d: 0, created90d: 0, started: 0, completed: 0, abandoned: 0, openNow: 0, neverStarted: 0, fullyScored: 0 },
    weeklySessions: [],
    quietSquads: [],
    matches: { total: 0, scored: 0, unscored: 0 },
    support: { scoreCorrections: 0, ownershipTransfers: 0, statRecomputes: 0 },
    ...overrides,
  };
}

describe("admin metrics rates", () => {
  const emptySessions: AdminMetricsSnapshot["sessions"] = {
    total: 0,
    created7d: 0,
    created30d: 0,
    created90d: 0,
    started: 0,
    completed: 0,
    abandoned: 0,
    openNow: 0,
    neverStarted: 0,
    fullyScored: 0,
  };

  it("returns zero when the denominator is zero", () => {
    expect(unscoredMatchRate(snapshot({ matches: { total: 0, scored: 0, unscored: 0 } }))).toBe(0);
    expect(sessionCompletionRate(snapshot({ sessions: emptySessions }))).toBe(0);
    expect(sessionAbandonmentRate(snapshot({ sessions: emptySessions }))).toBe(0);
    expect(repeatSquadRate(snapshot({ squads: { total: 0, active30d: 0, repeatSessionSquads: 0, archived: 0, new30d: 0 } }))).toBe(0);
    expect(squadSecondSessionRate(snapshot({ retention: { fivePlus: 0, twoToFour: 0, once: 0 } }))).toBe(0);
  });

  it("rounds rates to whole percentages", () => {
    expect(unscoredMatchRate(snapshot({ matches: { total: 3, scored: 2, unscored: 1 } }))).toBe(33);
    expect(sessionCompletionRate(snapshot({ sessions: { total: 10, created7d: 0, created30d: 0, created90d: 0, started: 8, completed: 7, abandoned: 1, openNow: 1, neverStarted: 2, fullyScored: 6 } }))).toBe(70);
    expect(sessionAbandonmentRate(snapshot({ sessions: { total: 8, created7d: 0, created30d: 0, created90d: 0, started: 8, completed: 6, abandoned: 2, openNow: 2, neverStarted: 0, fullyScored: 5 } }))).toBe(25);
    expect(repeatSquadRate(snapshot({ squads: { total: 6, active30d: 4, repeatSessionSquads: 2, archived: 0, new30d: 1 } }))).toBe(33);
    expect(squadSecondSessionRate(snapshot({ retention: { fivePlus: 1, twoToFour: 2, once: 1 } }))).toBe(75);
  });
});
