import { describe, expect, it } from "vitest";
import {
  PLAYER_GENDERS,
  PLAYER_GENDER_LABELS,
  isPlayerGender,
  parsePlayerGender,
} from "./player-gender.js";

describe("player gender", () => {
  it("exposes the approved stored values and labels", () => {
    expect(PLAYER_GENDERS).toEqual(["male", "female", "non_binary"]);
    expect(PLAYER_GENDER_LABELS).toEqual({
      male: "Male",
      female: "Female",
      non_binary: "Non-binary",
    });
  });

  it("accepts only approved gender values", () => {
    expect(isPlayerGender("male")).toBe(true);
    expect(isPlayerGender("female")).toBe(true);
    expect(isPlayerGender("non_binary")).toBe(true);
    expect(isPlayerGender("woman")).toBe(false);
    expect(isPlayerGender("")).toBe(false);
    expect(isPlayerGender(null)).toBe(false);
  });

  it("parses valid values and rejects invalid values", () => {
    expect(parsePlayerGender("male")).toBe("male");
    expect(parsePlayerGender("female")).toBe("female");
    expect(parsePlayerGender("non_binary")).toBe("non_binary");
    expect(parsePlayerGender(" prefer_not ")).toBeNull();
    expect(parsePlayerGender(undefined)).toBeNull();
  });
});
