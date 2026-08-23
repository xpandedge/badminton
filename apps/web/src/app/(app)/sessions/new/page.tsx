"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSession } from "@/server/sessions/actions";
import { getOrCreateDefaultSquad } from "@/server/squads/actions";
import { getSportConfig } from "@picklebaddies/domain";
import { watchUserGroups } from "@/lib/groups/groups";
import { watchVenues, watchCourts } from "@/lib/groups/venues";
import { useAuth } from "@/lib/auth/useAuth";
import { useSportPreference } from "@/lib/sport/SportPreferenceContext";

const ESTIMATED_GAME_MINUTES = 15;
const SPORT_CHOICES = [
  {
    value: "pickleball",
    label: "Pickleball",
    detail: "Games usually target 11 points.",
  },
  {
    value: "badminton",
    label: "Badminton",
    detail: "Games usually target 21 points.",
  },
] as const;

export default function NewSessionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { sport: preferredSport, isLoaded: prefLoaded, openPicker } = useSportPreference();

  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [groupId, setGroupId] = useState("");
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [provisioningSquad, setProvisioningSquad] = useState(false);
  const hasAutoProvisioned = useRef(false);
  const [venueName, setVenueName] = useState("");
  const [courtsText, setCourtsText] = useState("Court 1\nCourt 2");

  const [name, setName] = useState("");
  const [sport, setSport] = useState<"badminton" | "pickleball">("pickleball");
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [scheduledTime, setScheduledTime] = useState("");
  const [scoringMode, setScoringMode] = useState<"winner_only" | "points">("points");
  const [sessionFormat, setSessionFormat] = useState<"social_rotation" | "fixed_pair_round_robin">("social_rotation");
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

  const [savedVenues, setSavedVenues] = useState<Array<{ id: string; name: string; isHome?: boolean }>>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    return watchUserGroups(
      user.uid,
      (gs) => { setGroups(gs); setGroupsLoaded(true); },
      () => { setGroups([]); setGroupsLoaded(true); },
    );
  }, [user]);

  useEffect(() => {
    const requestedGroupId = searchParams.get("groupId");
    if (groupsLoaded && requestedGroupId && groups.some((group) => group.id === requestedGroupId)) {
      setGroupId(requestedGroupId);
    }
  }, [groups, groupsLoaded, searchParams]);

  // When selected squad changes, watch its venues and auto-prefill Home Venue
  useEffect(() => {
    if (!groupId) { setSavedVenues([]); return; }
    return watchVenues(groupId, (venues) => {
      setSavedVenues(venues);
      if (venues.length > 0) {
        const home = venues.find(v => v.isHome) ?? venues[0]!;
        setSelectedVenueId(home.id);
        setVenueName(home.name);
      }
    });
  }, [groupId]);

  // When selected venue changes, watch its saved courts to auto-fill Courts field
  useEffect(() => {
    if (!groupId || !selectedVenueId || selectedVenueId === "custom") return;
    return watchCourts(groupId, selectedVenueId, (courts) => {
      if (courts.length > 0) {
        const courtList = courts.map((c: any) => c.name ?? `Court ${c.courtNumber ?? ""}`).filter(Boolean);
        if (courtList.length > 0) setCourtsText(courtList.join("\n"));
      }
    });
  }, [groupId, selectedVenueId]);

  const courtNames = courtsText
    .split(/[\n,]+/)
    .map((n) => n.trim())
    .filter(Boolean);

  const selectedGroupName = groups.find((g) => g.id === groupId)?.name ?? "—";
  const canCreate = !!user && !!groupId && !!venueName.trim() && courtNames.length > 0 && !!name.trim() && !isSubmitting;
  const selectedSport = SPORT_CHOICES.find((item) => item.value === sport) ?? SPORT_CHOICES[0];
  const sportLabel = selectedSport.label;

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
        sessionFormat,
        venueName,
        startsAtIso: scheduledTime ? new Date(scheduledTime).toISOString() : undefined,
      });
      if (!result) throw new Error("No response from server — check admin SDK config");
      if (!result.ok) throw new Error(result.message);
      router.push(`/sessions/${result.data.sessionId}/live`);
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
              {durationMinutes} min · {courtNames.length} court{courtNames.length !== 1 ? "s" : ""} · {sportLabel}
              {sessionFormat === "fixed_pair_round_robin" ? " · round robin" : ""}
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
          }}>Venue & Courts</div>

          <label style={{ display: "grid", gap: "0.4rem" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>Squad</span>
            {provisioningSquad ? (
              <div className="pb-input" style={{ color: "var(--text-3)", display: "flex", alignItems: "center" }}>
                Setting up your squad…
              </div>
            ) : (
              <select data-testid="session-group-select" className="pb-input" value={groupId} onChange={e => setGroupId(e.target.value)} required>
                <option value="">Select a squad…</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
          </label>

          <label style={{ display: "grid", gap: "0.4rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
                Venue
              </span>
            </div>
            {savedVenues.length > 0 ? (
              <select
                className="pb-input"
                value={selectedVenueId}
                onChange={(e) => {
                  const vid = e.target.value;
                  setSelectedVenueId(vid);
                  if (vid !== "custom") {
                    const match = savedVenues.find(v => v.id === vid);
                    if (match) setVenueName(match.name);
                  } else {
                    setVenueName("");
                  }
                }}
                style={{ height: 44, borderRadius: "var(--r-md)" }}
              >
                {savedVenues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.isHome ? "🏠 Home Venue: " : "📍 "}{v.name}
                  </option>
                ))}
                <option value="custom">✏️ Enter custom / other venue…</option>
              </select>
            ) : null}
            {(savedVenues.length === 0 || selectedVenueId === "custom") && (
              <input
                data-testid="session-venue-input"
                className="pb-input"
                value={venueName}
                onChange={e => setVenueName(e.target.value)}
                placeholder="Community Sports Hall"
                required
                style={{ height: 44, borderRadius: "var(--r-md)" }}
              />
            )}
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
          }}>Session Details</div>

          <label style={{ display: "grid", gap: "0.4rem" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>Session name</span>
            <input data-testid="session-name-input" className="pb-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Saturday Social · 24 Aug, 6:30 PM" required />
          </label>

          <div style={{ display: "grid", gap: "0.625rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>Sport for this session</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)" }}>
                From your default
              </span>
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: "0.75rem",
              alignItems: "center",
              border: "1.5px solid var(--border)",
              borderRadius: "var(--r-xl)",
              background: "var(--surface-sunken)",
              padding: "0.875rem",
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <strong style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", color: "var(--text-1)" }}>
                    {sportLabel}
                  </strong>
                  {preferredSport === sport && (
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.5625rem",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--ink-800)",
                      background: "var(--volt-500)",
                      borderRadius: "var(--r-pill)",
                      padding: "3px 8px",
                      fontWeight: 900,
                    }}>
                      Saved default
                    </span>
                  )}
                </div>
                <p style={{ color: "var(--text-3)", fontSize: "0.8125rem", lineHeight: 1.4, marginTop: "0.25rem" }}>
                  {selectedSport.detail} Change your sport default only when this session is for a different sport.
                </p>
              </div>
              <button
                  type="button"
                  onClick={openPicker}
                  style={{
                    minHeight: 42,
                    padding: "0 0.875rem",
                    borderRadius: "var(--r-md)",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--text-1)",
                    fontWeight: 900,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Change
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: "0.4rem" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>Format</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              {[
                { value: "social_rotation", label: "Social session", hint: "Fair rotating games" },
                { value: "fixed_pair_round_robin", label: "Round robin", hint: "Fixed teams, every matchup" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSessionFormat(option.value as "social_rotation" | "fixed_pair_round_robin")}
                  style={{
                    padding: "0.75rem",
                    borderRadius: "var(--r-lg)",
                    border: sessionFormat === option.value ? "2px solid var(--ink-800)" : "1.5px solid var(--border)",
                    background: sessionFormat === option.value ? "var(--ink-800)" : "var(--surface-sunken)",
                    color: sessionFormat === option.value ? "var(--volt-500)" : "var(--text-2)",
                    fontWeight: 900,
                    cursor: "pointer",
                    fontSize: "0.8125rem",
                    display: "grid",
                    gap: "0.2rem",
                    textAlign: "left",
                  }}
                >
                  <span>{option.label}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", letterSpacing: "0.04em", opacity: 0.8 }}>{option.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Scoring */}
          <label style={{ display: "grid", gap: "0.4rem" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>Scoring</span>
            <select className="pb-input" value={scoringMode} onChange={e => setScoringMode(e.target.value as "winner_only" | "points")}>
              <option value="points">Full score (e.g. 11–7)</option>
              <option value="winner_only">Win / Loss only</option>
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

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.375rem" }}>
            {[60, 90, 120, 180].map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => setDurationMinutes(mins)}
                style={{
                  height: 44,
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border)",
                  background: durationMinutes === mins ? "var(--volt-500)" : "var(--surface-sunken)",
                  color: durationMinutes === mins ? "var(--ink-800)" : "var(--text-2)",
                  fontWeight: 800, fontSize: "0.8125rem",
                  cursor: "pointer",
                }}
              >{mins < 120 ? `${mins}m` : `${mins / 60}h`}</button>
            ))}
          </div>

          <label style={{ display: "grid", gap: "0.4rem", marginTop: "0.5rem" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
              Date &amp; Time (optional)
            </span>
            <input
              type="datetime-local"
              className="pb-input"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              style={{ height: 44, borderRadius: "var(--r-md)" }}
            />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-3)", letterSpacing: "0.05em" }}>
              Leave blank to start now. Set a future time to let members RSVP.
            </div>
          </label>
        </section>

        <button
          data-testid="session-create-submit"
          className="pb-btn pb-btn-volt"
          type="submit"
          disabled={!canCreate}
          style={{ marginTop: "0.25rem", animation: "pb-rise 360ms 160ms var(--ease-out) both" }}
        >
          {isSubmitting ? "Creating…" : "Create Session →"}
        </button>

      </form>
    </div>
  );
}
