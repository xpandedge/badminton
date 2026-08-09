"use client";

import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LogoVariant = "full" | "mark" | "wordmark";
export type LogoTheme = "dark" | "light" | "mono";

export interface LogoProps {
  variant?: LogoVariant;
  theme?: LogoTheme;
  size?: number; // mark height in px; wordmark scales to match
  animated?: boolean;
  showKicker?: boolean; // force the sport kicker line below wordmark
  className?: string;
  style?: React.CSSProperties;
}

// ─── Theme tokens ─────────────────────────────────────────────────────────────

function getTokens(theme: LogoTheme) {
  switch (theme) {
    case "dark":
      return {
        surface:   "#16241C",
        racketA:   "#E8F0EA", // badminton frame — light
        racketB:   "#9BE870", // pickleball paddle — lime
        shuttle:   "#9BE870",
        keyline:   "#16241C",
        wordmark:  "#E8F0EA",
        kicker:    "#6F8377",
      };
    case "light":
      return {
        surface:   "#F3F5F0",
        racketA:   "#16241C",
        racketB:   "#16241C",
        shuttle:   "#16241C",
        keyline:   "#F3F5F0",
        wordmark:  "#16241C",
        kicker:    "#6F8377",
      };
    case "mono":
      return {
        surface:   "currentColor",
        racketA:   "currentColor",
        racketB:   "currentColor",
        shuttle:   "currentColor",
        keyline:   "transparent",
        wordmark:  "currentColor",
        kicker:    "currentColor",
      };
  }
}

// ─── Mark SVG ─────────────────────────────────────────────────────────────────

interface MarkProps {
  size: number;
  theme: LogoTheme;
  animated: boolean;
  pressing: boolean;
}

function Mark({ size, theme, animated, pressing }: MarkProps) {
  const tok = getTokens(theme);

  // Respect prefers-reduced-motion
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const doAnimate = animated && !reducedMotion;

  // Splash animation — one-shot on mount
  const [splashDone, setSplashDone] = useState(false);
  useEffect(() => {
    if (!doAnimate) { setSplashDone(true); return; }
    const t = setTimeout(() => setSplashDone(true), 950);
    return () => clearTimeout(t);
  }, [doAnimate]);

  const scaleStyle: React.CSSProperties = pressing
    ? { transform: "scale(0.94)", transition: "transform 80ms ease-out" }
    : { transform: "scale(1)", transition: "transform 220ms cubic-bezier(.2,.9,.25,1.2)" };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      style={{
        display: "block",
        flexShrink: 0,
        ...scaleStyle,
        ...(doAnimate ? {} : {}),
      }}
    >
      <style>{`
        @keyframes dr-racket-a {
          from { transform: rotate(0deg) translate(0,0); }
          to   { transform: rotate(-34deg) translate(0,0); }
        }
        @keyframes dr-racket-b {
          from { transform: rotate(0deg) translate(0,0); }
          to   { transform: rotate(34deg) translate(0,0); }
        }
        @keyframes dr-shuttle-in {
          from { transform: translateY(-18px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        @keyframes dr-shuttle-idle {
          0%,100% { transform: translateY(0) rotate(0deg); }
          50%     { transform: translateY(-6px) rotate(3deg); }
        }
      `}</style>

      {/* Badminton racket (light, back) */}
      <g
        style={doAnimate && !splashDone ? {
          animation: "dr-racket-a 450ms cubic-bezier(0,0,0.2,1) forwards",
          transformOrigin: "60px 86px",
        } : {
          transform: "rotate(-34deg)",
          transformOrigin: "60px 86px",
        }}
      >
        <rect x="57" y="46" width="6" height="66" rx="3" fill={tok.racketA} />
        <ellipse cx="60" cy="26" rx="16" ry="20" stroke={tok.racketA} strokeWidth="6" />
      </g>

      {/* Pickleball paddle (lime, front) */}
      <g
        style={doAnimate && !splashDone ? {
          animation: "dr-racket-b 450ms cubic-bezier(0,0,0.2,1) forwards",
          transformOrigin: "60px 86px",
        } : {
          transform: "rotate(34deg)",
          transformOrigin: "60px 86px",
        }}
      >
        <rect x="57" y="46" width="6" height="66" rx="3" fill={tok.racketB} stroke={tok.keyline} strokeWidth="4" />
        <rect x="40" y="2" width="40" height="48" rx="11" fill={tok.racketB} stroke={tok.keyline} strokeWidth="4" />
      </g>

      {/* Shuttle */}
      <g
        style={doAnimate
          ? splashDone
            ? {
                animation: "dr-shuttle-idle 1.6s ease-in-out infinite",
                transformOrigin: "54px 22px",
              }
            : {
                animation: "dr-shuttle-in 320ms cubic-bezier(.2,.9,.25,1.2) 570ms both",
                transformOrigin: "54px 22px",
              }
          : {}}
      >
        <g transform="rotate(-16 54 22) translate(8.1 4.65) scale(0.85)">
          <path
            d="M48 36 C 45.5 27, 43.5 18, 41 11 L 67 11 C 64.5 18, 62.5 27, 60 36 A 8 8 0 0 0 48 36 Z"
            fill={tok.shuttle}
          />
          <circle cx="54" cy="45" r="7" fill={tok.shuttle} />
          {/* Keyline dots on cork */}
          <circle cx="51.3" cy="43.7" r="1.9" fill={tok.keyline} />
          <circle cx="56.7" cy="43.7" r="1.9" fill={tok.keyline} />
          <circle cx="54" cy="47.6" r="1.9" fill={tok.keyline} />
        </g>
      </g>
    </svg>
  );
}

