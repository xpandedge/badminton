import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getAppAdminRole, isSuperAdminClaim, type AppAdminRole, type SuperAdminClaims } from "@picklebaddies/domain";
import { getAdminAuth } from "@/server/firebase/admin";

export interface SessionUser {
  uid: string;
  email: string | null;
  superAdmin: boolean;
  appAdminRole: AppAdminRole | null;
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
    const claims = decoded as SuperAdminClaims;
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      superAdmin: isSuperAdminClaim(claims),
      appAdminRole: getAppAdminRole(claims),
    };
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

export async function requireSuperAdmin(): Promise<SessionUser> {
  const session = await requireSession();
  if (!session.superAdmin) {
    throw new ServerAuthError("Forbidden", "FORBIDDEN");
  }
  return session;
}

export async function requireAppOwner(): Promise<SessionUser> {
  const session = await requireSuperAdmin();
  if (session.appAdminRole !== "owner") {
    throw new ServerAuthError("Forbidden", "FORBIDDEN");
  }
  return session;
}

export class ServerAuthError extends Error {
  readonly code: "UNAUTHENTICATED" | "FORBIDDEN";
  constructor(message: string, code: "UNAUTHENTICATED" | "FORBIDDEN" = "UNAUTHENTICATED") {
    super(message);
    this.name = "ServerAuthError";
    this.code = code;
  }
}
