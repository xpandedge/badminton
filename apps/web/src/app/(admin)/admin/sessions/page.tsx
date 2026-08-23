import type { ReactNode } from "react";
import Link from "next/link";
import { assertSuperAdminPage } from "@/server/admin/guard";
import { listAdminSessions } from "@/server/admin/lists";

function fmt(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "-";
}

export default async function AdminSessionsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await assertSuperAdminPage();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = params.status?.trim() || "all";
  const sessions = await listAdminSessions({ q, status, limit: 50 });

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <Header title="Sessions" count={sessions.length} subtitle="Recent sessions with squad, status, court, RSVP, and match signals." />
      <FilterForm q={q} status={status} />
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1060 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-3)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <Th>Session</Th><Th>Squad</Th><Th>Status</Th><Th>Sport</Th><Th>Venue</Th><Th>Starts</Th><Th>Courts</Th><Th>RSVP In</Th><Th>Matches</Th><Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id} style={{ borderTop: "1px solid var(--border)" }}>
                <Td><strong>{session.name}</strong><Small>{session.id}</Small></Td>
                <Td>{session.squadName}<Small>{session.squadId || "No squad id"}</Small></Td>
                <Td>{session.status}</Td>
                <Td>{session.sport}</Td>
                <Td>{session.venueName || "-"}</Td>
                <Td>{fmt(session.startsAtIso ?? session.createdAtIso)}</Td>
                <Td>{session.courtCount}</Td>
                <Td>{session.rsvpGoingCount}</Td>
                <Td>{session.matchCount ?? "-"}</Td>
                <Td><div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}><Link className="pb-button" href={`/admin/sessions/${session.id}`} style={{ padding: "0.5rem 0.75rem" }}>Open</Link><Link className="pb-button secondary" href={`/admin/sessions/${session.id}/recover`} style={{ padding: "0.5rem 0.75rem" }}>Recover</Link></div></Td>
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
      <input className="pb-input" name="q" defaultValue={q} placeholder="Search session, squad, venue, or ID" style={{ marginTop: 0 }} />
      <select className="pb-input" name="status" defaultValue={status} style={{ marginTop: 0 }}>
        <option value="all">All statuses</option>
        <option value="draft">Draft</option>
        <option value="scheduled">Scheduled</option>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <button className="pb-button" type="submit">Filter</button>
    </form>
  );
}

function Th({ children }: { children: ReactNode }) { return <th style={{ padding: "0.75rem", whiteSpace: "nowrap" }}>{children}</th>; }
function Td({ children }: { children: ReactNode }) { return <td style={{ padding: "0.75rem", verticalAlign: "top" }}>{children}</td>; }
function Small({ children }: { children: ReactNode }) { return <div style={{ color: "var(--text-3)", fontSize: "0.75rem", marginTop: "0.25rem", fontFamily: "var(--font-mono)" }}>{children}</div>; }
