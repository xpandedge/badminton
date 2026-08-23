import Link from "next/link";
import type { ReactNode } from "react";
import {
  squadSecondSessionRate,
  unscoredMatchRate,
} from "@picklebaddies/domain";
import { assertSuperAdminPage } from "@/server/admin/guard";
import { getAdminMetrics } from "@/server/admin/metrics";

export const dynamic = "force-dynamic";

function fmtDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtShortDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function ago(value: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days < 7) return `${days || 1}d ago`;
  return `${Math.floor(days / 7)}wk ago`;
}

export default async function AdminOverviewPage() {
  await assertSuperAdminPage();
  const metrics = await getAdminMetrics();
  const maxWeekly = Math.max(1, ...metrics.weeklySessions.map((week) => week.count));
  const secondSessionRate = squadSecondSessionRate(metrics);

  const tiles = [
    {
      label: "Squads",
      value: metrics.squads.total,
      detail: `${metrics.squads.active30d} active · ${metrics.squads.new30d} new this month`,
      href: "/admin/squads",
    },
    {
      label: "People",
      value: metrics.users.total,
      detail: `${metrics.users.active30d} active · ${metrics.users.guestPlayersSampled} guest entries sampled`,
      href: "/admin/users",
    },
    {
      label: "Sessions run",
      value: metrics.sessions.created90d,
      detail: `${metrics.sessions.created7d} this week · ${metrics.sessions.created30d} this month`,
      href: "/admin/sessions",
    },
    {
      label: "Recent games",
      value: metrics.matches.total,
      detail: `${metrics.matches.unscored} unscored · ${unscoredMatchRate(metrics)}% need attention`,
      href: "/admin/health",
    },
  ];

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <section
        className="pb-admin-panel"
        style={{
          overflow: "hidden",
          background: "linear-gradient(135deg, var(--ink-800), var(--ink-700))",
          color: "var(--n-50)",
        }}
      >
        <div style={{ padding: "clamp(1rem, 3vw, 1.5rem)", display: "grid", gap: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ maxWidth: 760 }}>
              <p className="pb-admin-kicker" style={{ color: "var(--volt-500)" }}>Usage</p>
              <h2 style={{ marginTop: "0.45rem", fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 5vw, 3.2rem)", lineHeight: 1, fontWeight: 900, letterSpacing: 0, textTransform: "uppercase" }}>
                Understand the usage.
              </h2>
              <p style={{ maxWidth: 680, marginTop: "0.75rem", color: "rgba(246, 248, 244, 0.72)", lineHeight: 1.55 }}>
                The weekly founder view: is DuoRally growing, do squads come back, where is it adopted, and where do sessions fall over?
              </p>
            </div>
            <div style={{ display: "grid", alignContent: "start", gap: "0.5rem", textAlign: "right" }}>
              <span className="pb-admin-kicker" style={{ color: "rgba(246, 248, 244, 0.56)" }}>
                As of {fmtDateTime(metrics.capturedAtIso)}
              </span>
              <span style={{ justifySelf: "end", width: "fit-content", padding: "0.45rem 0.7rem", borderRadius: "var(--r-pill)", background: "var(--volt-500)", color: "var(--ink-800)", fontWeight: 900 }}>
                {metrics.period.label}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.75rem" }}>
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="pb-admin-card"
            style={{ display: "grid", gap: "0.35rem", minHeight: 132, padding: "1rem", color: "var(--text-1)", textDecoration: "none" }}
          >
            <span className="pb-admin-kicker">{tile.label}</span>
            <strong style={{ fontFamily: "var(--font-display-tight)", fontSize: "2.25rem", lineHeight: 1, fontWeight: 900 }}>
              {tile.value.toLocaleString()}
            </strong>
            <span style={{ color: "var(--text-2)", fontSize: "0.84rem", fontWeight: 750 }}>{tile.detail}</span>
          </Link>
        ))}
      </section>

      <div className="pb-admin-dashboard-grid">
        <div style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
          <section className="pb-admin-panel" style={{ padding: "1rem", display: "grid", gap: "1rem" }}>
            <SectionHeader title="Sessions per week" detail="Last 12 weeks" />
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${metrics.weeklySessions.length}, minmax(18px, 1fr))`, gap: "0.45rem", alignItems: "end", minHeight: 190 }}>
              {metrics.weeklySessions.map((week) => (
                <div key={week.weekStartIso} style={{ display: "grid", alignItems: "end", gap: "0.35rem", minWidth: 0 }}>
                  <div
                    title={`${fmtShortDate(week.weekStartIso)}: ${week.count} sessions`}
                    style={{
                      minHeight: 8,
                      height: `${Math.max(8, (week.count / maxWeekly) * 150)}px`,
                      borderRadius: "var(--r-xs) var(--r-xs) 2px 2px",
                      background: week.count === maxWeekly ? "var(--volt-500)" : "var(--emerald-400)",
                    }}
                  />
                  <span style={{ overflow: "hidden", color: "var(--text-3)", fontSize: "0.68rem", fontWeight: 800, textAlign: "center", whiteSpace: "nowrap" }}>
                    {fmtShortDate(week.weekStartIso)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
            <section className="pb-admin-panel" style={{ padding: "1rem", display: "grid", gap: "1rem" }}>
              <SectionHeader title="Do squads come back?" detail={`${secondSessionRate}% ran a second session`} />
              <MetricRow label="Ran 5 or more sessions" value={`${metrics.retention.fivePlus} squads`} />
              <MetricRow label="Ran 2 to 4 sessions" value={`${metrics.retention.twoToFour} squads`} />
              <MetricRow label="Ran once, never again" value={`${metrics.retention.once} squads`} />
              <div style={{ padding: "0.85rem", borderRadius: "var(--r-lg)", background: "rgba(198, 241, 53, 0.16)", color: "var(--ink-800)" }}>
                <strong style={{ display: "block", fontFamily: "var(--font-display-tight)", fontSize: "1.1rem", fontWeight: 900 }}>The number to move</strong>
                <p style={{ marginTop: "0.35rem", color: "var(--ink-600)", lineHeight: 1.45 }}>
                  The {metrics.retention.once} one-session squads are the clearest product signal.
                </p>
              </div>
            </section>

            <section className="pb-admin-panel" style={{ padding: "1rem", display: "grid", gap: "1rem" }}>
              <SectionHeader title="Where sessions fall over" detail="Created to scored funnel" />
              <FunnelRow label="Created" value={metrics.sessions.created90d} max={metrics.sessions.created90d} />
              <FunnelRow label="Never started" value={metrics.sessions.neverStarted} max={metrics.sessions.created90d} muted />
              <FunnelRow label="Started" value={metrics.sessions.started} max={metrics.sessions.created90d} />
              <FunnelRow label="Still open now" value={metrics.sessions.openNow} max={metrics.sessions.created90d} muted />
              <FunnelRow label="Completed" value={metrics.sessions.completed} max={metrics.sessions.created90d} />
              <FunnelRow label="Fully scored" value={metrics.sessions.fullyScored} max={metrics.sessions.created90d} />
            </section>
          </div>

          <section className="pb-admin-panel" style={{ padding: "1rem", display: "grid", gap: "1rem" }}>
            <SectionHeader title="Where DuoRally is played" detail={`Source: ${metrics.geography.source.replace("-", " ")}`} />
            <div style={{ display: "grid", gap: "0.65rem" }}>
              {metrics.geography.topRegions.map((region) => (
                <div key={region.label} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.75rem", alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: "block", fontWeight: 900 }}>{region.label}</strong>
                    <div style={{ marginTop: "0.35rem", height: 8, borderRadius: "var(--r-pill)", background: "var(--surface-sunken)", overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(8, (region.squadCount / Math.max(1, metrics.squads.total)) * 100)}%`, height: "100%", background: "var(--sport-badminton)" }} />
                    </div>
                  </div>
                  <span style={{ color: "var(--text-2)", fontWeight: 850 }}>{region.squadCount} squads · {region.active30d} active</span>
                </div>
              ))}
              {metrics.geography.unknownSquads > 0 && (
                <MetricRow label="Not determined" value={`${metrics.geography.unknownSquads} squads`} />
              )}
              {metrics.geography.topRegions.length === 0 && (
                <p style={{ color: "var(--text-2)" }}>No reliable squad geography yet.</p>
              )}
            </div>
          </section>

          <section className="pb-admin-panel" style={{ overflowX: "auto" }}>
            <div style={{ padding: "1rem" }}>
              <SectionHeader title="Squads that went quiet" detail={`View all ${metrics.quietSquads.length}`} />
            </div>
            <table style={{ width: "100%", minWidth: 660, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: "0.68rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  <Th>Squad</Th><Th>Sessions</Th><Th>Last played</Th><Th>Members</Th><Th>Open</Th>
                </tr>
              </thead>
              <tbody>
                {metrics.quietSquads.map((squad) => (
                  <tr key={squad.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <Td><strong>{squad.name}</strong></Td>
                    <Td>{squad.sessionCount}</Td>
                    <Td>{ago(squad.lastPlayedAtIso)}</Td>
                    <Td>{squad.memberCount}</Td>
                    <Td><Link className="pb-button secondary" href={`/admin/squads/${squad.id}`} style={{ minHeight: 34, padding: "0.45rem 0.65rem" }}>Open</Link></Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {metrics.quietSquads.length === 0 && (
              <p style={{ padding: "0 1rem 1rem", color: "var(--text-2)" }}>No quiet squads in the current sample.</p>
            )}
          </section>
        </div>

        <aside style={{ display: "grid", gap: "1rem" }}>
          <section className="pb-admin-panel" style={{ padding: "1rem", display: "grid", gap: "0.75rem" }}>
            <SectionHeader title="Table views" detail="Inspect records" />
            <QuickLink href="/admin/users" title="People table" body="Accounts, sign-in, disabled status, games." />
            <QuickLink href="/admin/squads" title="Squads table" body="Owners, members, geography, session count." />
            <QuickLink href="/admin/sessions" title="Sessions table" body="Status, venue, courts, RSVP, matches." />
            <QuickLink href="/admin/health" title="Health table" body="Stuck, abandoned, and unscored sessions." />
          </section>

          <section className="pb-admin-panel" style={{ padding: "1rem", display: "grid", gap: "0.75rem" }}>
            <SectionHeader title="When a request arrives" detail="Search first" />
            <p style={{ color: "var(--text-2)", lineHeight: 1.5 }}>
              Start with the name, email, squad, or session code from the message. Diagnose before applying a fix.
            </p>
            <Link className="pb-button" href="/admin/search">Open requests search</Link>
          </section>

          <section className="pb-admin-panel" style={{ padding: "1rem", display: "grid", gap: "0.75rem" }}>
            <SectionHeader title="What support can fix" detail="On the record" />
            <SupportBoundary label="Restore a squad" />
            <SupportBoundary label="Transfer ownership" />
            <SupportBoundary label="Recover session status" />
            <Link className="pb-button secondary" href="/admin/fixes">Open fixes</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SectionHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
      <h3 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.2rem", fontWeight: 900, letterSpacing: 0 }}>{title}</h3>
      <span className="pb-admin-kicker">{detail}</span>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.75rem", paddingTop: "0.65rem", borderTop: "1px solid var(--border)" }}>
      <span style={{ minWidth: 0, color: "var(--text-2)", fontWeight: 750 }}>{label}</span>
      <strong style={{ fontWeight: 900 }}>{value}</strong>
    </div>
  );
}

function FunnelRow({ label, value, max, muted = false }: { label: string; value: number; max: number; muted?: boolean }) {
  return (
    <div style={{ display: "grid", gap: "0.35rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
        <span style={{ color: muted ? "var(--text-3)" : "var(--text-1)", fontWeight: 850 }}>{label}</span>
        <strong>{value.toLocaleString()}</strong>
      </div>
      <div style={{ height: 9, borderRadius: "var(--r-pill)", background: "var(--surface-sunken)", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(value > 0 ? 6 : 0, (value / Math.max(1, max)) * 100)}%`, height: "100%", background: muted ? "var(--warning)" : "var(--emerald-400)" }} />
      </div>
    </div>
  );
}

function QuickLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="pb-admin-card" style={{ display: "grid", gap: "0.2rem", padding: "0.8rem", color: "var(--text-1)", textDecoration: "none" }}>
      <strong style={{ fontWeight: 900 }}>{title}</strong>
      <span style={{ color: "var(--text-2)", fontSize: "0.82rem", lineHeight: 1.4 }}>{body}</span>
    </Link>
  );
}

function SupportBoundary({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", padding: "0.7rem 0", borderTop: "1px solid var(--border)" }}>
      <span style={{ fontWeight: 850 }}>{label}</span>
      <span style={{ padding: "0.25rem 0.5rem", borderRadius: "var(--r-pill)", background: "rgba(198, 241, 53, 0.2)", color: "var(--ink-800)", fontSize: "0.72rem", fontWeight: 900 }}>Audited</span>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th style={{ padding: "0.75rem", whiteSpace: "nowrap" }}>{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td style={{ padding: "0.75rem", verticalAlign: "middle" }}>{children}</td>;
}
