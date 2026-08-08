// apps/web/src/app/quick/layout.tsx
"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";

export default function QuickLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/sign-in?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "grid", placeItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
          <div style={{ width: 44, height: 44, borderRadius: "var(--r-md)", background: "var(--volt-500)", display: "grid", placeItems: "center", animation: "pb-pop 600ms var(--ease-out) infinite alternate" }}>
            <svg width="26" height="26" viewBox="0 0 40 40" fill="none">
              <rect x="5" y="3" width="19" height="25" rx="9" transform="rotate(-15 14 15)" fill="none" stroke="#16241C" strokeWidth="3" />
              <circle cx="28" cy="28" r="8" fill="#16241C" />
              <circle cx="26" cy="26" r="3" fill="#C6F135" />
            </svg>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
