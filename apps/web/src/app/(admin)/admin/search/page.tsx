import Link from "next/link";
import { adminSearch } from "@/server/admin/search";

export default async function AdminSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const results = q ? await adminSearch(q) : null;

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem" }}>
        <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.5rem", fontWeight: 900, marginBottom: "0.75rem" }}>
          Requests search
        </h2>
        <form style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.5rem" }}>
          <input className="pb-input" name="q" defaultValue={q} placeholder="Email, name, squad, session ID, or code" />
          <button className="pb-btn pb-btn-volt" type="submit">Search</button>
        </form>
      </section>

      <section style={{ display: "grid", gap: "0.625rem" }}>
        {results?.ok && results.data.map((item) => (
          <Link key={`${item.kind}:${item.id}`} href={item.href} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1rem", color: "var(--text-1)", textDecoration: "none" }}>
            <div style={{ fontWeight: 900 }}>{item.label}</div>
            <div style={{ color: "var(--text-3)", marginTop: "0.25rem" }}>{item.kind} - {item.sublabel}</div>
          </Link>
        ))}
        {results?.ok && results.data.length === 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1rem", color: "var(--text-2)" }}>
            No results found.
          </div>
        )}
        {results && !results.ok && (
          <div style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid rgba(240,62,62,0.18)", borderRadius: "var(--r-lg)", padding: "1rem" }}>
            {results.message}
          </div>
        )}
      </section>
    </div>
  );
}
