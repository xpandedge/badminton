import { describe, it, expect } from "vitest";
import {
  resolveGroupRole,
  type GroupMember,
  canManageTeamOwners,
  canManageSquad,
  canManageGroup,
  canDeleteSession,
  canCreateSession,
  canGenerateSchedule,
  canRebalanceSession,
  canEnterScore,
  canManageSessionPlayers,
  canAdvanceRound,
} from "./roles.js";

const members: GroupMember[] = [
  { userId: "u-owner", role: "owner" },
  { userId: "u-org", role: "organiser" },
  { userId: "u-mem", role: "member" },
];

describe("resolveGroupRole", () => {
  it("returns the role for a known member", () => {
    expect(resolveGroupRole(members, "u-owner")).toBe("owner");
    expect(resolveGroupRole(members, "u-org")).toBe("organiser");
    expect(resolveGroupRole(members, "u-mem")).toBe("member");
  });

  it("returns null for a non-member", () => {
    expect(resolveGroupRole(members, "stranger")).toBeNull();
  });

  it("returns null for an empty member list", () => {
    expect(resolveGroupRole([], "u-owner")).toBeNull();
  });
});

describe("permission predicates (D8 simplified: owner | member)", () => {
  it("allows configured super admins to manage team owners", () => {
    expect(canManageTeamOwners("pankaj4bharat@gmail.com")).toBe(true);
    expect(canManageTeamOwners("sanju36@gmail.com")).toBe(true);
    expect(canManageTeamOwners("Pankaj4Bharat@gmail.com")).toBe(true);
    expect(canManageTeamOwners("member@example.com")).toBe(false);
    expect(canManageTeamOwners(null)).toBe(false);
  });

  it("owner-only capabilities", () => {
    for (const fn of [canManageSquad, canManageGroup, canDeleteSession]) {
      expect(fn("owner")).toBe(true);
      expect(fn("organiser")).toBe(false);
      expect(fn("member")).toBe(false);
      expect(fn(null)).toBe(false);
    }
  });

  it("any member can create/generate/score/rebalance/advance (D8)", () => {
    const anyMemberFns = [
      canCreateSession,
      canGenerateSchedule,
      canRebalanceSession,
      canEnterScore,
      canManageSessionPlayers,
      canAdvanceRound,
    ];
    for (const fn of anyMemberFns) {
      expect(fn("owner")).toBe(true);
      expect(fn("organiser")).toBe(true); // legacy Firestore value → treated as member
      expect(fn("member")).toBe(true);
      expect(fn(null)).toBe(false);
    }
  });
});
