"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isSuperAdminEmail } from "@picklebaddies/domain";
import { useAuth } from "@/lib/auth/useAuth";
import { addTeamOwnerByEmail, createTeam, watchAllGroups } from "@/lib/groups/groups";

type TeamRow = { id: string; name: string; memberIds: string[] };

export default function AdminPage() {
  const { user } = useAuth();
  const isSuperAdmin = isSuperAdminEmail(user?.email);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamName, setTeamName] = useState("");
  const [ownerEmails, setOwnerEmails] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    return watchAllGroups(
      setTeams,
      () => {
        setTeams([]);
        setError("Super admin permission denied. Refresh after deployment; if it persists, sign out and sign back in.");
      },
    );
  }, [isSuperAdmin]);

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!teamName.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const id = await createTeam({ name: teamName.trim() });
      setTeamName("");
      setMessage(`Team created: ${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddOwner(e: React.FormEvent, teamId: string) {
    e.preventDefault();
    const email = ownerEmails[teamId]?.trim();
    if (!email) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await addTeamOwnerByEmail(teamId, email);
      setOwnerEmails((prev) => ({ ...prev, [teamId]: "" }));
      setMessage(`${email} is now a team owner.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add owner.");
    } finally {
      setBusy(false);
    }
  }

  if (!isSuperAdmin) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "1.25rem 1.25rem 2rem" }}>
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)",
          padding: "1.5rem",
          boxShadow: "var(--shadow-sm)",
        }}>
          <span style={{
            display: "inline-flex",
            fontFamily: "var(--font-mono)",
            fontSize: "0.6875rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--text-3)",
            marginBottom: "0.75rem",
          }}>
            Super Admin
          </span>
          <h1 style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.5rem",
            lineHeight: 1.05,
            textTransform: "uppercase",
            letterSpacing: "-0.02em",
            marginBottom: "0.5rem",
          }}>
            Access locked
          </h1>
          <p style={{ color: "var(--text-2)" }}>This area is only available to configured super admins.</p>
        </div>
      </div>
    );
  }

  const totalOwners = teams.reduce((count, team) => count + team.memberIds.length, 0);

  return (
    <div style={{
      maxWidth: 960,
      margin: "0 auto",
      padding: "1.25rem 1.25rem 2rem",
      display: "flex",
      flexDirection: "column",
      gap: "1rem",
    }}>
      <section style={{
        background: "var(--ink-800)",
        borderRadius: "var(--r-2xl)",
        padding: "1.5rem",
        position: "relative",
        overflow: "hidden",
        color: "var(--text-inverse)",
        animation: "pb-rise 400ms var(--ease-out) both",
      }}>
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(198,241,53,0.055) 0 1px, transparent 1px 18px), repeating-linear-gradient(-45deg, rgba(198,241,53,0.055) 0 1px, transparent 1px 18px)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", display: "grid", gap: "1.25rem" }}>
          <div>
            <span style={{
              display: "inline-flex",
              padding: "3px 10px",
              borderRadius: "var(--r-pill)",
              background: "var(--volt-500)",
              color: "var(--ink-800)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.625rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "0.875rem",
            }}>
              Owner control
            </span>
            <h1 style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.75rem, 5vw, 2.75rem)",
              lineHeight: 1.02,
              textTransform: "uppercase",
              letterSpacing: "-0.025em",
              color: "var(--n-50)",
            }}>
              Super Admin
            </h1>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "0.75rem",
          }}>
            <div style={{
              background: "rgba(246,248,244,0.08)",
              border: "1px solid rgba(246,248,244,0.12)",
              borderRadius: "var(--r-xl)",
              padding: "1rem",
            }}>
              <div style={{ fontFamily: "var(--font-display-tight)", fontSize: "2rem", fontWeight: 900, color: "var(--volt-500)", lineHeight: 1 }}>
                {teams.length}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "rgba(246,248,244,0.55)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>
                Teams
              </div>
            </div>
            <div style={{
              background: "rgba(246,248,244,0.08)",
              border: "1px solid rgba(246,248,244,0.12)",
              borderRadius: "var(--r-xl)",
              padding: "1rem",
            }}>
              <div style={{ fontFamily: "var(--font-display-tight)", fontSize: "2rem", fontWeight: 900, color: "var(--volt-500)", lineHeight: 1 }}>
                {totalOwners}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "rgba(246,248,244,0.55)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>
                Members
              </div>
            </div>
          </div>
        </div>
      </section>

      {(message || error) && (
        <div style={{
          background: error ? "var(--danger-bg)" : "var(--success-bg)",
          color: error ? "var(--danger)" : "var(--success)",
          border: `1px solid ${error ? "rgba(240,62,62,0.18)" : "rgba(10,143,91,0.18)"}`,
          borderRadius: "var(--r-lg)",
          padding: "0.875rem 1rem",
          fontWeight: 700,
        }}>
          {error ?? message}
        </div>
      )}

      <main style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
        gap: "1rem",
        alignItems: "start",
      }}>
        <section style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)",
          padding: "1rem",
          boxShadow: "var(--shadow-sm)",
          animation: "pb-rise 400ms 70ms var(--ease-out) both",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: "var(--r-lg)",
              background: "var(--volt-500)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-800)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </div>
            <div>
              <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
                Create Team
              </h2>
              <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>Set up team shell, assign owner next.</p>
            </div>
          </div>

          <form onSubmit={handleCreateTeam} style={{ display: "grid", gap: "0.75rem" }}>
            <input
              className="pb-input"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Team name"
              required
            />
            <button className="pb-btn pb-btn-volt" type="submit" disabled={busy || !teamName.trim()}>
              Create Team
            </button>
          </form>
        </section>

        <section style={{ animation: "pb-rise 400ms 110ms var(--ease-out) both" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.625rem" }}>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6875rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-3)",
            }}>
              Teams
            </span>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6875rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-3)",
            }}>
              {teams.length} total
            </span>
          </div>

          <div style={{ display: "grid", gap: "0.625rem" }}>
            {teams.map((team, i) => {
              const initial = team.name[0]?.toUpperCase() ?? "?";
              const ownerEmail = ownerEmails[team.id] ?? "";
              return (
                <article
                  key={team.id}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-xl)",
                    padding: "0.875rem",
                    boxShadow: "var(--shadow-sm)",
                    animation: `pb-rise 400ms ${130 + i * 35}ms var(--ease-out) both`,
                  }}
                >
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "auto minmax(0, 1fr)",
                    gap: "0.875rem",
                    alignItems: "center",
                    marginBottom: "0.875rem",
                  }}>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: "var(--r-lg)",
                      background: "var(--ink-800)",
                      color: "var(--volt-500)",
                      display: "grid",
                      placeItems: "center",
                      fontFamily: "var(--font-display-tight)",
                      fontWeight: 900,
                      fontSize: "1.125rem",
                    }}>
                      {initial}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Link
                        href={`/groups/${team.id}`}
                        style={{
                          display: "block",
                          color: "var(--text-1)",
                          fontWeight: 800,
                          fontSize: "1rem",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {team.name}
                      </Link>
                      <span style={{ color: "var(--text-3)", fontSize: "0.8125rem" }}>
                        {team.memberIds.length} {team.memberIds.length === 1 ? "member" : "members"}
                      </span>
                    </div>
                  </div>

                  <form
                    onSubmit={(e) => handleAddOwner(e, team.id)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
                      gap: "0.5rem",
                    }}
                  >
                    <input
                      className="pb-input"
                      type="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmails((prev) => ({ ...prev, [team.id]: e.target.value }))}
                      placeholder="Owner email"
                      required
                      style={{ height: 44, borderRadius: "var(--r-md)" }}
                    />
                    <button
                      type="submit"
                      disabled={busy || !ownerEmail.trim()}
                      style={{
                        height: 44,
                        padding: "0 1rem",
                        border: "none",
                        borderRadius: "var(--r-md)",
                        background: "var(--ink-800)",
                        color: "var(--volt-500)",
                        fontWeight: 800,
                        cursor: busy || !ownerEmail.trim() ? "not-allowed" : "pointer",
                        opacity: busy || !ownerEmail.trim() ? 0.55 : 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Add Owner
                    </button>
                  </form>
                </article>
              );
            })}

            {teams.length === 0 && (
              <div style={{
                background: "var(--surface)",
                border: "2px dashed var(--border)",
                borderRadius: "var(--r-xl)",
                padding: "2rem 1.25rem",
                textAlign: "center",
              }}>
                <h3 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, marginBottom: "0.375rem" }}>
                  No teams yet
                </h3>
                <p style={{ color: "var(--text-2)" }}>Create first team, then assign its owner.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
