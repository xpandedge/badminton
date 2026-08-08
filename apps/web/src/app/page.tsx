import Link from "next/link";

export default function Home() {
  return (
    <div
      className="pb-net-bg"
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "2rem 1.25rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", gap: "0.875rem" }}>

        {/* Ink hero card */}
        <div
          style={{
            background: "var(--ink-800)",
            borderRadius: "var(--r-2xl)",
            padding: "2.5rem 2rem 2rem",
            position: "relative",
            overflow: "hidden",
            animation: "pb-rise 500ms var(--ease-out) both",
          }}
        >
          {/* Volt court-net overlay on ink */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(198,241,53,0.07) 0 1px, transparent 1px 18px), repeating-linear-gradient(-45deg, rgba(198,241,53,0.07) 0 1px, transparent 1px 18px)",
              pointerEvents: "none",
            }}
          />

          {/* Logo row */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1.75rem" }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "var(--r-md)",
                background: "var(--volt-500)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 40 40" fill="none">
                <rect x="5" y="3" width="19" height="25" rx="9" transform="rotate(-15 14 15)" fill="none" stroke="#16241C" strokeWidth="3" />
                <circle cx="28" cy="28" r="8" fill="#16241C" />
                <circle cx="26" cy="26" r="3" fill="#C6F135" />
              </svg>
            </div>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 900,
                fontSize: "1.0625rem",
                color: "var(--n-50)",
                textTransform: "uppercase",
                letterSpacing: "-0.01em",
                lineHeight: 1,
              }}
            >
              Pickle<span style={{ color: "var(--volt-500)" }}>Baddies</span>
            </span>
          </div>

          {/* Headline */}
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              fontSize: "clamp(2.75rem, 11vw, 4rem)",
              color: "var(--n-50)",
              textTransform: "uppercase",
              letterSpacing: "-0.03em",
              lineHeight: 1.0,
              marginBottom: "1rem",
            }}
          >
            Session<br />
            <span style={{ color: "var(--volt-500)" }}>Chaos</span>
            <br />
            Killer.
          </div>

          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.9375rem",
              color: "rgba(246,248,244,0.6)",
              lineHeight: 1.6,
              maxWidth: "28ch",
              marginBottom: "1.5rem",
            }}
          >
            Auto-balance teams, track live scores, and rebalance without touching completed games.
          </p>

          {/* Sport tags */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px 5px 9px",
                borderRadius: "var(--r-pill)",
                background: "rgba(198,241,53,0.12)",
                color: "var(--volt-300)",
                fontFamily: "var(--font-body)",
                fontSize: 13,
                fontWeight: 700,
                border: "1px solid rgba(198,241,53,0.22)",
              }}
            >
              ⚡ Pickleball
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px 5px 9px",
                borderRadius: "var(--r-pill)",
                background: "rgba(61,109,255,0.12)",
                color: "#7A9BFF",
                fontFamily: "var(--font-body)",
                fontSize: 13,
                fontWeight: 700,
                border: "1px solid rgba(61,109,255,0.22)",
              }}
            >
              🏸 Badminton
            </span>
          </div>
        </div>

        {/* CTA */}
        <Link
          href="/sign-in"
          style={{ textDecoration: "none", animation: "pb-rise 500ms 80ms var(--ease-out) both", display: "block" }}
        >
          <button
            className="pb-btn pb-btn-volt"
            style={{ height: 58, fontSize: "1.0625rem" }}
          >
            Get started →
          </button>
        </Link>

        <Link
          href="/quick"
          style={{ textDecoration: "none", animation: "pb-rise 500ms 120ms var(--ease-out) both", display: "block" }}
        >
          <button
            className="pb-btn"
            style={{ height: 52, fontSize: "0.9375rem", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(246,248,244,0.8)" }}
          >
            ⚡ Quick Session
          </button>
        </Link>

        {/* Milestone note */}
        <p
          style={{
            textAlign: "center",
            fontFamily: "var(--font-mono)",
            fontSize: "0.6875rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--text-3)",
            animation: "pb-fade 600ms 200ms var(--ease-out) both",
          }}
        >
          M0 · Foundation wired · Next: auth & roles
        </p>
      </div>
    </div>
  );
}
