import Link from "next/link";
import type { ReactNode } from "react";
import { assertSuperAdminPage } from "@/server/admin/guard";

export const dynamic = "force-dynamic";

const navItems = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/search", label: "Search" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/squads", label: "Squads" },
  { href: "/admin/sessions", label: "Sessions" },
  { href: "/admin/health", label: "Health" },
  { href: "/admin/cases", label: "Cases" },
  { href: "/admin/fixes", label: "Fixes" },
  { href: "/admin/app-admins", label: "App Admins" },
  { href: "/admin/audit", label: "Audit" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await assertSuperAdminPage();

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text-1)" }}>
      <header style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>
        <div style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "0.875rem 1rem",
          display: "grid",
          gap: "0.75rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 800 }}>
                DuoRally
              </div>
              <h1 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: 0, margin: 0 }}>
                Founder Support
              </h1>
            </div>
            <div style={{ textAlign: "right", color: "var(--text-3)", fontSize: "0.8125rem" }}>
              <div>{session.email ?? session.uid}</div>
              <div style={{ textTransform: "capitalize" }}>{session.appAdminRole ?? "admin"}</div>
            </div>
          </div>
          <nav style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.1rem" }} aria-label="Founder support">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  minHeight: 36,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 0.75rem",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-md)",
                  color: "var(--text-1)",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  fontWeight: 800,
                  fontSize: "0.8125rem",
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "1rem" }}>
        {children}
      </main>
    </div>
  );
}
