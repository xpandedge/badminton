import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: { uid: "owner" } as { uid: string } | null,
  role: "owner", status: "active", writes: [] as Array<{ path: string; data: any }>,
}));
vi.mock("@/server/auth/dal", () => ({ requireSession: async () => h.user }));
vi.mock("./actions", () => ({ requireActiveSessionSquad: async () => ({ ok: true }) }));
vi.mock("@/server/result", () => ({ ok: (data: unknown) => ({ ok: true, data }), err: (code: string, message: string) => ({ ok: false, code, message }) }));
vi.mock("@/server/firebase/admin", () => {
  const doc = (path: string): any => ({ path, id: "new", collection: (name: string) => ({ doc: () => doc(`${path}/${name}/audit`) }) });
  return { getAdminDb: () => ({
    doc, collection: (path: string) => ({ doc: () => doc(`${path}/new`) }),
    runTransaction: async (callback: any) => callback({
      get: async (ref: any) => ({ exists: true, data: () => ref.path.startsWith("groups/") ? { role: h.role } : {
        groupId: "g", status: h.status,
        courts: [{ courtId: "old", name: "Court 1", courtNumber: 1, isActive: false }],
      } }),
      update: (ref: any, data: any) => h.writes.push({ path: ref.path, data }),
      set: (ref: any, data: any) => h.writes.push({ path: ref.path, data }),
    }),
  }) };
});
import { saveLiveCourt } from "./courts";

beforeEach(() => { h.user = { uid: "owner" }; h.role = "owner"; h.status = "active"; h.writes = []; });
describe("live court authorization and writes", () => {
  it("rejects signed-out users and ordinary members without writes", async () => {
    h.user = null;
    expect(await saveLiveCourt("s", { courtId: "old", isActive: true })).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    h.user = { uid: "owner" }; h.role = "member";
    expect(await saveLiveCourt("s", { courtId: "old", isActive: true })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(h.writes).toEqual([]);
  });
  it.each(["completed", "cancelled", "draft"])("rejects %s sessions", async status => {
    h.status = status;
    expect(await saveLiveCourt("s", { courtId: "old", isActive: true })).toMatchObject({ ok: false, code: "FAILED_PRECONDITION" });
    expect(h.writes).toEqual([]);
  });
  it("updates counts and audit only, preserving all match records", async () => {
    h.role = "admin"; h.status = "paused";
    expect(await saveLiveCourt("s", { name: "Court 2", courtNumber: 2 })).toMatchObject({ ok: true });
    expect(h.writes.map(w => w.path)).toEqual(["sessions/s", "sessions/s/auditLogs/audit"]);
    expect(h.writes[0]?.data.courtCount).toBe(1);
    expect(h.writes[0]?.data.courts).toHaveLength(2);
  });
  it("does not write invalid court changes", async () => {
    expect(await saveLiveCourt("s", { name: "Court 2", courtNumber: 1 })).toMatchObject({ ok: false, code: "INVALID_ARGUMENT" });
    expect(h.writes).toEqual([]);
  });
});
