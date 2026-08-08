"use client";

const COOKIE_NAME = "__session";
// Match the Firebase ID token max age (1 hour). The AuthProvider refreshes
// the cookie on every onIdTokenChanged event, which fires before expiry.
const MAX_AGE_SECONDS = 3600;

export function setSessionCookie(token: string): void {
  document.cookie = [
    `${COOKIE_NAME}=${token}`,
    `max-age=${MAX_AGE_SECONDS}`,
    "path=/",
    "SameSite=Strict",
    // Omit Secure in dev (http://localhost); production should add it via middleware or
    // set NEXT_PUBLIC_SECURE_COOKIE=true.
    ...(process.env.NEXT_PUBLIC_SECURE_COOKIE === "true" ? ["Secure"] : []),
  ].join("; ");
}

export function clearSessionCookie(): void {
  document.cookie = `${COOKIE_NAME}=; max-age=0; path=/; SameSite=Strict`;
}
