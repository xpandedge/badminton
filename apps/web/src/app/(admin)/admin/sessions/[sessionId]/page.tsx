import { inspectSession } from "@/server/admin/inspect";
import Link from "next/link";
import type { ReactNode } from "react";

export default async function AdminSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const result = await inspectSession(sessionId);
  if (!result.ok) return <SupportError message={result.message} />;
  const session = result.data;

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <Header title="Session" subtitle={sessionId} recoverHref={`/admin/sessions/${sessionId}/recover`} />
      <Panel title="Status"><pre>{JSON.stringify(session.session, null, 2)}</pre></Panel>
      <Panel title="Timeline"><pre>{JSON.stringify(session.auditLogs, null, 2)}</pre></Panel>
      <Panel title="Roster"><pre>{JSON.stringify(session.players, null, 2)}</pre></Panel>
      <Panel title="Matches"><pre>{JSON.stringify(session.matches, null, 2)}</pre></Panel>
      <Panel title="Leaderboard"><pre>{JSON.stringify(session.leaderboard, null, 2)}</pre></Panel>
      <Panel title="Engine"><pre>{JSON.stringify({ engine: session.engine, generationRuns: session.generationRuns }, null, 2)}</pre></Panel>
    </div>
  );
}

function Header({ title, subtitle, recoverHref }: { title: string; subtitle: string; recoverHref: string }) {
  return <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem", display: "grid", gap: "0.75rem" }}><div><h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.5rem", fontWeight: 900 }}>{title}</h2><p style={{ color: "var(--text-3)" }}>{subtitle}</p><p style={{ color: "var(--text-3)", fontSize: "0.8125rem", marginTop: "0.5rem" }}>Read-only support view.</p></div><Link className="pb-button" href={recoverHref} style={{ width: "fit-content" }}>Open recovery fixes</Link></section>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1rem", overflowX: "auto" }}><h3 style={{ fontWeight: 900, marginBottom: "0.5rem" }}>{title}</h3>{children}</section>;
}

function SupportError({ message }: { message: string }) {
  return <div style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid rgba(240,62,62,0.18)", borderRadius: "var(--r-lg)", padding: "1rem" }}>{message}</div>;
}
