"use client";
import { useEffect, useRef, useState } from "react";
import type { SessionCourt } from "@/lib/sessions/types";
import type { CourtChange } from "@/lib/sessions/courts";
import { saveLiveCourt } from "@/server/sessions/courts";

function courtLabel(name: string) {
  const suffix = name.trim().replace(/^court\s*/i, "").trim();
  return `Court${suffix ? ` ${suffix}` : ""}`;
}

function courtNameValue(name: string) {
  return name.trim().replace(/^court\s*/i, "").trim();
}

function isCourtActive(court: SessionCourt) {
  // Courts created before isActive was persisted are still available courts.
  return court.isActive !== false;
}

export function LiveCourts({ sessionId, courts, disabling, onDisable, onAvailabilityChange }: {
  sessionId: string;
  courts: SessionCourt[];
  disabling: boolean;
  onDisable: (id: string, name: string) => Promise<void>;
  onAvailabilityChange: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<{ courtId?: string; name: string; number: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCourts, setVisibleCourts] = useState(courts);
  const locked = busy || disabling;
  const updateMessage = busy ? "Saving court…" : "Updating courts…";
  const orderedCourts = [...visibleCourts].sort((a, b) => Number(isCourtActive(b)) - Number(isCourtActive(a)));
  useEffect(() => { setVisibleCourts(courts); }, [courts]);
  async function save(change: CourtChange) {
    if (saving.current || disabling) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await saveLiveCourt(sessionId, change);
      if (!result.ok) { setError(result.message); return; }
      setVisibleCourts(result.data);
      setDraft(null);
      if (!change.courtId || change.isActive !== undefined) await onAvailabilityChange();
    } catch { setError("Could not finish updating courts. Please try again."); }
    finally { saving.current = false; setBusy(false); }
  }
  return <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: "1rem" }}>
      <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900 }}>Courts</h2>
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
        {locked && <span role="status" style={{ color: "var(--text-3)", fontSize: "0.8125rem", fontWeight: 800, whiteSpace: "nowrap" }}>{updateMessage}</span>}
        <button type="button" className="pb-btn pb-btn-secondary" style={{ width: "auto", minHeight: 44, padding: "0 0.75rem" }} disabled={locked} onClick={() => {
          const number = Math.max(0, ...visibleCourts.map(c => c.courtNumber)) + 1;
          setError(null); setDraft({ name: String(number), number: String(number) });
        }}>{locked ? "Updating…" : "+ Add court"}</button>
      </div>
    </div>
    {draft && <form style={{ marginBottom: "1rem", display: "grid", gap: "0.75rem" }} onSubmit={event => { event.preventDefault(); void save({ ...(draft.courtId ? { courtId: draft.courtId } : {}), name: draft.name, courtNumber: Number(draft.number) }); }}>
      <h3>{draft.courtId ? "Change court" : "Add court"}</h3>
      <label>Court<input className="pb-input" style={{ width: "100%" }} required maxLength={80} placeholder="e.g. 3 or Centre" value={draft.name} disabled={locked} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>New games use these details. Current and completed games keep their recorded court details.</p>
      <div style={{ display: "flex", gap: "0.75rem" }}><button className="pb-btn pb-btn-volt" style={{ width: "auto", minHeight: 44, padding: "0 0.75rem" }} disabled={locked || !draft.name.trim()}>{busy ? "Saving…" : "Save court"}</button><button type="button" className="pb-btn pb-btn-secondary" style={{ width: "auto", minHeight: 44, padding: "0 0.75rem" }} disabled={locked} onClick={() => { setDraft(null); setError(null); }}>Cancel</button></div>
    </form>}
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {orderedCourts.map(court => {
        const active = isCourtActive(court);
        return <div key={court.courtId} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", padding: "0.75rem", background: active ? "rgba(198,241,53,0.2)" : "rgba(211,145,48,0.14)", border: `1px solid ${active ? "rgba(98,145,0,0.5)" : "rgba(180,115,20,0.45)"}`, boxShadow: `inset 4px 0 0 ${active ? "var(--volt-500)" : "rgba(180,115,20,0.7)"}`, borderRadius: "var(--r-md)", opacity: active ? 1 : 0.88 }}>
        <span style={{ flex: "1 1 120px", overflowWrap: "anywhere", fontWeight: 800 }}>{courtLabel(court.name)}<small style={{ display: "block", color: active ? "var(--emerald-600)" : "#9a5b00", fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "0.2rem" }}>{active ? "Active" : "Disabled"}</small></span>
        <button type="button" className="pb-btn pb-btn-secondary" style={{ width: "auto", minHeight: 44, padding: "0 0.75rem" }} disabled={locked} aria-label={`Change ${courtLabel(court.name)}`} onClick={() => { setError(null); setDraft({ courtId: court.courtId, name: courtNameValue(court.name), number: String(court.courtNumber) }); }}>Change</button>
        <button type="button" className="pb-btn pb-btn-secondary" style={{ width: "auto", minHeight: 44, padding: "0 0.75rem" }} disabled={locked} aria-label={`${active ? "Disable" : "Enable"} ${courtLabel(court.name)}`} onClick={() => active ? onDisable(court.courtId, court.name) : save({ courtId: court.courtId, isActive: true })}>{active ? "Disable" : "Enable"}</button>
      </div>;
      })}
    </div>
    {error && <p role="alert" style={{ color: "var(--danger)", marginTop: "0.75rem" }}>{error}</p>}
  </section>;
}
