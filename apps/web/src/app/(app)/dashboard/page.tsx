"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isSuperAdminEmail } from "@picklebaddies/domain";
import { useAuth } from "@/lib/auth/useAuth";
import { watchUserGroups } from "@/lib/groups/groups";
import { getMySessionsAction, type SessionSummaryData } from "@/server/sessions/actions";

type Group = { id: string; name: string };

export default function DashboardPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [mySessions, setMySessions] = useState<{ organising: SessionSummaryData[]; playing: SessionSummaryData[] } | null>(null);
  const [sessionsTab, setSessionsTab] = useState<"organising" | "playing">("organising");

  const displayName = user?.displayName ?? user?.email ?? "Baddie";
  const firstName = displayName.split(/[\s@]/)[0];
  const isSuperAdmin = isSuperAdminEmail(user?.email);

  useEffect(() => {
    if (!user) return;
    const unsub = watchUserGroups(
      user.uid,
      (g) => {
        setGroups(g);
        setGroupsLoaded(true);
      },
      () => {
        setGroups([]);
        setGroupsLoaded(true);
      },
    );
    void getMySessionsAction().then((r) => { if (r.ok) setMySessions(r.data); }).catch(() => {});
    return unsub;
  }, [user?.uid]);

  return (
    <div style={{
      maxWidth: 480,
      margin: "0 auto",
      padding: "1.25rem 1.25rem 2rem",
      display: "flex",
      flexDirection: "column",
      gap: "1rem",
    }}>
      {/* Ink hero */}
      <div
        style={{
          background: "var(--ink-800)",
          borderRadius: "var(--r-2xl)",
          padding: "1.75rem 2rem",
          position: "relative",
          overflow: "hidden",
          animation: "pb-rise 400ms var(--ease-out) both",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(198,241,53,0.05) 0 1px, transparent 1px 18px), repeating-linear-gradient(-45deg, rgba(198,241,53,0.05) 0 1px, transparent 1px 18px)",
            pointerEvents: "none",
          }}
        />
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "3px 10px",
          borderRadius: "var(--r-pill)",
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          background: "var(--volt-500)",
          color: "var(--ink-800)",
          marginBottom: "1rem",
        }}>
          Ready to play
        </span>
        <div style={{
          fontFamily: "var(--font-display)",
          fontWeight: 900,
          fontSize: "clamp(1.75rem, 7vw, 2.25rem)",
          color: "var(--n-50)",
          textTransform: "uppercase",
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
        }}>
          Hey, {firstName}.
        </div>
        <div style={{
          marginTop: "1rem",
          display: "flex",
          gap: "1.5rem",
        }}>
          <div>
            <div style={{
              fontFamily: "var(--font-display-tight)",
              fontWeight: 900,
              fontSize: "1.75rem",
              color: "var(--volt-500)",
              lineHeight: 1,
            }}>
              {groupsLoaded ? groups.length : "—"}
            </div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.625rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "rgba(246,248,244,0.4)",
              marginTop: 2,
            }}>
              {groups.length === 1 ? "Squad" : "Squads"}
            </div>
          </div>
        </div>
      </div>

      {/* New session CTA */}
      {isSuperAdmin && (
        <Link
          href="/admin"
          className="pb-btn pb-btn-secondary"
          style={{ textDecoration: "none", justifyContent: "center" }}
        >
          Super Admin
        </Link>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.625rem", animation: "pb-rise 400ms 60ms var(--ease-out) both" }}>
        <Link
          href="/sessions/new"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            background: "var(--volt-500)",
            color: "var(--ink-800)",
            borderRadius: "var(--r-xl)",
            padding: "1rem",
            fontFamily: "var(--font-display)",
            fontWeight: 900,
            fontSize: "1rem",
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
            textDecoration: "none",
            boxShadow: "0 4px 24px rgba(198,241,53,0.35)",
            transition: "transform 80ms, box-shadow 80ms",
          }}
          className="press"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Start a session
        </Link>
        <Link
          href="/leaderboard"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.375rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text-1)",
            borderRadius: "var(--r-xl)",
            padding: "1rem 1.25rem",
            fontFamily: "var(--font-display)",
            fontWeight: 900,
            fontSize: "0.9375rem",
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          Rankings
        </Link>
      </div>

      {/* Your squads */}
      <div style={{ animation: "pb-rise 400ms 100ms var(--ease-out) both" }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.625rem",
        }}>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.6875rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}>
            Your squads
          </span>
          <Link
            href="/groups"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6875rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--volt-500)",
              textDecoration: "none",
            }}
          >
            + New
          </Link>
        </div>

        {!groupsLoaded ? (
          <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-xl)",
            padding: "1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              color: "var(--text-3)",
              letterSpacing: "0.05em",
            }}>Loading squads…</span>
          </div>
        ) : groups.length === 0 ? (
          <div style={{
            background: "var(--surface)",
            border: "2px dashed var(--border)",
            borderRadius: "var(--r-xl)",
            padding: "2rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.75rem",
            textAlign: "center",
          }}>
            <span style={{ fontSize: "2rem" }}>🏸</span>
            <p style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.9375rem",
              color: "var(--text-2)",
              lineHeight: 1.5,
              margin: 0,
            }}>
              No squads yet. Create one and invite your crew.
            </p>
            <Link
              href="/groups"
              className="pb-btn pb-btn-secondary"
              style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}
            >
              Create a squad →
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {groups.map((g, i) => {
              const initial = g.name[0]?.toUpperCase() ?? "?";
              return (
                <Link
                  key={g.id}
                  href={`/groups/${g.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.875rem",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-xl)",
                    padding: "0.875rem 1rem",
                    textDecoration: "none",
                    boxShadow: "var(--shadow-sm)",
                    animation: `pb-rise 400ms ${100 + i * 40}ms var(--ease-out) both`,
                    transition: "transform 80ms",
                  }}
                  className="press"
                >
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: "var(--r-lg)",
                    background: "var(--ink-800)",
                    display: "grid",
                    placeItems: "center",
                    fontFamily: "var(--font-display-tight)",
                    fontWeight: 900,
                    fontSize: "1.0625rem",
                    color: "var(--volt-500)",
                    flexShrink: 0,
                  }}>
                    {initial}
                  </div>
                  <span style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 600,
                    fontSize: "0.9375rem",
                    color: "var(--text-1)",
                    flex: 1,
                  }}>
                    {g.name}
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* My Sessions */}
      <div style={{ animation: "pb-rise 400ms 140ms var(--ease-out) both" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.625rem" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
            My sessions
          </span>
          <div style={{ display: "flex", gap: "0.375rem" }}>
            {(["organising", "playing"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSessionsTab(tab)}
                style={{
                  height: 28,
                  padding: "0 0.625rem",
                  border: "none",
                  borderRadius: "var(--r-pill)",
                  background: sessionsTab === tab ? "var(--ink-800)" : "var(--surface)",
                  color: sessionsTab === tab ? "var(--volt-500)" : "var(--text-3)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.5625rem",
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {!mySessions ? (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.25rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-3)" }}>Loading…</span>
          </div>
        ) : (mySessions[sessionsTab].length === 0) ? (
          <div style={{ background: "var(--surface)", border: "2px dashed var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem", textAlign: "center" }}>
            <p style={{ color: "var(--text-2)", fontSize: "0.9375rem" }}>
              {sessionsTab === "organising"
                ? "No sessions yet."
                : "You haven't joined any sessions yet."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {mySessions[sessionsTab]
              .sort((a, b) => (a.status === "active" ? -1 : b.status === "active" ? 1 : 0))
              .map((s, i) => {
                const statusTone = s.status === "active"
                  ? { bg: "var(--volt-500)", fg: "var(--ink-800)" }
                  : s.status === "completed"
                    ? { bg: "var(--emerald-100)", fg: "var(--emerald-700)" }
                    : { bg: "var(--surface-sunken)", fg: "var(--text-3)" };
                const ts = s.startsAt ? new Date(s.startsAt).toLocaleDateString() : "";
                const href = sessionsTab === "organising"
                  ? `/sessions/${s.id}/live`
                  : `/sessions/${s.id}/player`;
                return (
                  <a
                    key={s.id}
                    data-testid="session-list-item"
                    href={href}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      alignItems: "center",
                      gap: "0.75rem",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-xl)",
                      padding: "0.875rem 1rem",
                      textDecoration: "none",
                      boxShadow: "var(--shadow-sm)",
                      animation: `pb-rise 400ms ${140 + i * 30}ms var(--ease-out) both`,
                    }}
                  >
                    <span style={{ padding: "2px 7px", borderRadius: "var(--r-pill)", background: statusTone.bg, color: statusTone.fg, fontFamily: "var(--font-mono)", fontSize: "0.5625rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                      {s.status}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text-1)" }}>{s.name}</div>
                      {ts && <div style={{ color: "var(--text-3)", fontSize: "0.8125rem" }}>{s.venueName} · {ts}</div>}
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </a>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
