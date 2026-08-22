"use client";

import { createContext, useCallback, useEffect, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { getFirebaseServices } from "@/lib/firebase/client";
import { ensureUserProfile } from "@/lib/auth/profile";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth/session-cookie";
import { ensureGlobalPlayer } from "@/server/players/actions";
import type { AuthContextValue, AuthState } from "@/lib/auth/types";

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refreshUser: async () => undefined,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  const refreshUser = useCallback(async () => {
    const { auth } = getFirebaseServices();
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    setState({ user: auth.currentUser, loading: false });
  }, []);

  useEffect(() => {
    const { auth, db } = getFirebaseServices();
    // onIdTokenChanged fires on sign-in, sign-out, AND token refresh (every ~1h),
    // so the __session cookie stays fresh without manual polling.
    const unsub = onIdTokenChanged(auth, async (user) => {
      if (user) {
        try {
          const token = await user.getIdToken();
          setSessionCookie(token);
        } catch (err) {
          console.error("session setup failed", err);
        }
        setState({ user, loading: false });

        // Fire-and-forget: keep profile/player records warm after the auth state
        // is usable. These writes should not block the session cookie handoff.
        void (async () => {
          try {
            await ensureUserProfile(db, user);
            await ensureGlobalPlayer(user.displayName ?? "");
          } catch (err) {
            console.error("profile setup failed", err);
          }
        })();
      } else {
        clearSessionCookie();
        setState({ user, loading: false });
      }
    });
    return unsub;
  }, []);

  return <AuthContext.Provider value={{ ...state, refreshUser }}>{children}</AuthContext.Provider>;
}
