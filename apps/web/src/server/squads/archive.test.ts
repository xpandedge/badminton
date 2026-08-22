import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SQUAD_ARCHIVE_RETENTION_MS } from "@picklebaddies/domain";

const mocks = vi.hoisted(() => ({
  getAdminDb: vi.fn(),
  getAdminAuth: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("@/server/firebase/admin", () => ({
  getAdminDb: mocks.getAdminDb,
  getAdminAuth: mocks.getAdminAuth,
}));

vi.mock("@/server/auth/dal", () => ({
  requireSession: mocks.requireSession,
}));

import { archiveSquad, requireActiveSquad, restoreSquad } from "./actions";

type Snapshot = {
  exists: boolean;
  data: () => Record<string, unknown>;
};

function makeHarness({
  groupExists = true,
  groupData = {},
  memberExists = true,
  role = "owner",
}: {
  groupExists?: boolean;
  groupData?: Record<string, unknown>;
  memberExists?: boolean;
  role?: string;
} = {}) {
  const groupSnapshot: Snapshot = {
    exists: groupExists,
    data: () => groupData,
  };
  const memberSnapshot: Snapshot = {
    exists: memberExists,
    data: () => ({ role }),
  };
  const groupRef = {
    get: vi.fn(async () => groupSnapshot),
    update: vi.fn(async () => undefined),
  };
  const memberRef = {
    get: vi.fn(async () => memberSnapshot),
  };
  const db = {
    doc: vi.fn((path: string) => {
      if (path === "groups/squad-1") return groupRef;
      if (path === "groups/squad-1/members/owner-1") return memberRef;
      throw new Error(`Unexpected document path: ${path}`);
    }),
  };

  return {
    db: db as unknown as FirebaseFirestore.Firestore,
    groupRef,
    memberRef,
  };
}

describe("squad archive actions", () => {
  const now = 1_750_000_000_000;

  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    mocks.requireSession.mockResolvedValue({ uid: "owner-1", email: "owner@example.com" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mocks.getAdminDb.mockReset();
    mocks.getAdminAuth.mockReset();
    mocks.requireSession.mockReset();
  });

  it("archives an active squad for exactly two days when called by its owner", async () => {
    const harness = makeHarness();
    mocks.getAdminDb.mockReturnValue(harness.db);

    const result = await archiveSquad("squad-1");

    expect(result).toEqual({ ok: true, data: { purgeAfter: now + SQUAD_ARCHIVE_RETENTION_MS } });
    expect(harness.groupRef.update).toHaveBeenCalledWith(expect.objectContaining({
      archivedAt: expect.anything(),
      purgeAfter: expect.objectContaining({ toMillis: expect.any(Function) }),
      archivedBy: "owner-1",
    }));
    const updateCalls = harness.groupRef.update.mock.calls as unknown as Array<[
      { purgeAfter: { toMillis: () => number } },
    ]>;
    const update = updateCalls[0]![0];
    expect(update.purgeAfter.toMillis()).toBe(now + SQUAD_ARCHIVE_RETENTION_MS);
  });

  it("rejects non-owners and does not write archive metadata", async () => {
    const harness = makeHarness({ role: "admin" });
    mocks.getAdminDb.mockReturnValue(harness.db);

    const result = await archiveSquad("squad-1");

    expect(result).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "Only the squad owner can archive this squad",
    });
    expect(harness.groupRef.update).not.toHaveBeenCalled();
  });

  it("rejects missing and already archived squads", async () => {
    const missing = makeHarness({ groupExists: false });
    mocks.getAdminDb.mockReturnValue(missing.db);
    await expect(archiveSquad("squad-1")).resolves.toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });

    const archived = makeHarness({ groupData: { archivedAt: now - 1000, purgeAfter: now + 1000 } });
    mocks.getAdminDb.mockReturnValue(archived.db);
    await expect(archiveSquad("squad-1")).resolves.toMatchObject({
      ok: false,
      code: "FAILED_PRECONDITION",
    });
    expect(archived.groupRef.update).not.toHaveBeenCalled();
  });

  it("restores an archived squad for the current owner before expiry", async () => {
    const harness = makeHarness({
      groupData: { archivedAt: now - 1000, purgeAfter: now + 1000 },
    });
    mocks.getAdminDb.mockReturnValue(harness.db);

    const result = await restoreSquad("squad-1");

    expect(result).toEqual({ ok: true, data: undefined });
    expect(harness.groupRef.update).toHaveBeenCalledWith(expect.objectContaining({
      archivedAt: expect.anything(),
      purgeAfter: expect.anything(),
      archivedBy: expect.anything(),
    }));
  });

  it("allows the transferred owner to restore, but rejects expiry", async () => {
    const transferredOwner = makeHarness({
      groupData: { archivedAt: now - 1000, purgeAfter: now + 1000, archivedBy: "former-owner" },
      role: "owner",
    });
    mocks.getAdminDb.mockReturnValue(transferredOwner.db);
    await expect(restoreSquad("squad-1")).resolves.toMatchObject({ ok: true });

    const expired = makeHarness({
      groupData: { archivedAt: now - SQUAD_ARCHIVE_RETENTION_MS, purgeAfter: now },
    });
    mocks.getAdminDb.mockReturnValue(expired.db);
    await expect(restoreSquad("squad-1")).resolves.toMatchObject({
      ok: false,
      code: "FAILED_PRECONDITION",
    });
    expect(expired.groupRef.update).not.toHaveBeenCalled();
  });

  it("returns a failed precondition from the reusable guard for archived squads", async () => {
    const harness = makeHarness({ groupData: { archivedAt: now - 1 } });
    const result = await requireActiveSquad(harness.db, "squad-1", "owner-1");

    expect(result).toEqual({
      ok: false,
      code: "FAILED_PRECONDITION",
      message: "This squad is archived and read-only",
    });
  });
});
