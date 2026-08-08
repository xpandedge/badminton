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
