import { inspectSquad } from "@/server/admin/inspect";
import Link from "next/link";
import type { ReactNode } from "react";

export default async function AdminSquadPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const result = await inspectSquad(groupId);
  if (!result.ok) return <SupportError message={result.message} />;
  const squad = result.data;

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <Header title="Squad" subtitle={groupId} fixHref={`/admin/squads/${groupId}/fix`} />
      <Panel title="Summary"><pre>{JSON.stringify({ ...squad.group, geography: squad.geography, counts: squad.counts }, null, 2)}</pre></Panel>
      <Panel title="Members"><pre>{JSON.stringify(squad.members, null, 2)}</pre></Panel>
      <Panel title="Venues and courts"><pre>{JSON.stringify(squad.venues, null, 2)}</pre></Panel>
      <Panel title="Recent sessions"><pre>{JSON.stringify(squad.sessions, null, 2)}</pre></Panel>
    </div>
  );
}

function Header({ title, subtitle, fixHref }: { title: string; subtitle: string; fixHref: string }) {
  return <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem", display: "grid", gap: "0.75rem" }}><div><h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.5rem", fontWeight: 900 }}>{title}</h2><p style={{ color: "var(--text-3)" }}>{subtitle}</p><p style={{ color: "var(--text-3)", fontSize: "0.8125rem", marginTop: "0.5rem" }}>Read-only support view.</p></div><Link className="pb-button" href={fixHref} style={{ width: "fit-content" }}>Open support fixes</Link></section>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1rem", overflowX: "auto" }}><h3 style={{ fontWeight: 900, marginBottom: "0.5rem" }}>{title}</h3>{children}</section>;
}

function SupportError({ message }: { message: string }) {
  return <div style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid rgba(240,62,62,0.18)", borderRadius: "var(--r-lg)", padding: "1rem" }}>{message}</div>;
}
