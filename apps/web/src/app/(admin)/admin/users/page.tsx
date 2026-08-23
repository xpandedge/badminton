import type { ReactNode } from "react";
import Link from "next/link";
import { assertSuperAdminPage } from "@/server/admin/guard";
import { listAdminUsers } from "@/server/admin/lists";

function fmt(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "-";
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await assertSuperAdminPage();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = params.status === "disabled" || params.status === "active" ? params.status : "all";
  const users = await listAdminUsers({ q, status, limit: 50 });

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <Header title="People" count={users.length} subtitle="Latest Firebase Auth users with profile and player signals." />
      <FilterForm q={q} status={status} />
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-3)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <Th>User</Th><Th>Email</Th><Th>Last sign-in</Th><Th>Created</Th><Th>Games</Th><Th>Status</Th><Th>Inspect</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.uid} style={{ borderTop: "1px solid var(--border)" }}>
                <Td><strong>{user.displayName}</strong><Small>{user.uid}</Small></Td>
                <Td>{user.email || "-"}</Td>
                <Td>{fmt(user.lastSignInIso)}</Td>
                <Td>{fmt(user.createdAtIso)}</Td>
                <Td>{user.playerGames ?? "-"}</Td>
                <Td>{user.disabled ? "Disabled" : "Active"}</Td>
                <Td><Link className="pb-button" href={`/admin/users/${user.uid}`} style={{ padding: "0.5rem 0.75rem" }}>Open</Link></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Header({ title, count, subtitle }: { title: string; count: number; subtitle: string }) {
  return <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem" }}><h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.5rem", fontWeight: 900 }}>{title} <span style={{ color: "var(--text-3)" }}>({count})</span></h2><p style={{ color: "var(--text-2)", marginTop: "0.35rem" }}>{subtitle}</p></section>;
}

function FilterForm({ q, status }: { q: string; status: string }) {
  return (
    <form style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 180px auto", gap: "0.75rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "0.75rem" }}>
      <input className="pb-input" name="q" defaultValue={q} placeholder="Search name, email, or UID" style={{ marginTop: 0 }} />
      <select className="pb-input" name="status" defaultValue={status} style={{ marginTop: 0 }}>
        <option value="all">All users</option>
        <option value="active">Active only</option>
        <option value="disabled">Disabled only</option>
      </select>
      <button className="pb-button" type="submit">Filter</button>
    </form>
  );
}

function Th({ children }: { children: ReactNode }) { return <th style={{ padding: "0.75rem", whiteSpace: "nowrap" }}>{children}</th>; }
function Td({ children }: { children: ReactNode }) { return <td style={{ padding: "0.75rem", verticalAlign: "top" }}>{children}</td>; }
function Small({ children }: { children: ReactNode }) { return <div style={{ color: "var(--text-3)", fontSize: "0.75rem", marginTop: "0.25rem", fontFamily: "var(--font-mono)" }}>{children}</div>; }
