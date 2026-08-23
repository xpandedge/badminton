import type { ReactNode } from "react";
import Link from "next/link";
import { assertSuperAdminPage } from "@/server/admin/guard";
import { listAdminSessionHealth } from "@/server/admin/lists";

function fmt(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "-";
}

export default async function AdminHealthPage() {
  await assertSuperAdminPage();
  const rows = await listAdminSessionHealth(50);

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem" }}>
        <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.5rem", fontWeight: 900 }}>Session Health <span style={{ color: "var(--text-3)" }}>({rows.length})</span></h2>
        <p style={{ color: "var(--text-2)", marginTop: "0.35rem" }}>Problem sessions from the recent sample: stuck active/paused, old unstarted sessions, and completed sessions with unscored matches.</p>
      </section>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-3)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <Th>Problem</Th><Th>Session</Th><Th>Squad</Th><Th>Status</Th><Th>Starts</Th><Th>Matches</Th><Th>Unscored</Th><Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} style={{ borderTop: "1px solid var(--border)" }}>
                <Td><strong>{row.problemLabel}</strong></Td>
                <Td>{row.name}<Small>{row.id}</Small></Td>
                <Td>{row.squadName}<Small>{row.squadId}</Small></Td>
                <Td>{row.status}</Td>
                <Td>{fmt(row.startsAtIso ?? row.createdAtIso)}</Td>
                <Td>{row.matchCount ?? "-"}</Td>
                <Td>{row.unscoredMatches}</Td>
                <Td><div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}><Link className="pb-button" href={`/admin/sessions/${row.id}`} style={{ padding: "0.5rem 0.75rem" }}>Open</Link><Link className="pb-button secondary" href={`/admin/sessions/${row.id}/recover`} style={{ padding: "0.5rem 0.75rem" }}>Recover</Link></div></Td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div style={{ padding: "1rem", color: "var(--text-2)" }}>No problem sessions found in the recent sample.</div>}
      </div>
    </section>
  );
}

function Th({ children }: { children: ReactNode }) { return <th style={{ padding: "0.75rem", whiteSpace: "nowrap" }}>{children}</th>; }
function Td({ children }: { children: ReactNode }) { return <td style={{ padding: "0.75rem", verticalAlign: "top" }}>{children}</td>; }
function Small({ children }: { children: ReactNode }) { return <div style={{ color: "var(--text-3)", fontSize: "0.75rem", marginTop: "0.25rem", fontFamily: "var(--font-mono)" }}>{children}</div>; }
