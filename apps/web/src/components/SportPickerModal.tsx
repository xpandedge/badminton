"use client";

import { useSportPreference } from "@/lib/sport/SportPreferenceContext";
import type { Sport } from "@picklebaddies/domain";

const SPORTS: Array<{
  id: Sport;
  label: string;
  target: string;
  tagline: string;
  accentColor: string;
  textColor: string;
}> = [
  {
    id: "pickleball",
    label: "Pickleball",
    target: "11 pts",
    tagline: "Fast rallies. Fair rotations. Easy scores.",
    accentColor: "var(--volt-500)",
    textColor: "var(--ink-800)",
  },
  {
    id: "badminton",
    label: "Badminton",
    target: "21 pts",
    tagline: "Big courts. Big smashes. Big rallies.",
    accentColor: "var(--ink-800)",
    textColor: "var(--volt-500)",
  },
];

export function SportPickerModal() {
  const { showPicker, sport: currentSport, setSport, closePicker, isLoaded } = useSportPreference();

  if (!showPicker) return null;

  const isFirstTime = !currentSport && isLoaded;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 900,
        background: "rgba(16, 28, 20, 0.82)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        animation: "pb-rise 280ms var(--ease-out) both",
      }}
      // clicking backdrop closes if changing (not first-time)
      onClick={!isFirstTime ? closePicker : undefined}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        {/* Heading */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.625rem",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "rgba(246,248,244,0.45)",
            marginBottom: "0.625rem",
          }}>
            {isFirstTime ? "Welcome to DuoRally" : "Change sport"}
          </div>
          <h2 style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(1.75rem, 7vw, 2.75rem)",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "-0.03em",
            lineHeight: 1,
            color: "var(--n-50)",
          }}>
            {isFirstTime ? "Pick your sport" : "What are you playing?"}
          </h2>
          {isFirstTime && (
            <p style={{ color: "rgba(246,248,244,0.55)", marginTop: "0.5rem", fontSize: "0.9375rem" }}>
              We'll use this as your default. You can always change it.
            </p>
          )}
        </div>

        {/* Sport cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
          {SPORTS.map((s) => {
            const isSelected = currentSport === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSport(s.id)}
                style={{
                  position: "relative",
                  border: isSelected ? `2.5px solid ${s.accentColor}` : "2px solid rgba(246,248,244,0.12)",
                  borderRadius: "var(--r-2xl)",
                  background: isSelected ? s.accentColor : "rgba(246,248,244,0.06)",
                  color: isSelected ? s.textColor : "var(--n-50)",
                  padding: "1.5rem 1rem 1.25rem",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "0.625rem",
                  textAlign: "left",
                  transition: "transform 80ms, border-color 120ms, background 120ms",
                  transform: isSelected ? "scale(1.02)" : "scale(1)",
                  boxShadow: isSelected ? `0 8px 32px rgba(0,0,0,0.3)` : "none",
                }}
              >
                {isSelected && (
                  <div style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: s.textColor,
                    display: "grid",
                    placeItems: "center",
                  }}>
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <polyline points="2,6 5,9 10,3" stroke={s.accentColor === "var(--ink-800)" ? "#16241C" : "#C6F135"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}

                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.5625rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  opacity: 0.65,
                }}>
                  up to {s.target}
                </div>

                <div style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.375rem",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "-0.025em",
                  lineHeight: 1,
                }}>
                  {s.label}
                </div>

                <div style={{
                  fontFamily: "var(--font-body, var(--font-sans))",
                  fontSize: "0.75rem",
                  lineHeight: 1.4,
                  opacity: 0.7,
                }}>
                  {s.tagline}
                </div>
              </button>
            );
          })}
        </div>

        {/* Skip / close for "change" mode */}
        {!isFirstTime && (
          <button
            onClick={closePicker}
            style={{
              background: "none",
              border: "none",
              color: "rgba(246,248,244,0.4)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.6875rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
              alignSelf: "center",
              padding: "0.5rem",
            }}
          >
            Cancel
          </button>
        )}

        {isFirstTime && (
          <p style={{
            textAlign: "center",
            fontFamily: "var(--font-mono)",
            fontSize: "0.5625rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "rgba(246,248,244,0.25)",
          }}>
            Tap a sport to continue
          </p>
        )}
      </div>
    </div>
  );
}
