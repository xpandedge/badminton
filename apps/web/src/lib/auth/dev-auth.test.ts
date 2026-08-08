import { describe, it, expect, afterEach, vi } from "vitest";
import { DEV_USERS, isDevAuthEnabled } from "./dev-auth";

// vi.stubEnv is type-safe and handles NODE_ENV (which is readonly in ProcessEnv).
afterEach(() => { vi.unstubAllEnvs(); });

describe("DEV_USERS roster", () => {
  it("has 4 dummy users with unique emails and dev.local domain", () => {
    expect(DEV_USERS).toHaveLength(4);
    const emails = DEV_USERS.map((u) => u.email);
    expect(new Set(emails).size).toBe(4);
    expect(emails.every((e) => e.endsWith("@dev.local"))).toBe(true);
    expect(DEV_USERS.map((u) => u.key)).toEqual(["alice", "bob", "carol", "dave"]);
  });
});

describe("isDevAuthEnabled gate", () => {
  it("true only when flag + emulators on and not production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_DEV_AUTH", "true");
    vi.stubEnv("NEXT_PUBLIC_USE_EMULATORS", "true");
    expect(isDevAuthEnabled()).toBe(true);
  });
  it("false in production even if flags on", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DEV_AUTH", "true");
    vi.stubEnv("NEXT_PUBLIC_USE_EMULATORS", "true");
    expect(isDevAuthEnabled()).toBe(false);
  });
  it("false when emulators flag missing", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_DEV_AUTH", "true");
    vi.stubEnv("NEXT_PUBLIC_USE_EMULATORS", "");
    expect(isDevAuthEnabled()).toBe(false);
  });
  it("false when dev-auth flag missing", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_DEV_AUTH", "");
    vi.stubEnv("NEXT_PUBLIC_USE_EMULATORS", "true");
    expect(isDevAuthEnabled()).toBe(false);
  });
});
