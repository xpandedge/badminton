import { describe, expect, it } from "vitest";
import { planRsvpSessionPlayerUpdates } from "./rsvp-session-players";

const regular = (id: string, name: string, squadRating?: number) => ({
  id,
  displayName: name,
  playerKind: "regular" as const,
  ...(squadRating === undefined ? {} : { squadRating }),
});

describe("RSVP session-player planner", () => {
  const capacity = { totalPlayers: 3, casualConfirmedSlots: 1, waitlistEnabled: true };

  it("activates confirmed regulars and leaves an explicit-away player out", () => {
    const plan = planRsvpSessionPlayerUpdates({
      status: "scheduled",
      capacity: { totalPlayers: 2, casualConfirmedSlots: 1, waitlistEnabled: true },
      groupPlayers: [regular("regular-1", "Alex"), regular("regular-2", "Bea")],
      rsvps: [{ id: "regular-1", response: "away" }],
      sessionPlayers: [{ id: "regular-1", status: "active" }],
      changedRsvp: { playerId: "regular-1", response: "away" },
    });

    expect(plan.active).toEqual([
      expect.objectContaining({ playerId: "regular-2", status: "active" }),
    ]);
    expect(plan.leftPlayerIds).toEqual(["regular-1"]);
  });

  it("keeps a waiting casual out of active players and promotes the first confirmed casual", () => {
    const plan = planRsvpSessionPlayerUpdates({
      status: "scheduled",
      capacity: { totalPlayers: 2, casualConfirmedSlots: 1, waitlistEnabled: true },
      groupPlayers: [regular("regular-1", "Alex")],
      rsvps: [
        { id: "guest-a", response: "casual_joined", participantType: "public_casual", displayName: "Casey", createdAtMs: 1 },
        { id: "guest-b", response: "casual_joined", participantType: "public_casual", displayName: "Drew", createdAtMs: 2 },
      ],
      sessionPlayers: [{ id: "guest-b", status: "active" }],
      changedRsvp: { playerId: "guest-a", response: "casual_joined" },
    });

    expect(plan.active.map((entry) => entry.playerId)).toContain("guest-a");
    expect(plan.waitingPlayerIds).toContain("guest-b");
  });

  it("does not produce automatic roster updates for active or paused sessions", () => {
    for (const status of ["active", "paused"]) {
      expect(planRsvpSessionPlayerUpdates({
        status,
        capacity: { totalPlayers: 4, casualConfirmedSlots: 1, waitlistEnabled: true },
        groupPlayers: [regular("regular-1", "Alex")],
        rsvps: [],
        sessionPlayers: [],
        changedRsvp: { playerId: "regular-1", response: "in" },
      })).toEqual({ active: [], waitingPlayerIds: [], leftPlayerIds: [] });
    }
  });

  it("retains an existing player's identity in the active plan for merge updates", () => {
    const plan = planRsvpSessionPlayerUpdates({
      status: "draft",
      capacity: { totalPlayers: 4, casualConfirmedSlots: 1, waitlistEnabled: true },
      groupPlayers: [regular("regular-1", "Alex")],
      rsvps: [{ id: "regular-1", response: "in" }],
      sessionPlayers: [{ id: "regular-1", status: "left" }],
      changedRsvp: { playerId: "regular-1", response: "in" },
    });

    expect(plan.active[0]).toEqual(expect.objectContaining({ playerId: "regular-1", displayName: "Alex" }));
  });

  it("copies regular player squad ratings into session player updates", () => {
    const plan = planRsvpSessionPlayerUpdates({
      status: "draft",
      capacity: { totalPlayers: 4, casualConfirmedSlots: 1, waitlistEnabled: true },
      groupPlayers: [regular("regular-1", "Alex", 1185)],
      rsvps: [{ id: "regular-1", response: "in" }],
      sessionPlayers: [],
      changedRsvp: { playerId: "regular-1", response: "in" },
    });

    expect(plan.active[0]).toEqual(expect.objectContaining({
      playerId: "regular-1",
      squadRating: 1185,
    }));
  });

  it("does not undo an admin removal when another RSVP changes", () => {
    const plan = planRsvpSessionPlayerUpdates({
      status: "scheduled",
      capacity: { totalPlayers: 4, casualConfirmedSlots: 1, waitlistEnabled: true },
      groupPlayers: [regular("regular-1", "Alex"), regular("regular-2", "Bea")],
      rsvps: [],
      sessionPlayers: [{ id: "regular-1", status: "removed" }],
      changedRsvp: { playerId: "regular-2", response: "in" },
    });

    expect(plan.active.map((entry) => entry.playerId)).toEqual(["regular-2"]);
  });
});
