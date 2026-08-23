import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  checkRateLimit: vi.fn(),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  getAdminDb: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  set: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("nodemailer", () => ({ default: { createTransport: mocks.createTransport } }));
vi.mock("@/server/auth/dal", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/server/firebase/admin", () => ({ getAdminDb: mocks.getAdminDb }));
vi.mock("@/server/result", async () => {
  const actual = await vi.importActual<typeof import("@/server/result")>("@/server/result");
  return { ...actual, checkRateLimit: mocks.checkRateLimit };
});

import { submitSupportRequest } from "./actions";

describe("submitSupportRequest", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("SUPPORT_SMTP_USER", "support@example.com");
    vi.stubEnv("SUPPORT_SMTP_APP_PASSWORD", "app-password");
    mocks.requireSession.mockResolvedValue({ uid: "user-1", email: "player@example.com", superAdmin: false, appAdminRole: null });
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    mocks.sendMail.mockResolvedValue(undefined);
    mocks.checkRateLimit.mockResolvedValue(undefined);
    mocks.doc.mockReturnValue({ id: "case-1", set: mocks.set });
    mocks.collection.mockReturnValue({ doc: mocks.doc });
    mocks.getAdminDb.mockReturnValue({ collection: mocks.collection });
    mocks.set.mockResolvedValue(undefined);
  });

  it("requires a signed-in user", async () => {
    mocks.requireSession.mockRejectedValue(new Error("Unauthenticated"));

    const result = await submitSupportRequest({ subject: "Help", message: "Something is not working." });

    expect(result).toEqual({ ok: false, code: "UNAUTHENTICATED", message: "You must be signed in to contact support." });
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it("validates subject and message lengths", async () => {
    const result = await submitSupportRequest({ subject: "Hi", message: "Short" });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it("silently accepts honeypot submissions", async () => {
    const result = await submitSupportRequest({ subject: "A valid subject", message: "A valid support message.", honeypot: "bot" });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it("creates a support case and sends a server-directed email using verified account details", async () => {
    const result = await submitSupportRequest({ subject: "Cannot score", message: "The score button is not saving my result." });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("support:user-1", { maxRequests: 3, windowMs: 3_600_000 });
    expect(mocks.collection).toHaveBeenCalledWith("_supportCases");
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({
      title: "Cannot score",
      status: "open",
      priority: "medium",
      targetType: "user",
      targetId: "user-1",
      note: "The score button is not saving my result.",
      source: "help_form",
      requesterEmail: "player@example.com",
      emailStatus: "pending",
    }));
    expect(mocks.createTransport).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "support@example.com", pass: "app-password" },
    });
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: "support@example.com",
      to: "sanju36@gmail.com",
      replyTo: "player@example.com",
      subject: "[DuoRally Support] Cannot score",
      text: expect.stringContaining("Case ID: case-1"),
    }));
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ emailStatus: "sent" }), { merge: true });
  });

  it("does not rate-limit super admins while testing support", async () => {
    mocks.requireSession.mockResolvedValue({ uid: "admin-1", email: "admin@example.com", superAdmin: true, appAdminRole: "admin" });

    const result = await submitSupportRequest({ subject: "Testing support", message: "This should create a case without hitting the user rate limit." });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({
      targetId: "admin-1",
      requesterEmail: "admin@example.com",
    }));
  });

  it("returns a friendly response when the hourly limit is reached", async () => {
    mocks.checkRateLimit.mockRejectedValue(Object.assign(new Error("Too many requests"), { code: "RESOURCE_EXHAUSTED" }));

    const result = await submitSupportRequest({ subject: "Cannot score", message: "The score button is not saving my result." });

    expect(result).toEqual({ ok: false, code: "RESOURCE_EXHAUSTED", message: "Please wait before sending another support request." });
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(mocks.collection).not.toHaveBeenCalled();
  });
});
