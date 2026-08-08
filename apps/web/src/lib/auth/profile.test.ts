import { describe, it, expect } from "vitest";
import { buildUserProfile } from "./profile.js";

describe("buildUserProfile", () => {
  it("maps a populated Firebase user to a profile doc", () => {
    const profile = buildUserProfile({
      displayName: "Ravi Kumar",
      email: "ravi@example.com",
      photoURL: "https://img/ravi.png",
    });
    expect(profile).toEqual({
      displayName: "Ravi Kumar",
      displayNameLower: "ravi kumar",
      email: "ravi@example.com",
      emailLower: "ravi@example.com",
      photoURL: "https://img/ravi.png",
    });
  });

  it("coerces missing fields to null / empty display name", () => {
    const profile = buildUserProfile({
      displayName: null,
      email: null,
      photoURL: null,
    });
    expect(profile).toEqual({ displayName: "", displayNameLower: "", email: null, emailLower: null, photoURL: null });
  });
});
