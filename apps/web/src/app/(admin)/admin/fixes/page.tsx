import { assertSuperAdminPage } from "@/server/admin/guard";

export default async function AdminFixesPage() {
  await assertSuperAdminPage();
  return <Placeholder title="Fixes" body="Open a squad or session inspector, then use its support fix link. Current tools cover squad ownership transfer, archived squad restore, and session status recovery." />;
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem" }}><h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.5rem", fontWeight: 900 }}>{title}</h2><p style={{ color: "var(--text-2)", marginTop: "0.5rem" }}>{body}</p></section>;
}