// ─── Wordmark ─────────────────────────────────────────────────────────────────

interface WordmarkProps {
  theme: LogoTheme;
  markSize: number;
  showKicker?: boolean;
  animated: boolean;
  splashDone: boolean;
}

function Wordmark({ theme, markSize, showKicker, animated, splashDone }: WordmarkProps) {
  const tok = getTokens(theme);
  const fontSize = markSize * 0.36;
  const kickerSize = fontSize * 0.42;

  const fadeStyle: React.CSSProperties = animated && !splashDone
    ? { animation: "dr-wordmark-in 200ms ease-out 750ms both" }
    : {};

  return (
    <>
      <style>{`
        @keyframes dr-wordmark-in {
          from { opacity: 0; transform: translateX(-4px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", ...fadeStyle }}>
        <span
          style={{
            fontFamily: "'Archivo', 'Inter', sans-serif",
            fontWeight: 800,
            fontSize,
            letterSpacing: "-0.035em",
            color: tok.wordmark,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          duo<span style={{ color: theme === "mono" ? tok.wordmark : tok.racketB }}>rally</span>
        </span>
        {showKicker && (
          <span
            style={{
              fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
              fontSize: kickerSize,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: tok.kicker,
              marginTop: "0.3em",
              whiteSpace: "nowrap",
            }}
          >
            Badminton · Pickleball
          </span>
        )}
      </div>
    </>
  );
}

// ─── Logo (public API) ────────────────────────────────────────────────────────

export function Logo({
  variant = "full",
  theme = "dark",
  size = 40,
  animated = false,
  showKicker: showKickerProp,
  className,
  style,
}: LogoProps) {
  const [pressing, setPressing] = useState(false);
  const [splashDone, setSplashDone] = useState(!animated);

  // Sync splashDone for wordmark
  useEffect(() => {
    if (!animated) { setSplashDone(true); return; }
    const t = setTimeout(() => setSplashDone(true), 950);
    return () => clearTimeout(t);
  }, [animated]);

  // Enforce minimum: below 20px mark, always just the mark
  const effectiveVariant: LogoVariant = size < 20 ? "mark" : variant;
  const gap = size * 0.26;
  const showKicker = showKickerProp ?? (effectiveVariant === "full" && size >= 36);

  const handlers = {
    onPointerDown: () => setPressing(true),
    onPointerUp: () => setPressing(false),
    onPointerLeave: () => setPressing(false),
  };

  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        userSelect: "none",
        cursor: "pointer",
        ...style,
      }}
      {...handlers}
    >
      {effectiveVariant !== "wordmark" && (
        <Mark
          size={size}
          theme={theme}
          animated={animated}
          pressing={pressing}
        />
      )}
      {effectiveVariant !== "mark" && (
        <Wordmark
          theme={theme}
          markSize={size}
          showKicker={showKicker}
          animated={animated}
          splashDone={splashDone}
        />
      )}
    </div>
  );
}
