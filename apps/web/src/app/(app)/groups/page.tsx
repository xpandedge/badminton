"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/useAuth";
import { watchUserGroups } from "@/lib/groups/groups";
import { createSquad, joinSquadByCode, searchSquads, requestToJoinSquad, type SquadSearchResult } from "@/server/squads/actions";

export default function GroupsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Join a squad — invite code + name search
  const [joinCode, setJoinCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [squadQuery, setSquadQuery] = useState("");
  const [squadResults, setSquadResults] = useState<SquadSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [requestedIds, setRequestedIds] = useState<Record<string, boolean>>({});
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || joinBusy) return;
    setJoinBusy(true);
    setJoinError(null);
    const res = await joinSquadByCode(joinCode).catch(() => null);
    setJoinBusy(false);
    if (!res || !res.ok) { setJoinError(res?.message ?? "Could not join. Check the code."); return; }
    router.push(`/groups/${res.data.squadId}`);
  };

  const runSquadSearch = (q: string) => {
    setSquadQuery(q);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (q.trim().length < 2) { setSquadResults([]); return; }
    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      const res = await searchSquads(q).catch(() => null);
      setSearching(false);
      if (res?.ok) setSquadResults(res.data);
    }, 300);
  };

  const handleRequest = async (squadId: string) => {
    setRequestedIds((prev) => ({ ...prev, [squadId]: true }));
    const res = await requestToJoinSquad(squadId).catch(() => null);
    if (res?.ok && res.data.status === "joined") router.push(`/groups/${squadId}`);
  };

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
          display: "grid", gap: "1rem", alignContent: "start",
          animation: "pb-rise 400ms 110ms var(--ease-out) both",
        }}>

        {/* Join a squad */}
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)", padding: "1rem", boxShadow: "var(--shadow-sm)",
        }}>
          <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em" }}>Join a squad</h2>
          <p style={{ color: "var(--text-3)", fontSize: "0.875rem", marginBottom: "0.875rem" }}>Have a code, or find one by name.</p>

          <form onSubmit={handleJoinByCode} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.5rem", marginBottom: "0.875rem" }}>
            <input
              className="pb-input"
              value={joinCode}
              onChange={(e) => { setJoinCode(e.target.value); setJoinError(null); }}
              placeholder="Invite code"
              style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}
            />
            <button type="submit" disabled={!joinCode.trim() || joinBusy} className="pb-btn pb-btn-volt" style={{ width: "auto", padding: "0 1.25rem" }}>
              {joinBusy ? "…" : "Join"}
            </button>
          </form>
          {joinError && <p style={{ color: "var(--danger)", fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.5rem" }}>{joinError}</p>}

          <div className="pb-divider" style={{ margin: "0.5rem 0" }}>or search</div>

          <input
            className="pb-input"
            value={squadQuery}
            onChange={(e) => runSquadSearch(e.target.value)}
            placeholder="Search squads by name…"
          />
          {squadQuery.trim().length >= 2 && (
            <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.625rem" }}>
              {searching && <p style={{ color: "var(--text-3)", fontSize: "0.8125rem", fontFamily: "var(--font-mono)" }}>Searching…</p>}
              {!searching && squadResults.length === 0 && <p style={{ color: "var(--text-3)", fontSize: "0.8125rem" }}>No squads match that name.</p>}
              {squadResults.map((s) => {
                const requested = s.relation === "requested" || requestedIds[s.squadId];
                return (
                  <div key={s.squadId} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.5rem", alignItems: "center", background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "0.625rem 0.75rem" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                      <div style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>{s.memberCount} member{s.memberCount !== 1 ? "s" : ""}</div>
                    </div>
                    {s.relation === "member" ? (
                      <Link href={`/groups/${s.squadId}`} className="pb-btn pb-btn-ghost" style={{ width: "auto", padding: "0 0.875rem", height: 36, fontSize: "0.8125rem" }}>Open</Link>
                    ) : requested ? (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)", padding: "0 0.5rem" }}>Requested</span>
                    ) : (
                      <button onClick={() => handleRequest(s.squadId)} style={{ height: 36, padding: "0 0.875rem", border: "none", borderRadius: "var(--r-md)", background: "var(--ink-800)", color: "var(--volt-500)", fontWeight: 900, cursor: "pointer", fontSize: "0.8125rem" }}>Request</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Create squad */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)",
          padding: "1rem",
          boxShadow: "var(--shadow-sm)",
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
        </div>
        </section>
      </main>
    </div>
  );
}
