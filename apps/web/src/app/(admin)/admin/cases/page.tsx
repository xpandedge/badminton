import type { ReactNode } from "react";
import Link from "next/link";
import { assertSuperAdminPage } from "@/server/admin/guard";
import { closeSupportCaseFormAction, createSupportCaseFormAction, listSupportCases } from "@/server/admin/support-cases";

function fmt(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "-";
}

function targetHref(type: string, id: string): string | null {
  if (!id) return null;
  if (type === "user") return `/admin/users/${id}`;
  if (type === "squad") return `/admin/squads/${id}`;
  if (type === "session") return `/admin/sessions/${id}`;
  return null;
}

export default async function AdminCasesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await assertSuperAdminPage();
  const params = await searchParams;
  const status = params.status === "all" || params.status === "closed" ? params.status : "open";
  const result = await listSupportCases(status);
  const cases = result.ok ? result.data : [];

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem" }}>
        <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.5rem", fontWeight: 900 }}>Support Cases <span style={{ color: "var(--text-3)" }}>({cases.length})</span></h2>
        <p style={{ color: "var(--text-2)", marginTop: "0.35rem" }}>Track founder support issues by user, squad, or session before applying fixes.</p>
      </section>

      <form action={createSupportCaseFormAction} style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 120px 120px minmax(160px, 0.6fr) auto", gap: "0.75rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "0.75rem" }}>
        <input className="pb-input" name="title" placeholder="Case title" required style={{ marginTop: 0 }} />
        <select className="pb-input" name="priority" defaultValue="medium" style={{ marginTop: 0 }}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
        <select className="pb-input" name="targetType" defaultValue="session" style={{ marginTop: 0 }}><option value="user">User</option><option value="squad">Squad</option><option value="session">Session</option><option value="other">Other</option></select>
        <input className="pb-input" name="targetId" placeholder="Target ID" style={{ marginTop: 0 }} />
        <button className="pb-button" type="submit">Create</button>
        <input className="pb-input" name="note" placeholder="Initial note" style={{ marginTop: 0, gridColumn: "1 / -1" }} />
      </form>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <Link className="pb-button secondary" href="/admin/cases?status=open">Open</Link>
        <Link className="pb-button secondary" href="/admin/cases?status=closed">Closed</Link>
        <Link className="pb-button secondary" href="/admin/cases?status=all">All</Link>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-3)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <Th>Case</Th><Th>Priority</Th><Th>Status</Th><Th>Target</Th><Th>Note</Th><Th>Updated</Th><Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {cases.map((item) => {
              const href = targetHref(item.targetType, item.targetId);
              return (
                <tr key={item.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <Td><strong>{item.title}</strong><Small>{item.id}</Small></Td>
                  <Td>{item.priority}</Td>
                  <Td>{item.status}</Td>
                  <Td>{href ? <Link href={href}>{item.targetType}: {item.targetId}</Link> : `${item.targetType}: ${item.targetId || "-"}`}</Td>
                  <Td>{item.note || "-"}</Td>
                  <Td>{fmt(item.updatedAtIso ?? item.createdAtIso)}</Td>
                  <Td>{item.status !== "closed" && <form action={closeSupportCaseFormAction}><input type="hidden" name="caseId" value={item.id} /><button className="pb-button secondary" type="submit" style={{ padding: "0.5rem 0.75rem" }}>Close</button></form>}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {cases.length === 0 && <div style={{ padding: "1rem", color: "var(--text-2)" }}>No cases in this view.</div>}
      </div>
    </section>
  );
}

function Th({ children }: { children: ReactNode }) { return <th style={{ padding: "0.75rem", whiteSpace: "nowrap" }}>{children}</th>; }
function Td({ children }: { children: ReactNode }) { return <td style={{ padding: "0.75rem", verticalAlign: "top" }}>{children}</td>; }
function Small({ children }: { children: ReactNode }) { return <div style={{ color: "var(--text-3)", fontSize: "0.75rem", marginTop: "0.25rem", fontFamily: "var(--font-mono)" }}>{children}</div>; }
