import { describe, expect, it } from "vitest";

import { buildSessionRsvpBuckets, normalizeCasualName } from "./session-rsvp.js";

describe("session RSVP roster", () => {
  it("keeps regulars in by default and moves away regulars to away", () => {
    const result = buildSessionRsvpBuckets({
      capacity: { totalPlayers: 11, casualConfirmedSlots: 3, waitlistEnabled: true },
      regulars: [
        { id: "r1", displayName: "Prasanna" },
        { id: "r2", displayName: "Sachin", response: "away" },
      ],
      casuals: [],
    });

    expect(result.regularsIn.map((p) => p.displayName)).toEqual(["Prasanna"]);
    expect(result.regularsAway.map((p) => p.displayName)).toEqual(["Sachin"]);
  });

  it("confirms casuals into every open capacity spot left by regulars", () => {
    const result = buildSessionRsvpBuckets({
      capacity: { totalPlayers: 11, casualConfirmedSlots: 3, waitlistEnabled: true },
      regulars: Array.from({ length: 8 }, (_, index) => ({
        id: `r${index}`,
        displayName: `Regular ${index}`,
        response: index < 2 ? "away" : "in",
      })),
      casuals: Array.from({ length: 6 }, (_, index) => ({
        id: `c${index}`,
        displayName: `Casual ${index}`,
        response: "casual_joined",
        joinedAtMs: index,
      })),
    });

    expect(result.casualsConfirmed).toHaveLength(5);
    expect(result.casualsWaiting).toHaveLength(1);
  });

  it("confirms five casuals when five regular places are open", () => {
    const result = buildSessionRsvpBuckets({
      capacity: { totalPlayers: 11, casualConfirmedSlots: 0, waitlistEnabled: true },
      regulars: Array.from({ length: 11 }, (_, index) => ({
        id: `r${index}`,
        displayName: `Regular ${index}`,
        response: index < 5 ? "away" : "in",
      })),
      casuals: Array.from({ length: 6 }, (_, index) => ({
        id: `c${index}`,
        displayName: `Casual ${index}`,
        response: "casual_joined",
        joinedAtMs: index,
      })),
    });

    expect(result.regularsIn).toHaveLength(6);
    expect(result.casualsConfirmed).toHaveLength(5);
    expect(result.casualsWaiting).toHaveLength(1);
  });

  it("keeps extra casuals out of the roster when the waiting list is off", () => {
    const result = buildSessionRsvpBuckets({
      capacity: { totalPlayers: 4, casualConfirmedSlots: 1, waitlistEnabled: false },
      regulars: [
        { id: "r1", displayName: "Regular 1" },
        { id: "r2", displayName: "Regular 2" },
        { id: "r3", displayName: "Regular 3" },
      ],
      casuals: [
        { id: "c1", displayName: "Casual 1", response: "casual_joined", joinedAtMs: 2 },
        { id: "c2", displayName: "Casual 2", response: "casual_joined", joinedAtMs: 1 },
      ],
    });

    expect(result.casualsConfirmed.map((p) => p.displayName)).toEqual(["Casual 2"]);
    expect(result.casualsWaiting).toEqual([]);
  });

  it("honours admin waiting overrides before first-come ordering", () => {
    const result = buildSessionRsvpBuckets({
      capacity: { totalPlayers: 5, casualConfirmedSlots: 2, waitlistEnabled: true },
      regulars: [{ id: "r1", displayName: "Regular 1" }],
      casuals: [
        {
          id: "c1",
          displayName: "Casual 1",
          response: "casual_joined",
          joinedAtMs: 1,
          adminOverride: "waiting",
        },
        { id: "c2", displayName: "Casual 2", response: "casual_joined", joinedAtMs: 2 },
        { id: "c3", displayName: "Casual 3", response: "casual_joined", joinedAtMs: 3 },
      ],
    });

    expect(result.casualsConfirmed.map((p) => p.displayName)).toEqual(["Casual 2", "Casual 3"]);
    expect(result.casualsWaiting.map((p) => p.displayName)).toEqual(["Casual 1"]);
  });

  it("blocks duplicate casual names by normalized display name", () => {
    expect(normalizeCasualName("  Sam T  ")).toBe("sam t");
    expect(normalizeCasualName("SAM   T")).toBe("sam t");
  });

  it("keeps guest requests out of confirmed and waiting casual buckets", () => {
    const result = buildSessionRsvpBuckets({
      capacity: { totalPlayers: 8, casualConfirmedSlots: 2, waitlistEnabled: true },
      regulars: [{ id: "r1", displayName: "Regular 1" }],
      casuals: [
        { id: "g1", displayName: "Guest One", response: "guest_requested", joinedAtMs: 1 },
        { id: "c1", displayName: "Known Casual", response: "casual_joined", joinedAtMs: 2 },
      ],
    });

    expect(result.casualsConfirmed.map((entry) => entry.displayName)).toEqual(["Known Casual"]);
    expect(result.casualsWaiting).toEqual([]);
  });
});
