import { describe, it, expect } from "vitest";
import { buildEngineInput } from "./engine";
import type { QuickPlayer, QuickSessionSetup } from "./types";

const setup: QuickSessionSetup = { name: "Test", courts: 2, rounds: 3 };
const players: QuickPlayer[] = [
  { id: "p1", name: "Alice", skillLevel: "intermediate" },
  { id: "p2", name: "Bob", skillLevel: "beginner" },
  { id: "p3", name: "Carol", skillLevel: "advanced" },
  { id: "p4", name: "Dave", skillLevel: "unknown" },
];

describe("buildEngineInput", () => {
  it("produces mode=initial with no locked matches", () => {
    const input = buildEngineInput(setup, players);
    expect(input.mode).toBe("initial");
    expect(input.lockedMatches).toEqual([]);
    expect(input.elapsedRounds).toBe(0);
  });

  it("encodes rounds count as sessionDurationMinutes=rounds*15, estimatedGameMinutes=15", () => {
    const input = buildEngineInput(setup, players);
    expect(input.sessionDurationMinutes).toBe(45); // 3 rounds * 15
    expect(input.estimatedGameMinutes).toBe(15);
  });

  it("synthesises courts from court count", () => {
    const input = buildEngineInput(setup, players);
    expect(input.courts).toHaveLength(2);
    expect(input.courts[0]).toMatchObject({ courtId: "court-1", name: "Court 1", courtNumber: 1 });
    expect(input.courts[1]).toMatchObject({ courtId: "court-2", name: "Court 2", courtNumber: 2 });
  });

  it("maps players with availableFromRound=1", () => {
    const input = buildEngineInput(setup, players);
    expect(input.players).toHaveLength(4);
    expect(input.players[0]).toMatchObject({
      playerId: "p1",
      displayName: "Alice",
      skillLevel: "intermediate",
      availableFromRound: 1,
    });
  });
});
