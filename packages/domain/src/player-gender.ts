export const PLAYER_GENDERS = ["male", "female", "non_binary"] as const;

export type PlayerGender = (typeof PLAYER_GENDERS)[number];

export const PLAYER_GENDER_LABELS: Record<PlayerGender, string> = {
  male: "Male",
  female: "Female",
  non_binary: "Non-binary",
};

export function isPlayerGender(value: unknown): value is PlayerGender {
  return typeof value === "string" && PLAYER_GENDERS.includes(value as PlayerGender);
}

export function parsePlayerGender(value: unknown): PlayerGender | null {
  return isPlayerGender(value) ? value : null;
}
