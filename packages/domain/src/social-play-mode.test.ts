import { describe, expect, it } from "vitest";
import {
  parseSocialPlayMode,
  requiresGuestGenderForSocialPlayMode,
  SOCIAL_PLAY_MODE_LABELS,
  SOCIAL_PLAY_MODES,
} from "./social-play-mode.js";

describe("social play mode", () => {
  it("defines random and mixed games labels", () => {
    expect(SOCIAL_PLAY_MODES).toEqual(["random", "mixed_games"]);
    expect(SOCIAL_PLAY_MODE_LABELS).toEqual({
      random: "Random",
      mixed_games: "Mixed games",
    });
  });

  it("parses only supported social play modes", () => {
    expect(parseSocialPlayMode("random")).toBe("random");
    expect(parseSocialPlayMode("mixed_games")).toBe("mixed_games");
    expect(parseSocialPlayMode("anything_else")).toBeNull();
    expect(parseSocialPlayMode(undefined)).toBeNull();
  });

  it("requires guest gender unless the session is explicitly random", () => {
    expect(requiresGuestGenderForSocialPlayMode("random")).toBe(false);
    expect(requiresGuestGenderForSocialPlayMode("mixed_games")).toBe(true);
    expect(requiresGuestGenderForSocialPlayMode(undefined)).toBe(true);
  });
});
