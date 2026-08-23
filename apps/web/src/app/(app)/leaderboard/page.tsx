import Link from "next/link";
import { verifySession } from "@/server/auth/dal";
import { redirect } from "next/navigation";

export default async function LeaderboardPage() {
  const session = await verifySession();
  if (!session) redirect("/sign-in");

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "1.25rem 1.25rem 2rem" }}>
      <section style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-xl)",
        padding: "1.5rem",
        boxShadow: "var(--shadow-sm)",
        display: "grid",
        gap: "0.875rem",
      }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.625rem",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--text-3)",
        }}>
          Rankings retired
        </span>
        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(1.75rem, 6vw, 3rem)",
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "-0.03em",
          lineHeight: 1,
        }}>
          Use session results instead
        </h1>
        <p style={{ color: "var(--text-2)", lineHeight: 1.55 }}>
          The all-time ranking has been removed because it mixed results from different sports. Open a session or squad to see results in the right context.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem" }}>
          <Link className="pb-btn pb-btn-volt" href="/dashboard" style={{ width: "auto", minHeight: 44, padding: "0 1rem" }}>
            Home
          </Link>
          <Link className="pb-btn pb-btn-ghost" href="/groups" style={{ width: "auto", minHeight: 44, padding: "0 1rem" }}>
            Squads
          </Link>
        </div>
      </section>
    </div>
  );
}
