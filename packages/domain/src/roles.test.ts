import { describe, expect, it } from "vitest";
import {
  canAddGroupMember,
  canAdvanceRound,
  canCorrectCompletedScore,
  canCreateSession,
  canDeleteGroup,
  canDeleteSession,
  canEnterScore,
  canGenerateSchedule,
  canLeaveGroup,
  canManageAdmins,
  canManageGroup,
  canManageMembers,
  canManageSessionPlayers,
  canManageTeamOwners,
  canRebalanceSession,
  canRemoveGroupMember,
  canTransferOwnership,
  groupRoleLabel,
  normalizeGroupRole,
  resolveGroupRole,
  type GroupMember,
  type GroupRole,
} from "./roles.js";

const members: GroupMember[] = [
  { userId: "u-owner", role: "owner" },
  { userId: "u-admin", role: "admin" },
  { userId: "u-legacy", role: "organiser" },
  { userId: "u-member", role: "member" },
];

const roles: Array<GroupRole | null> = ["owner", "admin", "organiser", "member", null];

describe("group roles", () => {
  it("resolves stored roles and returns null for non-members", () => {
    expect(resolveGroupRole(members, "u-owner")).toBe("owner");
    expect(resolveGroupRole(members, "u-admin")).toBe("admin");
    expect(resolveGroupRole(members, "u-legacy")).toBe("organiser");
    expect(resolveGroupRole(members, "u-member")).toBe("member");
    expect(resolveGroupRole(members, "stranger")).toBeNull();
  });

  it("normalises legacy organiser records to admin for display", () => {
    expect(normalizeGroupRole("organiser")).toBe("admin");
    expect(normalizeGroupRole("admin")).toBe("admin");
    expect(groupRoleLabel("organiser")).toBe("Admin");
    expect(groupRoleLabel("owner")).toBe("Owner");
    expect(groupRoleLabel(null)).toBeNull();
  });
});

describe("permission matrix", () => {
  it("allows configured super admins to manage team owners", () => {
    expect(canManageTeamOwners("pankaj4bharat@gmail.com")).toBe(true);
    expect(canManageTeamOwners("sanju36@gmail.com")).toBe(true);
    expect(canManageTeamOwners("Pankaj4Bharat@gmail.com")).toBe(true);
    expect(canManageTeamOwners("member@example.com")).toBe(false);
    expect(canManageTeamOwners(null)).toBe(false);
  });

  it("keeps ownership capabilities owner-only", () => {
    for (const fn of [canManageAdmins, canDeleteGroup, canTransferOwnership]) {
      for (const role of roles) {
        expect(fn(role), `${fn.name}(${role})`).toBe(role === "owner");
      }
    }
  });

  it("allows owners, admins, and legacy organisers to administer groups and sessions", () => {
    const adminFns = [
      canManageGroup,
      canManageMembers,
      canCreateSession,
      canGenerateSchedule,
      canRebalanceSession,
      canManageSessionPlayers,
      canAdvanceRound,
      canDeleteSession,
    ];

    for (const fn of adminFns) {
      for (const role of roles) {
        expect(fn(role), `${fn.name}(${role})`).toBe(
          role === "owner" || role === "admin" || role === "organiser",
        );
      }
    }
  });

  it("allows every group member to enter scores", () => {
    expect(canEnterScore("owner")).toBe(true);
    expect(canEnterScore("admin")).toBe(true);
    expect(canEnterScore("organiser")).toBe(true);
    expect(canEnterScore("member")).toBe(true);
    expect(canEnterScore(null)).toBe(false);
  });

  it("lets owners correct scores after a session ends, but limits other admins to live sessions", () => {
    expect(canCorrectCompletedScore("owner", "completed")).toBe(true);
    expect(canCorrectCompletedScore("owner", "active")).toBe(true);
    expect(canCorrectCompletedScore("owner", "cancelled")).toBe(false);
    expect(canCorrectCompletedScore("admin", "active")).toBe(true);
    expect(canCorrectCompletedScore("organiser", "paused")).toBe(true);
    expect(canCorrectCompletedScore("admin", "completed")).toBe(false);
    expect(canCorrectCompletedScore("member", "active")).toBe(false);
    expect(canCorrectCompletedScore(null, "completed")).toBe(false);
  });

  it("lets admins add regular members but reserves admin assignment for the owner", () => {
    expect(canAddGroupMember("owner", "admin")).toBe(true);
    expect(canAddGroupMember("owner", "member")).toBe(true);
    expect(canAddGroupMember("admin", "member")).toBe(true);
    expect(canAddGroupMember("organiser", "member")).toBe(true);
    expect(canAddGroupMember("admin", "admin")).toBe(false);
    expect(canAddGroupMember("member", "member")).toBe(false);
  });

  it("prevents admins removing owners or other admins", () => {
    expect(canRemoveGroupMember("owner", "admin")).toBe(true);
    expect(canRemoveGroupMember("owner", "organiser")).toBe(true);
    expect(canRemoveGroupMember("owner", "member")).toBe(true);
    expect(canRemoveGroupMember("owner", "owner")).toBe(false);
    expect(canRemoveGroupMember("admin", "member")).toBe(true);
    expect(canRemoveGroupMember("organiser", "member")).toBe(true);
    expect(canRemoveGroupMember("admin", "admin")).toBe(false);
    expect(canRemoveGroupMember("admin", "organiser")).toBe(false);
    expect(canRemoveGroupMember("admin", "owner")).toBe(false);
    expect(canRemoveGroupMember("member", "member")).toBe(false);
  });

  it("lets non-owner members leave their own group", () => {
    expect(canLeaveGroup("admin")).toBe(true);
    expect(canLeaveGroup("organiser")).toBe(true);
    expect(canLeaveGroup("member")).toBe(true);
    expect(canLeaveGroup("owner")).toBe(false);
    expect(canLeaveGroup(null)).toBe(false);
  });
});
