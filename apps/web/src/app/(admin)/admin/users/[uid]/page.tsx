import { inspectUser } from "@/server/admin/inspect";
import type { ReactNode } from "react";

export default async function AdminUserPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const result = await inspectUser(uid);
  if (!result.ok) return <SupportError message={result.message} />;
  const user = result.data;

  return (
    <Inspector title="User" subtitle={uid}>
      <Panel title="Account">{user.auth ? <pre>{JSON.stringify(user.auth, null, 2)}</pre> : "No Auth record found."}</Panel>
      <Panel title="Profile"><pre>{JSON.stringify(user.profile, null, 2)}</pre></Panel>
      <Panel title="Player stats"><pre>{JSON.stringify(user.player, null, 2)}</pre></Panel>
      <Panel title="Squads">{user.membershipNote}</Panel>
    </Inspector>
  );
}

function Inspector({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <div style={{ display: "grid", gap: "1rem" }}><Header title={title} subtitle={subtitle} />{children}</div>;
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem" }}><h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.5rem", fontWeight: 900 }}>{title}</h2><p style={{ color: "var(--text-3)" }}>{subtitle}</p><p style={{ color: "var(--text-3)", fontSize: "0.8125rem", marginTop: "0.5rem" }}>Read-only support view.</p></section>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1rem", overflowX: "auto" }}><h3 style={{ fontWeight: 900, marginBottom: "0.5rem" }}>{title}</h3>{children}</section>;
}

function SupportError({ message }: { message: string }) {
  return <div style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid rgba(240,62,62,0.18)", borderRadius: "var(--r-lg)", padding: "1rem" }}>{message}</div>;
}
