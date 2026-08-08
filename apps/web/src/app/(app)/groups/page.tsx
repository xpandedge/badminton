"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/useAuth";
import { watchUserGroups } from "@/lib/groups/groups";
import { createSquad } from "@/server/squads/actions";

export default function GroupsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    return watchUserGroups(user.uid, setGroups, () => setGroups([]));
  }, [user]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await createSquad({ name, description });
      if (!result.ok) throw new Error(result.message);
      router.push(`/groups/${result.data.squadId}`);
    } catch (err: any) {
      console.error("Error creating squad:", err);
      setError(err.message || "Failed to create squad");
    } finally {
      setIsSubmitting(false);
    }
  };

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
        color: "var(--text-inverse)",
        position: "relative",
        overflow: "hidden",
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
        <div style={{ position: "relative", display: "grid", gap: "1rem" }}>
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
              Squads
            </span>
            <h1 style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.75rem, 5vw, 2.75rem)",
              lineHeight: 1.02,
              textTransform: "uppercase",
              letterSpacing: "-0.025em",
              color: "var(--n-50)",
            }}>
              Your Groups
            </h1>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "0.75rem",
          }}>
            <div style={{
              background: "rgba(246,248,244,0.08)",
              border: "1px solid rgba(246,248,244,0.12)",
              borderRadius: "var(--r-xl)",
              padding: "1rem",
            }}>
              <div style={{ fontFamily: "var(--font-display-tight)", fontSize: "2rem", fontWeight: 900, color: "var(--volt-500)", lineHeight: 1 }}>
                {groups.length}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "rgba(246,248,244,0.55)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>
                Active groups
              </div>
            </div>
            <div style={{
              background: "rgba(246,248,244,0.08)",
              border: "1px solid rgba(246,248,244,0.12)",
              borderRadius: "var(--r-xl)",
              padding: "1rem",
            }}>
              <div style={{ fontFamily: "var(--font-display-tight)", fontSize: "2rem", fontWeight: 900, color: "var(--volt-500)", lineHeight: 1 }}>
                {name.trim() ? "1" : "0"}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "rgba(246,248,244,0.55)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>
                Draft ready
              </div>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div style={{
          background: "var(--danger-bg)",
          color: "var(--danger)",
          border: "1px solid rgba(240,62,62,0.18)",
          borderRadius: "var(--r-lg)",
          padding: "0.875rem 1rem",
          fontWeight: 700,
        }}>
          {error}
        </div>
      )}

      <main style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
        gap: "1rem",
        alignItems: "start",
      }}>
        <section style={{ animation: "pb-rise 400ms 70ms var(--ease-out) both" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.625rem" }}>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6875rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-3)",
            }}>
              Group roster
            </span>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6875rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-3)",
            }}>
              {groups.length} total
            </span>
          </div>

          {groups.length === 0 ? (
            <div style={{
              background: "var(--surface)",
              border: "2px dashed var(--border)",
              borderRadius: "var(--r-xl)",
              padding: "2rem 1.25rem",
              textAlign: "center",
              boxShadow: "var(--shadow-xs)",
            }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: "var(--r-xl)",
                background: "var(--ink-800)",
                color: "var(--volt-500)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 1rem",
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9.5" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.8" />
                  <path d="M16 3.2a4 4 0 0 1 0 7.6" />
                </svg>
              </div>
              <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.375rem", fontWeight: 900, letterSpacing: "-0.02em", marginBottom: "0.375rem" }}>
                No groups yet
              </h2>
              <p style={{ color: "var(--text-2)" }}>Create first group, then add players and sessions.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "0.625rem" }}>
              {groups.map((g, i) => {
                const initial = g.name[0]?.toUpperCase() ?? "?";
                return (
                  <Link
                    key={g.id}
                    data-testid="squad-list-item"
                    href={`/groups/${g.id}`}
                    className="press"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto minmax(0, 1fr) auto",
                      alignItems: "center",
                      gap: "0.875rem",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-xl)",
                      padding: "0.875rem",
                      boxShadow: "var(--shadow-sm)",
                      textDecoration: "none",
                      animation: `pb-rise 400ms ${90 + i * 35}ms var(--ease-out) both`,
                    }}
                  >
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
                      <div style={{ color: "var(--text-1)", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {g.name}
                      </div>
                      <div style={{ color: "var(--text-3)", fontSize: "0.8125rem" }}>Open squad workspace</div>
                    </div>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)",
          padding: "1rem",
          boxShadow: "var(--shadow-sm)",
          animation: "pb-rise 400ms 110ms var(--ease-out) both",
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
                Create Squad
              </h2>
              <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>Start a reusable player roster.</p>
            </div>
          </div>

          <form onSubmit={handleCreateGroup} style={{ display: "grid", gap: "0.75rem" }}>
            <input
              id="name"
              data-testid="squad-name-input"
              className="pb-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name"
              required
            />
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              style={{
                minHeight: 104,
                resize: "vertical",
                padding: "0.875rem 1rem",
                background: "var(--surface-sunken)",
                border: "1.5px solid var(--border)",
                borderRadius: "var(--r-lg)",
                color: "var(--text-1)",
                fontSize: "1rem",
                outline: "none",
              }}
            />
            <button data-testid="squad-create-submit" className="pb-btn pb-btn-volt" type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? "Creating..." : "Create Squad"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
