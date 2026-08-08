export type SkillLevel = "unknown" | "beginner" | "intermediate" | "advanced";

export const SKILL_LEVELS: readonly SkillLevel[] = [
  "unknown",
  "beginner",
  "intermediate",
  "advanced",
];

export function isSkillLevel(value: string): value is SkillLevel {
  return (SKILL_LEVELS as readonly string[]).includes(value);
}

/**
 * Derive a SkillLevel from cross-session performance stats.
 *
 * Used by the Hybrid Skill Rating Engine: after a player has completed
 * sessions >= MIN_SESSIONS_FOR_AUTO_RATING, their self-assessed skill is
 * replaced by a performance-derived rating based on win rate and point margins.
 *
 * Algorithm:
 *   - win rate >= 0.65                          → advanced
 *   - win rate >= 0.40                          → intermediate
 *   - win rate <  0.40                          → beginner
 *   - fewer than MIN_SESSIONS_FOR_AUTO_RATING   → return selfAssessed (no override)
 *
 * @param totalGames      cumulative games played across all sessions
 * @param totalWins       cumulative wins across all sessions
 * @param totalPointsDiff cumulative point differential across all sessions (optional)
 * @param sessionsPlayed  how many distinct sessions completed
 * @param selfAssessed    the player's own skill level choice (fallback if insufficient data)
 */
export const MIN_SESSIONS_FOR_AUTO_RATING = 2;

export function derivePerformanceSkill(
  totalGames: number,
  totalWins: number,
  _totalPointsDiff: number,
  sessionsPlayed: number,
  selfAssessed: SkillLevel = "unknown",
): SkillLevel {
  if (sessionsPlayed < MIN_SESSIONS_FOR_AUTO_RATING || totalGames === 0) {
    return selfAssessed;
  }
  const winRate = totalWins / totalGames;
  if (winRate >= 0.65) return "advanced";
  if (winRate >= 0.40) return "intermediate";
  return "beginner";
}

