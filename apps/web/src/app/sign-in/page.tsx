"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  signInWithGoogle,
  signInWithEmail,
  registerWithEmail,
} from "@/lib/auth/sign-in";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { logEvent } from "@/lib/analytics/events";
import { Logo } from "@/components/Logo";
import type { UserCredential } from "firebase/auth";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.706 17.64 9.2z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.162 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="var(--volt-500)" />
      <path d="M6 10.5l2.5 2.5 5.5-5.5" stroke="var(--ink-800)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function run(fn: () => Promise<UserCredential>, isRegister = false) {
    setBusy(true);
    setError(null);
    try {
      const credential = await fn();

      // The returned credential is authoritative even if auth.currentUser lags
      // briefly after popup sign-in.
      const token = await credential.user.getIdToken();
      setSessionCookie(token);

      if (isRegister) {
        void logEvent("user_signed_up");
        setRegistered(true);
        // Brief success pause so the user sees confirmation before navigation.
        await new Promise((r) => setTimeout(r, 1200));
      }

      router.replace(redirectTo);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleMode() {
    setMode((m) => (m === "signin" ? "register" : "signin"));
    setError(null);
    setRegistered(false);
  }

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
      <div style={{ width: "100%", maxWidth: 400 }}>

        {/* Hero block — ink */}
        <div
          style={{
            background: "var(--ink-800)",
            borderRadius: "var(--r-2xl) var(--r-2xl) 0 0",
            padding: "2rem 2rem 1.75rem",
            position: "relative",
            overflow: "hidden",
            animation: "pb-rise 400ms var(--ease-out) both",
          }}
        >
          {/* Volt net texture overlay */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(198,241,53,0.06) 0 1px, transparent 1px 18px), repeating-linear-gradient(-45deg, rgba(198,241,53,0.06) 0 1px, transparent 1px 18px)",
              pointerEvents: "none",
            }}
          />

          {/* Logo */}
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "1.375rem",
              textDecoration: "none",
            }}
          >
            <Logo variant="full" theme="dark" size={52} animated showKicker />
          </Link>

          {/* Headline */}
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              fontSize: "clamp(2rem, 8vw, 2.625rem)",
              color: "var(--n-50)",
              textTransform: "uppercase",
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            {registered ? (
              <>You&apos;re<br /><span style={{ color: "var(--volt-500)" }}>in!</span></>
            ) : mode === "signin" ? (
              <>Welcome<br /><span style={{ color: "var(--volt-500)" }}>back.</span></>
            ) : (
              <>Join the<br /><span style={{ color: "var(--volt-500)" }}>crew.</span></>
            )}
          </div>
          <p
            style={{
              marginTop: "0.5rem",
              fontFamily: "var(--font-body)",
              fontSize: "0.875rem",
              color: "rgba(246,248,244,0.5)",
              lineHeight: 1.55,
            }}
          >
            {registered
              ? "Account created — taking you to the dashboard…"
              : mode === "signin"
                ? "Sign in to manage your sessions and squads."
                : "Create your account and start playing."}
          </p>
        </div>

        {/* Form card */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderTop: "none",
            borderRadius: "0 0 var(--r-2xl) var(--r-2xl)",
            boxShadow: "var(--shadow-md)",
            padding: "1.75rem 2rem 2rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.875rem",
            animation: "pb-rise 400ms 60ms var(--ease-out) both",
          }}
        >
          {registered ? (
            /* Success state — shown while the 1.2 s redirect delay runs */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.875rem",
                padding: "1rem 0",
              }}
            >
              <CheckIcon />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-1)" }}>
                  Account created!
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-3)", marginTop: "0.25rem" }}>
                  Signing you in automatically…
                </div>
              </div>
              <div
                style={{
                  width: "100%",
                  height: 4,
                  background: "var(--surface-sunken)",
                  borderRadius: "var(--r-pill)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    background: "var(--volt-500)",
                    borderRadius: "var(--r-pill)",
                    animation: "pb-progress 1.2s linear forwards",
                  }}
                />
              </div>
            </div>
          ) : (
            <>
              {/* Google */}
              <button
                className="pb-btn pb-btn-ink"
                disabled={busy}
                onClick={() => run(signInWithGoogle, mode === "register")}
              >
                <GoogleIcon />
                {mode === "register" ? "Sign up with Google" : "Continue with Google"}
              </button>

              <div className="pb-divider">or</div>

              {/* Email / password form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const isRegister = mode === "register";
                  run(
                    () =>
                      isRegister
                        ? registerWithEmail(email, password)
                        : signInWithEmail(email, password),
                    isRegister,
                  );
                }}
                style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}
              >
                <input
                  className="pb-input"
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <input
                  className="pb-input"
                  type="password"
                  placeholder={mode === "register" ? "Choose a password (min 6 chars)" : "Password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === "register" ? 6 : undefined}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
                <button
                  type="submit"
                  className="pb-btn pb-btn-volt"
                  disabled={busy}
                  style={{ marginTop: "0.25rem", height: 56, fontSize: "1.0625rem" }}
                >
                  {busy
                    ? "One moment…"
                    : mode === "signin"
                      ? "Sign in →"
                      : "Create account →"}
                </button>
              </form>

              {error && (
                <div className="pb-error" role="alert">
                  <span>⚠&nbsp;</span>
                  <span>{error}</span>
                </div>
              )}

              <button
                className="pb-btn pb-btn-ghost"
                onClick={toggleMode}
                style={{ fontSize: "0.875rem" }}
              >
                {mode === "signin"
                  ? "New here? Create an account →"
                  : "Already have an account? Sign in"}
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pb-progress {
          from { width: 0% }
          to   { width: 100% }
        }
      `}</style>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
