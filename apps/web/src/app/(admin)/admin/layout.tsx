import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { assertSuperAdminPage } from "@/server/admin/guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
const adminConsoleBuild = "founder-console-2026-08-23-b";

const navItems = [
  { href: "/admin", label: "Usage", group: "Founder" },
  { href: "/admin/search", label: "Requests", group: "Founder" },
  { href: "/admin/audit", label: "Fix log", group: "Founder" },
  { href: "/admin/users", label: "People", group: "Tables" },
  { href: "/admin/squads", label: "Squads", group: "Tables" },
  { href: "/admin/sessions", label: "Sessions", group: "Tables" },
  { href: "/admin/health", label: "Health", group: "Tables" },
  { href: "/admin/cases", label: "Cases", group: "Support" },
  { href: "/admin/fixes", label: "Fixes", group: "Support" },
  { href: "/admin/app-admins", label: "Admins", group: "Support" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await assertSuperAdminPage();
  const groups = [...new Set(navItems.map((item) => item.group))];

  return (
    <div className="pb-admin-shell">
      <aside className="pb-admin-sidebar" aria-label="Founder console sections">
        <Link href="/admin" className="pb-admin-brand" aria-label="DuoRally founder usage">
          <Logo variant="full" theme="light" size={38} showKicker={false} />
        </Link>
        <div className="pb-admin-sidebar__title">
          <span>Founder Console</span>
          <strong>Support view</strong>
          <em>{adminConsoleBuild}</em>
        </div>
        {groups.map((group) => (
          <nav key={group} className="pb-admin-nav-group" aria-label={group}>
            <span>{group}</span>
            {navItems.filter((item) => item.group === group).map((item) => (
              <Link key={item.href} href={item.href} className="pb-admin-nav-link">
                {item.label}
              </Link>
            ))}
          </nav>
        ))}
        <div className="pb-admin-account">
          <span>{session.appAdminRole ?? "admin"}</span>
          <strong>{session.email ?? session.uid}</strong>
        </div>
      </aside>

      <div className="pb-admin-main">
        <header className="pb-admin-topbar">
          <div>
            <p>Founder Console</p>
            <h1>DuoRally support</h1>
            <span className="pb-admin-version">{adminConsoleBuild}</span>
          </div>
          <div className="pb-admin-topbar__account">
            <span>{session.appAdminRole ?? "admin"}</span>
            <strong>{session.email ?? session.uid}</strong>
          </div>
          <nav className="pb-admin-mobile-nav" aria-label="Founder support">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>{item.label}</Link>
            ))}
          </nav>
        </header>
        <main className="pb-admin-content">
          {children}
        </main>
      </div>
    </div>
  );
}
