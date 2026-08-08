"use client";

import { createContext, useEffect, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { getFirebaseServices } from "@/lib/firebase/client";
import { ensureUserProfile } from "@/lib/auth/profile";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth/session-cookie";
import { ensureGlobalPlayer } from "@/server/players/actions";
import type { AuthState } from "@/lib/auth/types";

export const AuthContext = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    const { auth, db } = getFirebaseServices();
    // onIdTokenChanged fires on sign-in, sign-out, AND token refresh (every ~1h),
    // so the __session cookie stays fresh without manual polling.
    const unsub = onIdTokenChanged(auth, async (user) => {
      if (user) {
        try {
          await ensureUserProfile(db, user);
          const token = await user.getIdToken();
          setSessionCookie(token);
          // Fire-and-forget: create global player doc if it doesn't exist yet.
          // Must run after setSessionCookie so the server action can read the token.
          void ensureGlobalPlayer(user.displayName ?? "");
        } catch (err) {
          console.error("session setup failed", err);
        }
      } else {
        clearSessionCookie();
      }
      setState({ user, loading: false });
    });
    return unsub;
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
