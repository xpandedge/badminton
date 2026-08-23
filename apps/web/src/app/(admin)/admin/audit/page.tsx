import { getAdminDb } from "@/server/firebase/admin";
import { assertSuperAdminPage } from "@/server/admin/guard";
import { toPlain } from "@/server/lib/serialize";

export default async function AdminAuditPage() {
  await assertSuperAdminPage();
  const snap = await getAdminDb().collection("_adminAuditLogs")
    .orderBy("createdAt", "desc")
    .limit(25)
    .get()
    .catch(() => null);
  const logs = snap?.docs.map((doc) => ({ id: doc.id, data: toPlain(doc.data()) })) ?? [];

  return (
    <section style={{ display: "grid", gap: "0.75rem" }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem" }}>
        <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.5rem", fontWeight: 900 }}>Audit</h2>
        <p style={{ color: "var(--text-2)", marginTop: "0.5rem" }}>Latest founder support actions.</p>
      </div>
      {logs.map((log) => (
        <article key={log.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1rem", overflowX: "auto" }}>
          <pre>{JSON.stringify(log, null, 2)}</pre>
        </article>
      ))}
      {logs.length === 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1rem", color: "var(--text-2)" }}>
          No support audit entries yet.
        </div>
      )}
    </section>
  );
}
