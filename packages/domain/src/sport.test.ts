import { describe, it, expect } from "vitest";
import { SPORTS, getSportConfig, type Sport } from "./sport.js";

describe("SPORTS config", () => {
  it("has both sports defined", () => {
    expect(SPORTS.badminton).toBeDefined();
    expect(SPORTS.pickleball).toBeDefined();
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
  });

  it("Sport type accepts both values", () => {
    const sports: Sport[] = ["badminton", "pickleball"];
    expect(sports).toHaveLength(2);
  });
});
