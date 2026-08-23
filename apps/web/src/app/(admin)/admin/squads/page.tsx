import { assertSuperAdminPage } from "@/server/admin/guard";

export default async function AdminSquadsPage() {
  await assertSuperAdminPage();
  return <Placeholder title="Squads" body="Use Search to open a squad by name or ID. The overview shows adoption by geography." />;
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem" }}><h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.5rem", fontWeight: 900 }}>{title}</h2><p style={{ color: "var(--text-2)", marginTop: "0.5rem" }}>{body}</p></section>;
}
