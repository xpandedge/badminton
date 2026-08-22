/**
 * Canonical public origin for links we hand to other people.
 *
 * The app is reachable on the Firebase Hosting default domain for whichever
 * project it is deployed to (*.web.app) as well as the branded one. Anything copied
 * from a session — board, score, RSVP and invite links — is pasted into a chat
 * and seen by players, so it must carry the branded domain regardless of which
 * host the organiser happens to be using.
 *
 * Local and preview hosts are left alone so dev and e2e keep working.
 */
export const CANONICAL_ORIGIN = "https://duorally.com.au";

/** Hosts that must never appear in a link we ask someone to share. */
function isLegacyHost(hostname: string): boolean {
  return hostname.endsWith(".web.app") || hostname.endsWith(".firebaseapp.com");
}

/**
 * Origin to use when building a shareable URL.
 *
 * Order: explicit NEXT_PUBLIC_SITE_URL, then the current origin unless it is a
 * legacy Firebase host, then the canonical origin as the server-render default.
 */
export function shareOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  if (typeof window === "undefined") return CANONICAL_ORIGIN;

  const { origin, hostname } = window.location;
  return isLegacyHost(hostname) ? CANONICAL_ORIGIN : origin;
}

/** Absolute shareable URL for an app-relative path. */
export function shareUrl(path: string): string {
  if (!path) return "";
  return `${shareOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}
