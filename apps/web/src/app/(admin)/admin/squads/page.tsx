import type { ReactNode } from "react";
import Link from "next/link";
import { assertSuperAdminPage } from "@/server/admin/guard";
import { listAdminSquads } from "@/server/admin/lists";

function fmt(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "-";
}

export default async function AdminSquadsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; geography?: string }> }) {
  await assertSuperAdminPage();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = params.status === "active" || params.status === "archived" ? params.status : "all";
  const geography = params.geography?.trim() ?? "";
  const squads = await listAdminSquads({ q, status, geography, limit: 50 });

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <Header title="Squads" count={squads.length} subtitle="Recent squads, ownership, adoption geography, and session volume." />
      <FilterForm q={q} status={status} geography={geography} />
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-3)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <Th>Squad</Th><Th>Owner</Th><Th>Geography</Th><Th>Members</Th><Th>Sessions</Th><Th>Status</Th><Th>Updated</Th><Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {squads.map((squad) => (
              <tr key={squad.id} style={{ borderTop: "1px solid var(--border)" }}>
                <Td><strong>{squad.name}</strong><Small>{squad.id}</Small></Td>
                <Td>{squad.ownerName}<Small>{squad.ownerUid || "No owner id"}</Small></Td>
                <Td>{squad.geography}</Td>
                <Td>{squad.memberCount}</Td>
                <Td>{squad.sessionCount ?? "-"}</Td>
                <Td>{squad.status}</Td>
                <Td>{fmt(squad.updatedAtIso ?? squad.createdAtIso)}</Td>
                <Td><div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}><Link className="pb-button" href={`/admin/squads/${squad.id}`} style={{ padding: "0.5rem 0.75rem" }}>Open</Link><Link className="pb-button secondary" href={`/admin/squads/${squad.id}/fix`} style={{ padding: "0.5rem 0.75rem" }}>Fix</Link></div></Td>
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

function FilterForm({ q, status, geography }: { q: string; status: string; geography: string }) {
  return (
    <form style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 160px 180px auto", gap: "0.75rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "0.75rem" }}>
      <input className="pb-input" name="q" defaultValue={q} placeholder="Search squad, owner, or ID" style={{ marginTop: 0 }} />
      <select className="pb-input" name="status" defaultValue={status} style={{ marginTop: 0 }}>
        <option value="all">All squads</option>
        <option value="active">Active only</option>
        <option value="archived">Archived only</option>
      </select>
      <input className="pb-input" name="geography" defaultValue={geography} placeholder="Geography" style={{ marginTop: 0 }} />
      <button className="pb-button" type="submit">Filter</button>
    </form>
  );
}

function Th({ children }: { children: ReactNode }) { return <th style={{ padding: "0.75rem", whiteSpace: "nowrap" }}>{children}</th>; }
function Td({ children }: { children: ReactNode }) { return <td style={{ padding: "0.75rem", verticalAlign: "top" }}>{children}</td>; }
function Small({ children }: { children: ReactNode }) { return <div style={{ color: "var(--text-3)", fontSize: "0.75rem", marginTop: "0.25rem", fontFamily: "var(--font-mono)" }}>{children}</div>; }
