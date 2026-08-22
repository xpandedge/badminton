const MIN_DISPLAY_NAME_LENGTH = 2;
const MAX_DISPLAY_NAME_LENGTH = 60;

export function normalizePlayerDisplayName(value: string): string {
  const displayName = value.trim().replace(/\s+/g, " ");

  if (!displayName) {
    throw new Error("Enter the name players should call you");
  }
  if (displayName.length < MIN_DISPLAY_NAME_LENGTH) {
    throw new Error(`Use at least ${MIN_DISPLAY_NAME_LENGTH} characters`);
  }
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error(`Use ${MAX_DISPLAY_NAME_LENGTH} characters or fewer`);
  }

  return displayName;
}
