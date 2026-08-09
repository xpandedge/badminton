import Link from "next/link";
import { Logo } from "@/components/Logo";

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
                "repeating-linear-gradient(45deg, rgba(155,232,112,0.07) 0 1px, transparent 1px 18px), repeating-linear-gradient(-45deg, rgba(155,232,112,0.07) 0 1px, transparent 1px 18px)",
              pointerEvents: "none",
            }}
          />

          {/* Logo row */}
          <div style={{ marginBottom: "1.75rem" }}>
            <Logo variant="full" theme="dark" size={44} animated showKicker />
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
            Games on.<br />
            <span style={{ color: "#9BE870" }}>Zero</span>
            <br />
            faff.
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
            Schedule sessions, auto-balance teams, track live scores — and stop managing it all in WhatsApp.
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
                background: "rgba(155,232,112,0.12)",
                color: "#9BE870",
                fontFamily: "var(--font-body)",
                fontSize: 13,
                fontWeight: 700,
                border: "1px solid rgba(155,232,112,0.22)",
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

        {/* Tagline */}
        <p
          style={{
            textAlign: "center",
            fontFamily: "var(--font-mono)",
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-3)",
            animation: "pb-fade 600ms 200ms var(--ease-out) both",
          }}
        >
          Fair games · live scores · zero WhatsApp maths
        </p>
      </div>
    </div>
  );
}
