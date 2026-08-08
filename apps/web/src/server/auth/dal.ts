import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getAdminAuth } from "@/server/firebase/admin";

export interface SessionUser {
  uid: string;
  email: string | null;
}

/**
 * Reads and verifies the Firebase ID token from the __session cookie.
 * Returns null if missing, malformed, or expired.
 * Cached per request via React cache().
 */
export const verifySession = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get("__session")?.value;
  if (!token) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(token, /* checkRevoked */ true);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    return null;
  }
});

/**
 * Like verifySession but throws a 401-shaped error if unauthenticated.
 * Use in server actions that must be protected.
 */
export async function requireSession(): Promise<SessionUser> {
  const session = await verifySession();
  if (!session) {
    throw new ServerAuthError("Unauthenticated");
  }
  return session;
}

export class ServerAuthError extends Error {
  readonly code = "UNAUTHENTICATED";
  constructor(message: string) {
    super(message);
    this.name = "ServerAuthError";
  }
}
