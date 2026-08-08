"use client";

import { useEffect, useState, use } from "react";
import {
  getScoreLinkData,
  submitScoreByLink,
  type ScoreLinkData,
  type ScoreLinkCourt,
} from "@/lib/sessions/score-link";

type SubmitState = "idle" | "submitting" | "done" | "error";

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export default function ScoreLinkPage({ params }: { params: Promise<{ scoreCode: string }> }) {
  const { scoreCode } = use(params);

  const [data, setData] = useState<ScoreLinkData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeCourt, setActiveCourt] = useState<string | null>(null);
  const [pointA, setPointA] = useState("");
  const [pointB, setPointB] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitMsg, setSubmitMsg] = useState("");
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    getScoreLinkData(scoreCode)
      .then(setData)
      .catch((e) => setLoadError(e.message || "Failed to load session."));
  }, [scoreCode]);

  const handleCourtTap = (courtId: string) => {
    setActiveCourt((prev) => (prev === courtId ? null : courtId));
    setPointA("");
    setPointB("");
    setSubmitError("");
    setSubmitState("idle");
  };

  const handleSubmit = async (court: ScoreLinkCourt, winner?: "A" | "B") => {
    if (!data || !court.match) return;
    setSubmitState("submitting");
    setSubmitError("");
    try {
      const payload =
        data.scoringMode === "winner_only"
          ? { winnerTeam: winner! }
          : { teamAScore: Number(pointA), teamBScore: Number(pointB) };

      const result = await submitScoreByLink(scoreCode, court.courtId, payload as any);
      setSubmitMsg(`${result.courtName} — Team ${result.winnerTeam} wins!`);
      setSubmitState("done");
      setActiveCourt(null);
      // Refresh data
      const fresh = await getScoreLinkData(scoreCode);
      setData(fresh);
    } catch (e: any) {
      setSubmitState("error");
      setSubmitError(e.message || "Failed to submit score.");
    }
  };

  if (loadError) {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "grid", placeItems: "center", padding: "1.25rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem", maxWidth: 400, width: "100%", textAlign: "center" }}>
          <p style={{ color: "var(--danger)", fontWeight: 800 }}>{loadError}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "grid", placeItems: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Loading…
        </span>
      </div>
    );
  }

  const sessionNotActive = data.sessionStatus !== "active";

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "2rem" }}>
      {/* Header */}
      <header style={{ background: "var(--ink-800)", padding: "1.25rem 1.25rem 1rem", position: "relative", overflow: "hidden" }}>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(45deg, rgba(198,241,53,0.05) 0 1px, transparent 1px 18px)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "rgba(246,248,244,0.55)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {titleCase(data.sport)}
          </span>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 900, color: "var(--n-50)", textTransform: "uppercase", letterSpacing: "-0.025em", marginTop: "0.25rem" }}>
            {data.sessionName}
          </h1>
          <p style={{ color: "rgba(246,248,244,0.6)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Tap a court to enter the result
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 480, margin: "0 auto", padding: "1rem 1.25rem", display: "grid", gap: "0.75rem" }}>
        {submitState === "done" && (
          <div style={{ background: "rgba(198,241,53,0.18)", border: "1px solid var(--volt-500)", borderRadius: "var(--r-xl)", padding: "1rem", fontWeight: 800, color: "var(--ink-800)", textAlign: "center" }}>
            {submitMsg}
          </div>
        )}

        {sessionNotActive && (
          <div style={{ background: "var(--surface)", border: "2px dashed var(--border)", borderRadius: "var(--r-xl)", padding: "2rem", textAlign: "center" }}>
            <p style={{ color: "var(--text-2)", fontWeight: 700 }}>Scoring not available — session is {data.sessionStatus}.</p>
          </div>
        )}

        {!sessionNotActive && data.courts.map((court) => {
          const isActive = activeCourt === court.courtId;
          const isCompleted = court.match?.status === "completed";
          return (
            <div key={court.courtId} style={{ background: "var(--surface)", border: `1px solid ${isActive ? "var(--volt-500)" : "var(--border)"}`, borderRadius: "var(--r-xl)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
              <button
                type="button"
                onClick={() => !isCompleted && handleCourtTap(court.courtId)}
                disabled={isCompleted || !court.match}
                style={{ width: "100%", background: "none", border: "none", padding: "1rem", cursor: isCompleted || !court.match ? "default" : "pointer", textAlign: "left" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.125rem", fontWeight: 900, letterSpacing: "-0.02em" }}>{court.courtName}</span>
                  {isCompleted && (
                    <span style={{ padding: "3px 8px", borderRadius: "var(--r-pill)", background: "rgba(198,241,53,0.18)", color: "var(--ink-800)", fontSize: "0.75rem", fontWeight: 800 }}>Scored</span>
                  )}
                  {!court.match && (
                    <span style={{ padding: "3px 8px", borderRadius: "var(--r-pill)", background: "var(--surface-sunken)", color: "var(--text-3)", fontSize: "0.75rem" }}>No match</span>
                  )}
                </div>
                {court.match && (
                  <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.9375rem", color: "var(--text-2)" }}>
                    <span style={{ fontWeight: 700 }}>{court.match.teamA.map((p) => p.displayName).join(" & ")}</span>
                    <span style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>vs</span>
                    <span style={{ fontWeight: 700 }}>{court.match.teamB.map((p) => p.displayName).join(" & ")}</span>
                  </div>
                )}
              </button>

              {isActive && court.match && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "1rem", background: "var(--surface-sunken)" }}>
                  {submitError && (
                    <p style={{ color: "var(--danger)", fontWeight: 700, marginBottom: "0.75rem", fontSize: "0.875rem" }}>{submitError}</p>
                  )}
                  {data.scoringMode === "winner_only" ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
                      <button
                        type="button"
                        onClick={() => handleSubmit(court, "A")}
                        disabled={submitState === "submitting"}
                        style={{ padding: "0.875rem", border: "none", borderRadius: "var(--r-lg)", background: "var(--ink-800)", color: "var(--volt-500)", fontWeight: 900, cursor: "pointer", fontSize: "0.9375rem" }}
                      >
                        {court.match.teamA.map((p) => p.displayName.split(" ")[0]).join(" & ")} win
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSubmit(court, "B")}
                        disabled={submitState === "submitting"}
                        style={{ padding: "0.875rem", border: "none", borderRadius: "var(--r-lg)", background: "var(--ink-800)", color: "var(--volt-500)", fontWeight: 900, cursor: "pointer", fontSize: "0.9375rem" }}
                      >
                        {court.match.teamB.map((p) => p.displayName.split(" ")[0]).join(" & ")} win
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: "0.75rem" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "0.5rem", alignItems: "center" }}>
                        <div>
                          <label style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: "0.25rem" }}>
                            {court.match.teamA.map((p) => p.displayName.split(" ")[0]).join(" & ")}
                          </label>
                          <input
                            className="pb-input"
                            type="number"
                            min={0}
                            value={pointA}
                            onChange={(e) => setPointA(e.target.value)}
                            style={{ height: 52, borderRadius: "var(--r-md)", fontSize: "1.5rem", fontWeight: 900, textAlign: "center" }}
                            placeholder="0"
                          />
                        </div>
                        <span style={{ fontFamily: "var(--font-display-tight)", fontWeight: 900, color: "var(--text-3)" }}>vs</span>
                        <div>
                          <label style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: "0.25rem" }}>
                            {court.match.teamB.map((p) => p.displayName.split(" ")[0]).join(" & ")}
                          </label>
                          <input
                            className="pb-input"
                            type="number"
                            min={0}
                            value={pointB}
                            onChange={(e) => setPointB(e.target.value)}
                            style={{ height: 52, borderRadius: "var(--r-md)", fontSize: "1.5rem", fontWeight: 900, textAlign: "center" }}
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSubmit(court)}
                        disabled={submitState === "submitting" || !pointA || !pointB || pointA === pointB}
                        style={{ height: 48, border: "none", borderRadius: "var(--r-lg)", background: "var(--ink-800)", color: "var(--volt-500)", fontWeight: 900, cursor: "pointer" }}
                      >
                        {submitState === "submitting" ? "Submitting…" : "Submit Result"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}