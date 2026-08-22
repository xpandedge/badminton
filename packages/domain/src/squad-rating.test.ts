import { describe, expect, it } from "vitest";
import {
  SQUAD_RATING_PROVISIONAL_GAMES,
  SQUAD_RATING_START,
  applyDoublesRatingResult,
  gradeFromSquadRating,
  isSquadGradeProvisional,
} from "./squad-rating.js";

describe("squad rating", () => {
  it("starts neutral at grade C and is provisional before 3 graded games", () => {
    expect(SQUAD_RATING_START).toBe(1000);
    expect(gradeFromSquadRating(SQUAD_RATING_START)).toBe("C");
    expect(SQUAD_RATING_PROVISIONAL_GAMES).toBe(3);
    expect(isSquadGradeProvisional(0)).toBe(true);
    expect(isSquadGradeProvisional(2)).toBe(true);
    expect(isSquadGradeProvisional(3)).toBe(false);
  });

  it("gives underdog winners a bigger gain than favourite winners", () => {
    const underdog = applyDoublesRatingResult({
      teamARatings: [920, 940],
      teamBRatings: [1100, 1120],
      winnerTeam: "A",
    });
    const favourite = applyDoublesRatingResult({
      teamARatings: [1100, 1120],
      teamBRatings: [920, 940],
      winnerTeam: "A",
    });

    expect(underdog.teamADelta).toBeGreaterThan(favourite.teamADelta);
    expect(favourite.teamADelta).toBeGreaterThan(0);
  });

  it("penalises losing to a weaker team more than losing to a stronger team", () => {
    const lostToWeaker = applyDoublesRatingResult({
      teamARatings: [1120, 1100],
      teamBRatings: [940, 920],
      winnerTeam: "B",
    });
    const lostToStronger = applyDoublesRatingResult({
      teamARatings: [940, 920],
      teamBRatings: [1120, 1100],
      winnerTeam: "B",
    });

    expect(Math.abs(lostToWeaker.teamADelta)).toBeGreaterThan(Math.abs(lostToStronger.teamADelta));
  });

  it("maps rating boundaries to visible grades", () => {
    expect(gradeFromSquadRating(1300)).toBe("A+");
    expect(gradeFromSquadRating(1210)).toBe("A");
    expect(gradeFromSquadRating(1130)).toBe("B+");
    expect(gradeFromSquadRating(1060)).toBe("B");
    expect(gradeFromSquadRating(1010)).toBe("C+");
    expect(gradeFromSquadRating(960)).toBe("C");
    expect(gradeFromSquadRating(880)).toBe("D+");
    expect(gradeFromSquadRating(820)).toBe("D");
  });
});
