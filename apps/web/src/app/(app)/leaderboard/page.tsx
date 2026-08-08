import { getAdminDb } from "@/server/firebase/admin";
import { verifySession } from "@/server/auth/dal";
import { redirect } from "next/navigation";

interface PlayerRow {
  uid: string;
  displayName: string;
  isGuest: boolean;
  totalGames: number;
  totalWins: number;
  totalLosses: number;
  totalPointDiff: number;
  totalPointsFor: number;
  totalPointsAgainst: number;
}

async function getLeaderboard(): Promise<PlayerRow[]> {
  const db = getAdminDb();
  const snap = await db
    .collection("players")
    .orderBy("totalWins", "desc")
    .orderBy("totalPointDiff", "desc")
    .orderBy("totalGames", "desc")
    .limit(100)
    .get();

  return snap.docs
    .map((d) => ({ uid: d.id, ...(d.data() as Omit<PlayerRow, "uid">) }))
    .filter((p) => p.totalGames > 0);
}

export default async function LeaderboardPage() {
  const session = await verifySession();
  if (!session) redirect("/sign-in");

  const rows = await getLeaderboard();

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "1.25rem 1.25rem 2rem" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(1.75rem, 6vw, 3rem)",
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "-0.03em",
          lineHeight: 1,
          marginBottom: "0.375rem",
        }}>
          Leaderboard
        </h1>
        <p style={{ color: "var(--text-2)", fontSize: "0.9375rem" }}>
          All-time standings across every session and squad.
        </p>
      </div>

      {rows.length === 0 ? (
        <div style={{
          border: "2px dashed var(--border)",
          borderRadius: "var(--r-xl)",
          padding: "2.5rem 1.5rem",
          textAlign: "center",
        }}>
          <p style={{ color: "var(--text-2)" }}>No games played yet. Start a session to see stats here.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {/* Header row */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "2rem minmax(0,1fr) repeat(4, 4rem)",
            gap: "0.5rem",
            padding: "0.5rem 0.75rem",
            fontFamily: "var(--font-mono)",
            fontSize: "0.625rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}>
            <span>#</span>
            <span>Player</span>
            <span style={{ textAlign: "right" }}>W</span>
            <span style={{ textAlign: "right" }}>L</span>
            <span style={{ textAlign: "right" }}>GP</span>
            <span style={{ textAlign: "right" }}>PD</span>
          </div>

          {rows.map((row, idx) => {
            const isTop3 = idx < 3;
            const medalColor = idx === 0 ? "var(--volt-500)" : idx === 1 ? "#c0c0c0" : "#cd7f32";
            return (
              <div
                key={row.uid}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2rem minmax(0,1fr) repeat(4, 4rem)",
                  gap: "0.5rem",
                  alignItems: "center",
                  padding: "0.875rem 0.75rem",
                  borderRadius: "var(--r-xl)",
                  border: "1px solid var(--border)",
                  background: idx === 0 ? "rgba(198,241,53,0.1)" : "var(--surface)",
                  boxShadow: isTop3 ? "var(--shadow-sm)" : "none",
                  animation: `pb-rise ${300 + idx * 30}ms var(--ease-out) both`,
                }}
              >
                <span style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: isTop3 ? medalColor : "var(--surface-sunken)",
                  color: idx === 0 ? "var(--ink-800)" : "var(--text-2)",
                  display: "grid",
                  placeItems: "center",
                  fontFamily: "var(--font-display-tight)",
                  fontWeight: 900,
                  fontSize: "0.8125rem",
                }}>
                  {idx + 1}
                </span>

                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontWeight: 900,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: idx === 0 ? "var(--ink-800)" : "var(--text-1)",
                    mixBlendMode: idx === 0 ? "normal" : undefined,
                  }}>
                    {row.displayName || "Unknown"}
                  </div>
                  {row.isGuest && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.5625rem", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Guest
                    </div>
                  )}
                </div>

                <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 900, color: "var(--volt-600)" }}>
                  {row.totalWins}
                </span>
                <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>
                  {row.totalLosses}
                </span>
                <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>
                  {row.totalGames}
                </span>
                <span style={{
                  textAlign: "right",
                  fontFamily: "var(--font-mono)",
                  color: row.totalPointDiff > 0 ? "var(--volt-600)" : row.totalPointDiff < 0 ? "var(--danger)" : "var(--text-3)",
                }}>
                  {row.totalPointDiff > 0 ? "+" : ""}{row.totalPointDiff}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p style={{
        marginTop: "1.5rem",
        fontFamily: "var(--font-mono)",
        fontSize: "0.625rem",
        color: "var(--text-3)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        textAlign: "center",
      }}>
        W = Wins · L = Losses · GP = Games Played · PD = Point Diff
      </p>
    </div>
  );
}
