import {
  repeatSquadRate,
  sessionAbandonmentRate,
  sessionCompletionRate,
  unscoredMatchRate,
} from "@picklebaddies/domain";
import { assertSuperAdminPage } from "@/server/admin/guard";
import { getAdminMetrics } from "@/server/admin/metrics";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  await assertSuperAdminPage();
  const metrics = await getAdminMetrics();

  const tiles = [
    { label: "Active squads", value: metrics.squads.active30d, detail: "Last 30 days" },
    { label: "Repeat squads", value: `${repeatSquadRate(metrics)}%`, detail: `${metrics.squads.repeatSessionSquads} squads with 2+ recent sessions` },
    { label: "Completed sessions", value: metrics.sessions.completed, detail: `${sessionCompletionRate(metrics)}% completion rate` },
    { label: "Stuck sessions", value: metrics.sessions.abandoned, detail: `${sessionAbandonmentRate(metrics)}% still active or paused` },
    { label: "Unscored matches", value: metrics.matches.unscored, detail: `${unscoredMatchRate(metrics)}% in recent sample` },
    { label: "Active players", value: metrics.users.active30d, detail: "Played in last 30 days" },
  ];

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <section style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-xl)",
        padding: "1rem",
      }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: "0.5rem" }}>
          Private support dashboard
        </p>
        <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.75rem", fontWeight: 900, letterSpacing: 0, marginBottom: "0.5rem" }}>
          See adoption, inspect support cases, and fix data safely.
        </h2>
        <p style={{ color: "var(--text-2)", maxWidth: 760, lineHeight: 1.5 }}>
          Founder-only view for DuoRally support. Metrics are computed on demand and cached daily. Match scoring is a recent sessions sample.
        </p>
        <p style={{ color: "var(--text-3)", fontSize: "0.8125rem", marginTop: "0.75rem" }}>
          As of {new Date(metrics.capturedAtIso).toLocaleString()}
        </p>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.75rem" }}>
        {tiles.map((tile) => (
          <div
            key={tile.label}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-lg)",
              padding: "1rem",
              minHeight: 120,
            }}
          >
            <div style={{ fontFamily: "var(--font-display-tight)", fontSize: "2rem", fontWeight: 900 }}>{tile.value}</div>
            <div style={{ color: "var(--text-1)", fontSize: "0.875rem", fontWeight: 900 }}>{tile.label}</div>
            <div style={{ color: "var(--text-3)", fontSize: "0.75rem", marginTop: "0.35rem" }}>{tile.detail}</div>
          </div>
        ))}
      </section>

      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem" }}>
        <h3 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, marginBottom: "0.75rem" }}>
          Squad Geography
        </h3>
        <p style={{ color: "var(--text-3)", fontSize: "0.8125rem", marginBottom: "0.75rem" }}>
          Based on saved venues and session venue names. Unknown squads: {metrics.geography.unknownSquads}.
        </p>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {metrics.geography.topRegions.map((region) => (
            <div key={region.label} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.75rem", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: "0.5rem" }}>
              <span style={{ fontWeight: 900 }}>{region.label}</span>
              <span style={{ color: "var(--text-3)" }}>{region.squadCount} squads - {region.active30d} active</span>
            </div>
          ))}
          {metrics.geography.topRegions.length === 0 && (
            <div style={{ color: "var(--text-2)" }}>No reliable squad geography yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}
