"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/server/sessions/actions";
import { getOrCreateDefaultSquad } from "@/server/squads/actions";
import { getSportConfig } from "@picklebaddies/domain";
import { watchUserGroups } from "@/lib/groups/groups";
import { useAuth } from "@/lib/auth/useAuth";
import { useSportPreference } from "@/lib/sport/SportPreferenceContext";

const ESTIMATED_GAME_MINUTES = 15;

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        style={{
          width: 44, height: 44, padding: 0,
          borderRadius: "var(--r-lg)",
          border: "1.5px solid var(--border)",
          background: "var(--surface-sunken)",
          color: "var(--text-1)",
          fontSize: 22, fontWeight: 900,
          cursor: "pointer", lineHeight: 1,
          flexShrink: 0,
        }}
      >
        −
      </button>
      <div style={{
        flex: 1,
        textAlign: "center",
        fontFamily: "var(--font-display-tight)",
        fontSize: "1.5rem",
        fontWeight: 900,
        color: "var(--text-1)",
        letterSpacing: "-0.03em",
        padding: "0.5rem 0",
        background: "var(--surface-sunken)",
        borderRadius: "var(--r-lg)",
        border: "1.5px solid var(--border)",
      }}>
        {value}
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        style={{
          width: 44, height: 44, padding: 0,
          borderRadius: "var(--r-lg)",
          border: "none",
          background: "var(--volt-500)",
          color: "var(--ink-800)",
          fontSize: 22, fontWeight: 900,
          cursor: "pointer", lineHeight: 1,
          flexShrink: 0,
          boxShadow: "0 2px 10px rgba(198,241,53,0.35)",
        }}
      >
        +
      </button>
    </div>
  );
}

