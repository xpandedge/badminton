export const CAST_NAMESPACE = "urn:x-cast:au.com.duorally.board";
export const DISPLAY_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
export function parseCastMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  return message.type === "display" && typeof message.token === "string" && DISPLAY_TOKEN_PATTERN.test(message.token) ? message.token : null;
}
export function normalizePairCode(value: string): string | null {
  const code = value.replace(/[\s-]/g, "").toUpperCase();
  return /^[A-F0-9]{8}$/.test(code) ? code : null;
}
export function canClaimPair(pair: { expiresAt?: number; claimed?: boolean } | undefined, now: number): boolean {
  return !!pair && typeof pair.expiresAt === "number" && pair.expiresAt > now && pair.claimed !== true;
}
