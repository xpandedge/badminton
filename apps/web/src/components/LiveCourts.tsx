"use client";
import { useRef, useState } from "react";
import type { SessionCourt } from "@/lib/sessions/types";
import type { CourtChange } from "@/lib/sessions/courts";
import { saveLiveCourt } from "@/server/sessions/courts";

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
  const locked = busy || disabling;
  async function save(change: CourtChange) {
    if (saving.current || disabling) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await saveLiveCourt(sessionId, change);
      if (!result.ok) { setError(result.message); return; }
      setDraft(null);
      if (!change.courtId || change.isActive !== undefined) await onAvailabilityChange();
    } catch { setError("Could not finish updating courts. Please try again."); }
    finally { saving.current = false; setBusy(false); }
  }
  return <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: "1rem" }}>
      <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900 }}>Courts</h2>
      <button type="button" className="pb-btn pb-btn-secondary" style={{ width: "auto", minHeight: 44, padding: "0 0.75rem" }} disabled={locked} onClick={() => {
        const number = Math.max(0, ...courts.map(c => c.courtNumber)) + 1;
        setError(null); setDraft({ name: `Court ${number}`, number: String(number) });
      }}>+ Add court</button>
    </div>
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {courts.map(court => <div key={court.courtId} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", padding: "0.75rem", background: "var(--surface-sunken)", borderRadius: "var(--r-md)" }}>
        <span style={{ flex: "1 1 120px", overflowWrap: "anywhere", fontWeight: 800 }}>{court.name}<small style={{ display: "block", color: "var(--text-3)" }}>Court number {court.courtNumber}{court.isActive ? "" : " · Disabled"}</small></span>
        <button type="button" className="pb-btn pb-btn-secondary" style={{ width: "auto", minHeight: 44, padding: "0 0.75rem" }} disabled={locked} aria-label={`Change ${court.name}`} onClick={() => { setError(null); setDraft({ courtId: court.courtId, name: court.name, number: String(court.courtNumber) }); }}>Change</button>
        <button type="button" className="pb-btn pb-btn-secondary" style={{ width: "auto", minHeight: 44, padding: "0 0.75rem" }} disabled={locked} aria-label={`${court.isActive ? "Disable" : "Enable"} ${court.name}`} onClick={() => court.isActive ? onDisable(court.courtId, court.name) : save({ courtId: court.courtId, isActive: true })}>{court.isActive ? "Disable" : "Enable"}</button>
      </div>)}
    </div>
    {draft && <form style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }} onSubmit={event => { event.preventDefault(); void save({ ...(draft.courtId ? { courtId: draft.courtId } : {}), name: draft.name, courtNumber: Number(draft.number) }); }}>
      <h3>{draft.courtId ? "Change court" : "Add court"}</h3>
      <label>Court name<input className="pb-input" style={{ width: "100%" }} required maxLength={80} value={draft.name} disabled={locked} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>Court number<input className="pb-input" style={{ width: "100%" }} type="number" min={1} step={1} required value={draft.number} disabled={locked} onChange={event => setDraft({ ...draft, number: event.target.value })} /></label>
      <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>New games use these details. Current and completed games keep their recorded court details.</p>
      <div style={{ display: "flex", gap: "0.75rem" }}><button className="pb-btn pb-btn-volt" style={{ width: "auto", minHeight: 44, padding: "0 0.75rem" }} disabled={locked || !draft.name.trim()}>{busy ? "Saving…" : "Save court"}</button><button type="button" className="pb-btn pb-btn-secondary" style={{ width: "auto", minHeight: 44, padding: "0 0.75rem" }} disabled={locked} onClick={() => { setDraft(null); setError(null); }}>Cancel</button></div>
    </form>}
    {error && <p role="alert" style={{ color: "var(--danger)", marginTop: "0.75rem" }}>{error}</p>}
  </section>;
}
