import { describe, it, expect } from "vitest";
import { buildRound } from "./round.js";
import { createInitialState } from "./state.js";
import { seededOrder } from "./rng.js";
import type { EnginePlayer, EngineCourt } from "./types.js";

// Continuous per-court scheduling: buildRound is called once with ALL active
// courts to seed a session, then repeatedly with just the court(s) that freed
// up, as they free up asynchronously — never in a per-court sequential loop
// over the *same* snapshot of idle players (that would double-count sit-outs
// for players who never actually sat out; see plan review).

function players(n: number): EnginePlayer[] {
  return Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, displayName: `p${i}`, skillLevel: "unknown" as const }));
}
function courts(n: number): EngineCourt[] {
  return Array.from({ length: n }, (_, i) => ({ courtId: `c${i}`, name: `Court ${i + 1}`, courtNumber: i + 1 }));
}
const ids = (ps: EnginePlayer[]) => ps.map((p) => p.playerId);
const byId = (ps: EnginePlayer[]) => new Map(ps.map((p) => [p.playerId, p] as const));

function partnerKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function countPartnerRepeats(matches: Array<{ teamA: [string, string]; teamB: [string, string] }>): number {
  const counts = new Map<string, number>();
  for (const match of matches) {
    for (const team of [match.teamA, match.teamB]) {
      const key = partnerKey(team[0], team[1]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
}

function playersIn(match: { teamA: [string, string]; teamB: [string, string] }): [string, string, string, string] {
  return [...match.teamA, ...match.teamB] as [string, string, string, string];
}

describe("continuous per-court scheduling", () => {
  it("joint seed of all courts sits out only the true overflow, once each", () => {
    // 14 players, 3 courts (12 slots) -> exactly 2 must sit at seed time.
    const all = players(14);
    const state = createInitialState(all);
    const order = seededOrder(ids(all), 1);

    const seed = buildRound(state, all, courts(3), 1, order);

    expect(seed.matches.length).toBe(3);
    expect(seed.sitOuts.length).toBe(2);
    for (const id of ids(all)) {
      // Nobody has sat out more than once, and nobody who played has sat out at all.
      expect(state.sitOuts.get(id) ?? 0).toBeLessThanOrEqual(1);
    }
    const sitOutIds = new Set(seed.sitOuts.map((s) => s.playerId));
    for (const id of ids(all)) {
      expect(state.sitOuts.get(id) ?? 0).toBe(sitOutIds.has(id) ? 1 : 0);
    }
  });

  it("asynchronous single-court fills respect the hard sit-out shield across a mixed idle pool", () => {
    // 10 players, 2 courts (8 slots) -> 2 sit out at seed.
    const all = players(10);
    const map = byId(all);
    const cs = courts(2);
    const state = createInitialState(all);
    const order = seededOrder(ids(all), 7);
    let cycle = 1;

    const seed = buildRound(state, all, cs, cycle, order);
    expect(seed.matches.length).toBe(2);
    const seededSitters = new Set(seed.sitOuts.map((s) => s.playerId));
    expect(seededSitters.size).toBe(2);

    // Court A "finishes first" (before court B). Idle pool = that court's 4
    // players + the 2 who were already sitting — NOT a clean synchronized wave.
    const courtAMatch = seed.matches.find((m) => m.courtId === cs[0]!.courtId)!;
    const courtAPlayers = [...courtAMatch.teamA, ...courtAMatch.teamB];
    cycle += 1;
    const idlePoolIds = [...courtAPlayers, ...seededSitters];
    const idlePlayers = idlePoolIds.map((id) => map.get(id)!);

    const fillA = buildRound(state, idlePlayers, [cs[0]!], cycle, order);
    expect(fillA.matches.length).toBe(1);
    expect(fillA.sitOuts.length).toBe(2);

    // The hard shield must promote the 2 who already sat out ahead of the 4
    // who just finished playing: nobody who just sat out cycle 1 sits again now.
    const newSitters = new Set(fillA.sitOuts.map((s) => s.playerId));
    for (const id of seededSitters) {
      expect(newSitters.has(id)).toBe(false);
    }

    // Court B (untouched this whole time) is unaffected — its match still stands.
    const courtBMatch = seed.matches.find((m) => m.courtId === cs[1]!.courtId)!;
    expect(state.lastPlayedRound.get(courtBMatch.teamA[0])).toBe(1);

    // Nobody has sat out twice yet (2 sequential decisions, hard shield engaged).
    for (const id of ids(all)) {
      expect(state.sitOuts.get(id) ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it("sit-out spread stays bounded over many asynchronous single-court cycles", () => {
    // 9 players, 2 courts (8 slots) -> always exactly 1 sitting; simulate courts
    // finishing one at a time, in a fixed rotation, for many cycles.
    const all = players(9);
    const map = byId(all);
    const cs = courts(2);
    const state = createInitialState(all);
    const order = seededOrder(ids(all), 3);

    let cycle = 1;
    const seed = buildRound(state, all, cs, cycle, order);
    // 9 players, 2 courts of 4 = 8 slots -> 1 sits.
    expect(seed.sitOuts.length).toBe(1);

    let onCourt: Record<string, [string, string, string, string]> = {};
    for (const m of seed.matches) onCourt[m.courtId] = [...m.teamA, ...m.teamB] as any;
    let waiting = seed.sitOuts.map((s) => s.playerId);

    for (let i = 0; i < 20; i++) {
      const courtId = cs[i % 2]!.courtId;
      const freed = onCourt[courtId]!;
      cycle += 1;
      const idleIds = [...freed, ...waiting];
      const idlePlayers = idleIds.map((id) => map.get(id)!);
      const res = buildRound(state, idlePlayers, [cs.find((c) => c.courtId === courtId)!], cycle, order);
      expect(res.matches.length).toBe(1);
      const four = [...res.matches[0]!.teamA, ...res.matches[0]!.teamB];
      onCourt[courtId] = four as any;
      waiting = res.sitOuts.map((s) => s.playerId);
      expect(waiting.length).toBe(1);
    }

    const counts = ids(all).map((id) => state.sitOuts.get(id) ?? 0);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("keeps partner repeats low during an ordinary 10-player two-court social night", () => {
    const all = players(10);
    const map = byId(all);
    const cs = courts(2);
    const state = createInitialState(all);
    const order = seededOrder(ids(all), 11);
    const played: Array<{ teamA: [string, string]; teamB: [string, string] }> = [];

    let cycle = 1;
    const seed = buildRound(state, all, cs, cycle, order);
    for (const match of seed.matches) played.push({ teamA: match.teamA, teamB: match.teamB });

    const onCourt: Record<string, [string, string, string, string]> = {};
    for (const match of seed.matches) onCourt[match.courtId] = playersIn(match);
    let waiting = seed.sitOuts.map((s) => s.playerId);

    for (let i = 0; i < 16; i++) {
      const court = cs[i % cs.length]!;
      const idleIds = [...onCourt[court.courtId]!, ...waiting];
      cycle += 1;
      const next = buildRound(state, idleIds.map((id) => map.get(id)!), [court], cycle, order);
      expect(next.matches.length).toBe(1);
      for (const match of next.matches) played.push({ teamA: match.teamA, teamB: match.teamB });
      onCourt[court.courtId] = playersIn(next.matches[0]!);
      waiting = next.sitOuts.map((s) => s.playerId);
      expect(waiting.length).toBe(2);
    }

    const sitCounts = ids(all).map((id) => state.sitOuts.get(id) ?? 0);
    const gameCounts = ids(all).map((id) => state.gamesPlayed.get(id) ?? 0);
    expect(Math.max(...sitCounts) - Math.min(...sitCounts)).toBeLessThanOrEqual(1);
    expect(Math.max(...gameCounts) - Math.min(...gameCounts)).toBeLessThanOrEqual(1);
    expect(countPartnerRepeats(played)).toBeLessThanOrEqual(played.length / 3);
  });

  it("keeps sit-outs bounded while mixing a 14-player three-court session", () => {
    const all = players(14);
    const map = byId(all);
    const cs = courts(3);
    const state = createInitialState(all);
    const order = seededOrder(ids(all), 19);

    let cycle = 1;
    const seed = buildRound(state, all, cs, cycle, order);
    const onCourt: Record<string, [string, string, string, string]> = {};
    for (const match of seed.matches) onCourt[match.courtId] = playersIn(match);
    let waiting = seed.sitOuts.map((s) => s.playerId);

    for (let i = 0; i < 24; i++) {
      const court = cs[i % cs.length]!;
      const idleIds = [...onCourt[court.courtId]!, ...waiting];
      cycle += 1;
      const next = buildRound(state, idleIds.map((id) => map.get(id)!), [court], cycle, order);
      expect(next.matches.length).toBe(1);
      onCourt[court.courtId] = playersIn(next.matches[0]!);
      waiting = next.sitOuts.map((s) => s.playerId);
      expect(waiting.length).toBe(2);
    }

    const sitCounts = ids(all).map((id) => state.sitOuts.get(id) ?? 0);
    const gameCounts = ids(all).map((id) => state.gamesPlayed.get(id) ?? 0);
    expect(Math.max(...sitCounts) - Math.min(...sitCounts)).toBeLessThanOrEqual(1);
    expect(Math.max(...gameCounts) - Math.min(...gameCounts)).toBeLessThanOrEqual(2);
  });
});
