"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/useAuth";
import { signOutUser } from "@/lib/auth/sign-in";
import { SportPreferenceProvider, useSportPreference } from "@/lib/sport/SportPreferenceContext";
import { SportPickerModal } from "@/components/SportPickerModal";
import { Logo } from "@/components/Logo";
import { PlayerNameDialog } from "@/components/PlayerNameDialog";
import { SPORTS } from "@picklebaddies/domain";

function SportBadge() {
  const { sport, isLoaded, openPicker } = useSportPreference();
  if (!isLoaded || !sport) return null;

  const label = SPORTS[sport].label;
  return (
    <button
      onClick={openPicker}
      title={`Default sport: ${label}. Tap to change.`}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "0.5625rem",
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "4px 9px",
        borderRadius: "var(--r-pill)",
        border: "1.5px solid var(--border)",
        background: "var(--volt-500)",
        color: "var(--ink-800)",
        cursor: "pointer",
        lineHeight: 1.4,
      }}
    >
      {label}
    </button>
  );
}

function NavBar() {
  const pathname = usePathname();
  const isHome = pathname === "/dashboard";
  const isGroups = pathname.startsWith("/groups");

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        height: 68,
        paddingBottom: "env(safe-area-inset-bottom)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {/* Home */}
      <Link
        href="/dashboard"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 3,
          textDecoration: "none",
          flex: 1,
          paddingBlock: "0.5rem",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={isHome ? "var(--volt-500)" : "var(--text-3)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: isHome ? "var(--volt-500)" : "var(--text-3)",
        }}>Home</span>
      </Link>

      {/* Volt FAB */}
      <Link
        href="/sessions/new"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 3,
          textDecoration: "none",
          flex: 1,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "var(--volt-500)",
            display: "grid",
            placeItems: "center",
            boxShadow: "0 0 0 4px var(--bg), 0 4px 16px rgba(198,241,53,0.4)",
            marginTop: -16,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ink-800)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-3)",
        }}>Session</span>
      </Link>

      {/* Squads */}
      <Link
        href="/groups"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 3,
          textDecoration: "none",
          flex: 1,
          paddingBlock: "0.5rem",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={isGroups ? "var(--volt-500)" : "var(--text-3)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: isGroups ? "var(--volt-500)" : "var(--text-3)",
        }}>Squads</span>
      </Link>
      {/* Support */}
      <Link
        href="/help#support"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 3,
          textDecoration: "none",
          flex: 1,
          paddingBlock: "0.5rem",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-3)",
        }}>Support</span>
      </Link>
    </nav>
  );
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const [showPlayerNameDialog, setShowPlayerNameDialog] = useState(false);
  const closePlayerNameDialog = useCallback(() => setShowPlayerNameDialog(false), []);

  useEffect(() => {
    if (!loading && !user) router.replace("/sign-in");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        display: "grid",
        placeItems: "center",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
          <Logo variant="mark" theme="dark" size={52} animated />
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.6875rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}>Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const displayName = user.displayName?.trim() || "Player";
  const initials = displayName
    .split(" ")
    .map((p: string) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <SportPreferenceProvider>
    <SportPickerModal />
    <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(var(--bg-rgb, 246,248,244), 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 1.25rem",
        height: 56,
      }}>
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <Logo variant="full" theme="light" size={38} />
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <SportBadge />
          <Link
            href="/help"
            title="User guide"
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              border: "1.5px solid var(--border)",
              background: "var(--surface-sunken)",
              display: "grid",
              placeItems: "center",
              color: "var(--text-3)",
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </Link>
          <button
            onClick={() => signOutUser()}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6875rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-3)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0.25rem 0",
            }}
          >
            Out
          </button>
          <button
            type="button"
            title="Edit your player name"
            aria-label="Edit your player name"
            onClick={() => setShowPlayerNameDialog(true)}
            style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: "none",
            background: "var(--volt-500)",
            display: "grid",
            placeItems: "center",
            fontFamily: "var(--font-display-tight)",
            fontWeight: 900,
            fontSize: "0.6875rem",
            color: "var(--ink-800)",
            cursor: "pointer",
            padding: 0,
          }}>
            {initials}
          </button>
        </div>
      </header>

      <main style={{ flex: 1, paddingBottom: "calc(68px + env(safe-area-inset-bottom) + 24px)" }}>
        {children}
      </main>

      <NavBar />
      <PlayerNameDialog
        currentName={user.displayName?.trim() ?? ""}
        open={showPlayerNameDialog}
        onClose={closePlayerNameDialog}
        onSaved={refreshUser}
      />
    </div>
    </SportPreferenceProvider>
  );
}
