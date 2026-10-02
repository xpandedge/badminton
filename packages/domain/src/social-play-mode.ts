export const SOCIAL_PLAY_MODES = ["random", "mixed_games"] as const;

export type SocialPlayMode = (typeof SOCIAL_PLAY_MODES)[number];

export const SOCIAL_PLAY_MODE_LABELS: Record<SocialPlayMode, string> = {
  random: "Random",
  mixed_games: "Mixed games",
};

export function parseSocialPlayMode(value: unknown): SocialPlayMode | null {
  return typeof value === "string" && SOCIAL_PLAY_MODES.includes(value as SocialPlayMode)
    ? (value as SocialPlayMode)
    : null;
}

export function requiresGuestGenderForSocialPlayMode(value: unknown): boolean {
  return parseSocialPlayMode(value) !== "random";
}