export default function NewSessionPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { sport: preferredSport, isLoaded: prefLoaded } = useSportPreference();

  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [groupId, setGroupId] = useState("");
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [provisioningSquad, setProvisioningSquad] = useState(false);
  const hasAutoProvisioned = useRef(false);
  const [venueName, setVenueName] = useState("");
  const [courtsText, setCourtsText] = useState("Court 1\nCourt 2");

  const [name, setName] = useState("Saturday Social");
  const [sport, setSport] = useState<"badminton" | "pickleball">("pickleball");
  const [rounds, setRounds] = useState(6);
  const [scoringMode, setScoringMode] = useState<"winner_only" | "points">("points");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sportConfig = getSportConfig(sport);

  // Pre-fill sport from user preference
  useEffect(() => {
    if (prefLoaded && preferredSport) setSport(preferredSport);
  }, [prefLoaded, preferredSport]);

  // Pre-fill scoring mode from sport default
  useEffect(() => {
    setScoringMode(sportConfig.defaultScoringMode as "winner_only" | "points");
  }, [sport]);

  useEffect(() => {
    if (!user) return;
    return watchUserGroups(
      user.uid,
      (gs) => { setGroups(gs); setGroupsLoaded(true); },
      () => { setGroups([]); setGroupsLoaded(true); },
    );
  }, [user]);

  // First-time users have no squad yet — provision one silently so they can
  // start a session with zero setup, same as everyone who already has one.
  useEffect(() => {
    if (!groupsLoaded || groups.length > 0 || hasAutoProvisioned.current) return;
    hasAutoProvisioned.current = true;
    setProvisioningSquad(true);
    getOrCreateDefaultSquad()
      .then((result) => {
        if (result?.ok) setGroupId(result.data.squadId);
      })
      .finally(() => setProvisioningSquad(false));
  }, [groupsLoaded, groups]);

  const courtNames = courtsText
    .split(/[\n,]+/)
    .map((n) => n.trim())
    .filter(Boolean);

  const selectedGroupName = groups.find((g) => g.id === groupId)?.name ?? "—";
  const canCreate = !!user && !!groupId && !!venueName.trim() && courtNames.length > 0 && !!name.trim() && !isSubmitting;
  const durationMinutes = rounds * ESTIMATED_GAME_MINUTES;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const courts = courtNames.map((n, i) => ({ name: n, courtNumber: i + 1 }));
      const result = await createSession({
        squadId: groupId,
        name,
        sport,
        courts,
        players: [],
        durationMinutes,
        estimatedGameMinutes: ESTIMATED_GAME_MINUTES,
        scoringMode,
        venueName,
      });
      if (!result) throw new Error("No response from server — check admin SDK config");
      if (!result.ok) throw new Error(result.message);
      router.push(`/sessions/${result.data.sessionId}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to create session");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "1.25rem 1.25rem 2rem" }}>

      {/* Hero strip */}
      <div style={{
        background: "var(--ink-800)",
        borderRadius: "var(--r-2xl)",
        padding: "1.25rem 1.5rem",
        color: "var(--n-50)",
        marginBottom: "1rem",
        position: "relative",
        overflow: "hidden",
        animation: "pb-rise 320ms var(--ease-out) both",
      }}>
        <div aria-hidden="true" style={{
          position: "absolute", inset: 0,
          backgroundImage: "repeating-linear-gradient(45deg,rgba(198,241,53,0.055) 0 1px,transparent 1px 18px),repeating-linear-gradient(-45deg,rgba(198,241,53,0.055) 0 1px,transparent 1px 18px)",
          pointerEvents: "none",
        }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: "0.5625rem",
              letterSpacing: "0.14em", textTransform: "uppercase",
              color: "var(--volt-500)", marginBottom: "0.375rem",
            }}>New Session</div>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: "clamp(1.5rem,5vw,2rem)",
              fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.025em", lineHeight: 1,
            }}>
              {selectedGroupName !== "—" ? selectedGroupName : "Create Session"}
            </div>
            <div style={{ fontSize: "0.8125rem", color: "rgba(246,248,244,0.55)", marginTop: "0.375rem" }}>
              {rounds} round{rounds !== 1 ? "s" : ""} · {courtNames.length} court{courtNames.length !== 1 ? "s" : ""} · {sport}
            </div>
          </div>
          <div style={{
            width: 48, height: 48, borderRadius: "var(--r-xl)",
            background: "var(--volt-500)", color: "var(--ink-800)",
            display: "grid", placeItems: "center", flexShrink: 0,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v4"/><path d="M16 3v4"/>
              <rect x="3" y="5" width="18" height="16" rx="3"/>
              <path d="M3 10h18"/>
              <path d="M8 15h.01"/><path d="M12 15h.01"/><path d="M16 15h.01"/>
            </svg>
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          background: "var(--danger-bg)", color: "var(--danger)",
          borderRadius: "var(--r-xl)", padding: "0.875rem 1rem",
          fontWeight: 700, marginBottom: "1rem",
          animation: "pb-rise 200ms var(--ease-out) both",
          fontSize: "0.875rem",
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.875rem" }}>

        {/* Where */}
        <section style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)", padding: "1.125rem",
          display: "grid", gap: "0.875rem",
          animation: "pb-rise 360ms 40ms var(--ease-out) both",
        }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: "0.5625rem",
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: "var(--text-3)", marginBottom: "-0.25rem",
          }}>Where</div>

          <label style={{ display: "grid", gap: "0.4rem" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>Group</span>
            {provisioningSquad ? (
              <div className="pb-input" style={{ color: "var(--text-3)", display: "flex", alignItems: "center" }}>
                Setting up your squad…
              </div>
            ) : (
              <select data-testid="session-group-select" className="pb-input" value={groupId} onChange={e => setGroupId(e.target.value)} required>
                <option value="">Select a group…</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
          </label>

          <label style={{ display: "grid", gap: "0.4rem" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>Venue</span>
            <input data-testid="session-venue-input" className="pb-input" value={venueName} onChange={e => setVenueName(e.target.value)} placeholder="Community Sports Hall" required />
          </label>

          <label style={{ display: "grid", gap: "0.4rem" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>Courts</span>
            <textarea
              data-testid="session-courts-input"
              className="pb-input"
              value={courtsText}
              onChange={e => setCourtsText(e.target.value)}
              rows={3}
              placeholder={"Court 1\nCourt 2"}
              required
              style={{ resize: "vertical", lineHeight: 1.45 }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
              {courtNames.map((c) => (
                <span key={c} style={{
                  padding: "3px 9px", borderRadius: "var(--r-pill)",
                  background: "var(--volt-500)", color: "var(--ink-800)",
                  fontSize: "0.6875rem", fontWeight: 800,
                }}>{c}</span>
              ))}
            </div>
          </label>
        </section>

        {/* What */}
        <section style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)", padding: "1.125rem",
          display: "grid", gap: "0.875rem",
          animation: "pb-rise 360ms 80ms var(--ease-out) both",
        }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: "0.5625rem",
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: "var(--text-3)", marginBottom: "-0.25rem",
          }}>What</div>

          <label style={{ display: "grid", gap: "0.4rem" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>Session name</span>
            <input data-testid="session-name-input" className="pb-input" value={name} onChange={e => setName(e.target.value)} required />
          </label>

          {/* Sport */}
          <div style={{ display: "grid", gap: "0.4rem" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>Sport</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              {(["pickleball", "badminton"] as const).map((s) => (
                <button
                  key={s}
                  data-testid={`session-sport-${s}`}
                  type="button"
                  onClick={() => setSport(s)}
                  style={{
                    padding: "0.625rem",
                    borderRadius: "var(--r-lg)",
                    border: sport === s ? "2px solid var(--ink-800)" : "1.5px solid var(--border)",
                    background: sport === s ? "var(--ink-800)" : "var(--surface-sunken)",
                    color: sport === s ? "var(--volt-500)" : "var(--text-2)",
                    fontWeight: 900, textTransform: "capitalize", cursor: "pointer",
                    fontSize: "0.875rem", letterSpacing: "-0.01em",
                  }}
                >{s}</button>
              ))}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-3)", letterSpacing: "0.05em" }}>
              Default target: <strong>{sportConfig.defaultTargetScore} pts</strong>
            </div>
          </div>

          {/* Scoring */}
          <label style={{ display: "grid", gap: "0.4rem" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>Scoring</span>
            <select className="pb-input" value={scoringMode} onChange={e => setScoringMode(e.target.value as "winner_only" | "points")}>
              <option value="points">Points</option>
              <option value="winner_only">Winner only</option>
            </select>
          </label>
        </section>

        {/* Schedule */}
        <section style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)", padding: "1.125rem",
          display: "grid", gap: "0.875rem",
          animation: "pb-rise 360ms 120ms var(--ease-out) both",
        }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: "0.5625rem",
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: "var(--text-3)", marginBottom: "-0.25rem",
          }}>Schedule</div>

          <div style={{ display: "grid", gap: "0.4rem" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>Rounds</span>
            <Stepper value={rounds} min={1} max={20} onChange={setRounds} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-3)", letterSpacing: "0.05em" }}>
              ~{durationMinutes} min total · {ESTIMATED_GAME_MINUTES} min per game
            </div>
          </div>

          {/* Quick presets */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.375rem" }}>
            {[3, 4, 6, 8].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRounds(r)}
                style={{
                  height: 36,
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border)",
                  background: rounds === r ? "var(--volt-500)" : "var(--surface-sunken)",
                  color: rounds === r ? "var(--ink-800)" : "var(--text-2)",
                  fontWeight: 800, fontSize: "0.8125rem",
                  cursor: "pointer",
                }}
              >{r}r</button>
            ))}
          </div>
        </section>

        <button
          data-testid="session-create-submit"
          className="pb-btn pb-btn-volt"
          type="submit"
          disabled={!canCreate}
          style={{ marginTop: "0.25rem", animation: "pb-rise 360ms 160ms var(--ease-out) both" }}
        >
          {isSubmitting ? "Creating…" : `Create ${rounds}-round Session →`}
        </button>

      </form>
    </div>
  );
}
