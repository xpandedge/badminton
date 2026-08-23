import { describe, it, expect } from "vitest";
import { SPORT_OPTIONS, SPORTS, getSportConfig, isSport, type Sport } from "./sport.js";

describe("SPORTS config", () => {
  it("has supported sports defined", () => {
    expect(SPORT_OPTIONS).toEqual(["badminton", "pickleball", "squash", "table_tennis", "tennis"]);
    for (const sport of SPORT_OPTIONS) {
      expect(SPORTS[sport]).toBeDefined();
    }
  });

  it("badminton defaults", () => {
    const s = SPORTS.badminton;
    expect(s.label).toBe("Badminton");
    expect(s.defaultTargetScore).toBe(21);
    expect(s.defaultScoringMode).toBe("points");
    expect(s.terms.game).toBe("game");
    expect(s.terms.court).toBe("court");
  });

  it("pickleball defaults", () => {
    const s = SPORTS.pickleball;
    expect(s.label).toBe("Pickleball");
    expect(s.defaultTargetScore).toBe(11);
    expect(s.defaultScoringMode).toBe("points");
    expect(s.terms.game).toBe("game");
    expect(s.terms.court).toBe("court");
  });

  it("getSportConfig returns the right config", () => {
    expect(getSportConfig("badminton").defaultTargetScore).toBe(21);
    expect(getSportConfig("pickleball").defaultTargetScore).toBe(11);
    expect(getSportConfig("squash").label).toBe("Squash");
    expect(getSportConfig("table_tennis").label).toBe("Table tennis");
    expect(getSportConfig("tennis").label).toBe("Tennis");
  });

  it("Sport type accepts every supported value", () => {
    const sports: Sport[] = ["badminton", "pickleball", "squash", "table_tennis", "tennis"];
    expect(sports).toHaveLength(5);
  });

  it("checks sport values", () => {
    expect(isSport("tennis")).toBe(true);
    expect(isSport("football")).toBe(false);
  });
});
