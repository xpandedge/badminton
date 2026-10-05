import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const harness = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), user: { uid: "owner" } as { uid: string } | null, rates: vi.fn(), board: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1" }) }));
vi.mock("@/server/auth/dal", () => ({ requireSession: async () => { if (!harness.user) throw new Error("signed out"); return harness.user; } }));
vi.mock("@/server/sessions/board", () => ({ getBoardData: harness.board }));
vi.mock("@/server/result", () => ({ ok: (data?: unknown) => ({ ok: true, data }), err: (code: string, message: string) => ({ ok: false, code, message }), checkRateLimit: harness.rates }));
vi.mock("@/server/firebase/admin", () => {
  const doc = (path: string) => ({ path, get: async () => ({ exists: harness.docs.has(path), data: () => harness.docs.get(path) }), set: async (data: Record<string, unknown>) => { harness.docs.set(path, data); } });
  return { getAdminDb: () => ({
    doc,
    collection: () => ({ where: (_field: string, _op: string, value: string) => ({ limit: () => ({ get: async () => ({ docs: [...harness.docs.entries()].filter(([path, data]) => /^sessions\/[^/]+$/.test(path) && data.scoreCode === value).map(([path, data]) => ({ id: path.split("/")[1], data: () => data })) }) }) }) }),
    runTransaction: async (callback: (t: unknown) => unknown) => callback({
      get: (ref: ReturnType<typeof doc>) => ref.get(),
      set: (ref: ReturnType<typeof doc>, data: Record<string, unknown>) => { harness.docs.set(ref.path, data); },
      update: (ref: ReturnType<typeof doc>, data: Record<string, unknown>) => { harness.docs.set(ref.path, { ...harness.docs.get(ref.path), ...data }); },
    }),
  }) };
});
import { beginTvPairing, claimTvPairing, createCastDisplay, readTvDisplay } from "./actions";

beforeEach(() => {
  harness.docs.clear(); harness.user = { uid: "owner" }; harness.rates.mockReset(); harness.board.mockReset();
  harness.docs.set("sessions/session1", { groupId: "group1", scoreCode: "ABC123", boardEnabled: true });
  harness.docs.set("groups/group1/members/owner", { role: "owner" });
  harness.board.mockResolvedValue({ ok: true, data: { sessionId: "session1", matches: [] } });
});
describe("TV display authorization", () => {
  it("creates a hashed pending token, claims once, and returns only board data", async () => {
    const pairing = await beginTvPairing();
    expect(pairing.ok).toBe(true); if (!pairing.ok) return;
    const { token, pairCode } = pairing.data;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify([...harness.docs.values()])).not.toContain(token);
    expect(await readTvDisplay(token)).toEqual({ ok: true, data: null });
    expect((await claimTvPairing("ABC123", pairCode)).ok).toBe(true);
    expect((await claimTvPairing("ABC123", pairCode)).ok).toBe(false);
    expect(await readTvDisplay(token)).toEqual({ ok: true, data: { sessionId: "session1", matches: [] } });
  });
  it("rejects signed-out users and ordinary members", async () => {
    harness.user = null;
    expect(await createCastDisplay("ABC123")).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    harness.user = { uid: "owner" };
    harness.docs.set("groups/group1/members/owner", { role: "member" });
    expect(await createCastDisplay("ABC123")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await claimTvPairing("ABC123", "AABBCCDD")).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
  it("rejects expired grants and clears access when the board is disabled", async () => {
    const result = await createCastDisplay("ABC123"); if (!result.ok) throw new Error("grant failed");
    harness.docs.set("sessions/session1", { scoreCode: "ABC123", boardEnabled: false });
    expect(await readTvDisplay(result.data.token)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    const path = `tvDisplays/${createHash("sha256").update(result.data.token).digest("hex")}`;
    harness.docs.set(path, { sessionId: "session1", expiresAt: 0 });
    expect(await readTvDisplay(result.data.token)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(harness.board).not.toHaveBeenCalled();
  });
  it("does not claim an expired challenge or accept a short token", async () => {
    harness.docs.set("tvPairCodes/AABBCCDD", { expiresAt: 0, tokenHash: "hash" });
    expect(await claimTvPairing("ABC123", "AABBCCDD")).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await readTvDisplay("ABC123")).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});
