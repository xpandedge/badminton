"use client";
import { useEffect, useState } from "react";
import { getFirebaseServices } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/useAuth";
import {
  DEV_USERS, DEV_USER_STORAGE_KEY, isDevAuthEnabled, signInAsDevUser, signOutDevUser,
} from "@/lib/auth/dev-auth";

export function DevUserSwitcher() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const enabled = isDevAuthEnabled();

  // Auto sign-in to the last selected dummy user on first load.
  useEffect(() => {
    if (!enabled || user) return;
    const lastKey = typeof window !== "undefined" ? localStorage.getItem(DEV_USER_STORAGE_KEY) : null;
    const target = DEV_USERS.find((u) => u.key === lastKey);
    if (target) void switchTo(target.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user]);

  if (!enabled) return null;

  async function switchTo(key: string) {
    const target = DEV_USERS.find((u) => u.key === key);
    if (!target) return;
    setBusy(true);
    try {
      const { auth } = getFirebaseServices();
      localStorage.setItem(DEV_USER_STORAGE_KEY, key);
      await signInAsDevUser(auth, target);
    } finally { setBusy(false); }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      const { auth } = getFirebaseServices();
      localStorage.removeItem(DEV_USER_STORAGE_KEY);
      await signOutDevUser(auth);
    } finally { setBusy(false); }
  }

  return (
    <>
    {/* The Firebase emulator SDK pins a warning banner to the bottom of the page,
        which intercepts clicks on bottom-of-page controls during e2e tests. Hide it
        in dev-auth mode (it is purely informational). */}
    <style>{`.firebase-emulator-warning{display:none !important;}`}</style>
    <div
      data-testid="dev-user-switcher"
      style={{
        // Top-right: the Firebase emulator warning banner is pinned to the bottom
        // and would otherwise intercept clicks on the switcher.
        position: "fixed", top: 12, right: 12, zIndex: 2147483647,
        background: "#16241C", color: "#C6F135", border: "2px solid #C6F135",
        borderRadius: 12, padding: "8px 10px", fontFamily: "monospace", fontSize: 12,
        display: "flex", flexDirection: "column", gap: 6, boxShadow: "0 4px 16px rgba(0,0,0,.4)",
        // Only the actual controls capture clicks, so the panel never blocks page
        // interactions (e.g. a submit button scrolled beneath it during tests).
        pointerEvents: "none",
      }}
    >
      <strong style={{ letterSpacing: ".08em" }}>DEV AUTH</strong>
      <span data-testid="dev-current-user">{user?.displayName ?? user?.email ?? "signed out"}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {DEV_USERS.map((u) => (
          <button
            key={u.key}
            data-testid={`dev-user-option-${u.key}`}
            disabled={busy}
            onClick={() => switchTo(u.key)}
            style={{ pointerEvents: "auto", cursor: "pointer", borderRadius: 8, border: "1px solid #C6F135", background: "transparent", color: "#C6F135", padding: "2px 6px" }}
          >
            {u.key}
          </button>
        ))}
        <button
          data-testid="dev-sign-out"
          disabled={busy}
          onClick={handleSignOut}
          style={{ pointerEvents: "auto", cursor: "pointer", borderRadius: 8, border: "1px solid #F03E3E", background: "transparent", color: "#F03E3E", padding: "2px 6px" }}
        >
          out
        </button>
      </div>
    </div>
    </>
  );
}
