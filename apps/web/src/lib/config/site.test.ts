import { afterEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_ORIGIN, shareOrigin, shareUrl } from "./site";

function setWindowOrigin(url: string) {
  vi.stubGlobal("window", { location: new URL(url) });
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("shareOrigin", () => {
  it("rewrites the Firebase default domain to the branded one", () => {
    setWindowOrigin("https://picklebaddies-85732.web.app/sessions/abc");
    expect(shareOrigin()).toBe(CANONICAL_ORIGIN);
  });

  it("rewrites firebaseapp.com too", () => {
    setWindowOrigin("https://picklebaddies-85732.firebaseapp.com/");
    expect(shareOrigin()).toBe(CANONICAL_ORIGIN);
  });

  it("keeps the branded domain as-is", () => {
    setWindowOrigin("https://duorally.com.au/dashboard");
    expect(shareOrigin()).toBe("https://duorally.com.au");
  });

  it("leaves localhost alone so dev and e2e still work", () => {
    setWindowOrigin("http://localhost:3000/dashboard");
    expect(shareOrigin()).toBe("http://localhost:3000");
  });

  it("prefers an explicit NEXT_PUBLIC_SITE_URL and trims trailing slashes", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.duorally.com.au/";
    setWindowOrigin("https://picklebaddies-85732.web.app/");
    expect(shareOrigin()).toBe("https://staging.duorally.com.au");
  });

  it("falls back to the canonical origin during server render", () => {
    expect(shareOrigin()).toBe(CANONICAL_ORIGIN);
  });
});

describe("shareUrl", () => {
  it("joins a path onto the share origin", () => {
    setWindowOrigin("https://picklebaddies-85732.web.app/");
    expect(shareUrl("/board/ABC123")).toBe(`${CANONICAL_ORIGIN}/board/ABC123`);
  });

  it("tolerates a path without a leading slash", () => {
    setWindowOrigin("https://duorally.com.au/");
    expect(shareUrl("score/XYZ")).toBe("https://duorally.com.au/score/XYZ");
  });

  it("returns an empty string for an empty path", () => {
    expect(shareUrl("")).toBe("");
  });
});
