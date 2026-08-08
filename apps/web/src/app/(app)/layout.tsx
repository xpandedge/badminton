"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/useAuth";
import { signOutUser } from "@/lib/auth/sign-in";
import { SportPreferenceProvider, useSportPreference } from "@/lib/sport/SportPreferenceContext";
import { SportPickerModal } from "@/components/SportPickerModal";

function SportBadge() {
  const { sport, isLoaded, openPicker } = useSportPreference();
  if (!isLoaded || !sport) return null;

  const label = sport === "pickleball" ? "PB" : "BD";
  return (
    <button
      onClick={openPicker}
      title={`Playing ${sport} — tap to change`}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "0.5625rem",
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "3px 8px",
        borderRadius: "var(--r-pill)",
        border: "1.5px solid var(--border)",
        background: "var(--surface-sunken)",
        color: "var(--text-2)",
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

      {/* Groups */}
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
        }}>Groups</span>
      </Link>
    </nav>
  );
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

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
          <div style={{
            width: 44,
            height: 44,
            borderRadius: "var(--r-md)",
            background: "var(--volt-500)",
            display: "grid",
            placeItems: "center",
            animation: "pb-pop 600ms var(--ease-out) infinite alternate",
          }}>
            <svg width="26" height="26" viewBox="0 0 40 40" fill="none">
              <rect x="5" y="3" width="19" height="25" rx="9" transform="rotate(-15 14 15)" fill="none" stroke="#16241C" strokeWidth="3" />
              <circle cx="28" cy="28" r="8" fill="#16241C" />
              <circle cx="26" cy="26" r="3" fill="#C6F135" />
            </svg>
          </div>
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

  const displayName = user.displayName ?? user.email ?? "Baddie";
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
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
          <div style={{
            width: 30,
            height: 30,
            borderRadius: "var(--r-md)",
            background: "var(--volt-500)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 40 40" fill="none">
              <rect x="5" y="3" width="19" height="25" rx="9" transform="rotate(-15 14 15)" fill="none" stroke="#16241C" strokeWidth="3" />
              <circle cx="28" cy="28" r="8" fill="#16241C" />
              <circle cx="26" cy="26" r="3" fill="#C6F135" />
            </svg>
          </div>
          <span style={{
            fontFamily: "var(--font-display)",
            fontWeight: 900,
            fontSize: "0.875rem",
            color: "var(--text-1)",
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
          }}>
            Pickle<span style={{ color: "var(--volt-500)" }}>Baddies</span>
          </span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <SportBadge />
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
          <div style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--volt-500)",
            display: "grid",
            placeItems: "center",
            fontFamily: "var(--font-display-tight)",
            fontWeight: 900,
            fontSize: "0.6875rem",
            color: "var(--ink-800)",
          }}>
            {initials}
          </div>
        </div>
      </header>

      <main style={{ flex: 1, paddingBottom: 84 }}>
        {children}
      </main>

      <NavBar />
    </div>
    </SportPreferenceProvider>
  );
}
