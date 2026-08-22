"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  signInWithGoogle,
  signInWithEmail,
  registerWithEmail,
  sendPasswordReset,
} from "@/lib/auth/sign-in";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { Logo } from "@/components/Logo";
import { LegalLinks } from "@/components/LegalLinks";
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

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/dashboard";
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<UserCredential>) {
    setBusy(true);
    setError(null);
    setResetMessage(null);
    try {
      const credential = await fn();

      // The returned credential is authoritative even if auth.currentUser lags
      // briefly after popup sign-in.
      const token = await credential.user.getIdToken();
      setSessionCookie(token);

      router.replace(redirectTo);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordReset() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your email address first, then request a reset link.");
      setResetMessage(null);
      return;
    }

    setBusy(true);
    setError(null);
    setResetMessage(null);
    try {
      await sendPasswordReset(trimmedEmail);
      setResetMessage("If an account exists for that email, a DuoRally password reset link has been sent.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Password reset failed");
    } finally {
      setBusy(false);
    }
  }

  function switchMode(nextMode: "sign-in" | "create") {
    setMode(nextMode);
    setError(null);
    setResetMessage(null);
  }

  function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCreateMode && password !== confirmPassword) {
      setError("Passwords do not match.");
      setResetMessage(null);
      return;
    }
    run(() => isCreateMode
      ? registerWithEmail(email, password, displayName)
      : signInWithEmail(email, password));
  }

  const isCreateMode = mode === "create";

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
            {isCreateMode ? "Create" : "Welcome"}<br /><span style={{ color: "var(--volt-500)" }}>{isCreateMode ? "account." : "back."}</span>
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
            {isCreateMode ? "Join with Google, or create an account with email." : "Continue with Google, create an account, or sign in with email."}
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
          <>
              {/* Google */}
              <button
                className="pb-btn pb-btn-ink"
                disabled={busy}
                onClick={() => run(signInWithGoogle)}
              >
                <GoogleIcon />
                Continue with Google
              </button>

              <div className="pb-divider">or</div>

              <div
                role="tablist"
                aria-label="Account mode"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.35rem",
                  padding: "0.25rem",
                  borderRadius: "var(--r-lg)",
                  background: "var(--surface-sunken)",
                  border: "1px solid var(--border)",
                }}
              >
                {[
                  { value: "sign-in" as const, label: "Sign in" },
                  { value: "create" as const, label: "Create account" },
                ].map((option) => {
                  const selected = mode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      disabled={busy}
                      onClick={() => switchMode(option.value)}
                      style={{
                        minHeight: 40,
                        border: "none",
                        borderRadius: "var(--r-md)",
                        background: selected ? "var(--ink-800)" : "transparent",
                        color: selected ? "var(--volt-500)" : "var(--text-2)",
                        fontWeight: 900,
                        cursor: busy ? "default" : "pointer",
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {/* Email / password form */}
              <form
                onSubmit={handleEmailSubmit}
                style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}
              >
                {isCreateMode && (
                  <input
                    className="pb-input"
                    type="text"
                    placeholder="Player name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    autoComplete="name"
                    minLength={2}
                  />
                )}
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
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={isCreateMode ? "new-password" : "current-password"}
                />
                {isCreateMode && (
                  <input
                    className="pb-input"
                    type="password"
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                )}
                {!isCreateMode && (
                  <button
                    type="button"
                    className="pb-link-button"
                    disabled={busy}
                    onClick={handlePasswordReset}
                    style={{
                      alignSelf: "flex-end",
                      border: "none",
                      background: "transparent",
                      color: "var(--text-2)",
                      cursor: busy ? "default" : "pointer",
                      font: "inherit",
                      fontSize: "0.8125rem",
                      fontWeight: 700,
                      padding: "0.125rem 0",
                      textDecoration: "underline",
                      textUnderlineOffset: 3,
                    }}
                  >
                    Forgot password?
                  </button>
                )}
                <button
                  type="submit"
                  className="pb-btn pb-btn-volt"
                  disabled={busy}
                  style={{ marginTop: "0.25rem", height: 56, fontSize: "1.0625rem" }}
                >
                  {busy ? "One moment..." : isCreateMode ? "Create account ->" : "Sign in ->"}
                </button>
              </form>

              {error && (
                <div className="pb-error" role="alert">
                  <span>⚠&nbsp;</span>
                  <span>{error}</span>
                </div>
              )}
              {resetMessage && (
                <div
                  className="pb-success"
                  role="status"
                  style={{
                    alignItems: "flex-start",
                    background: "rgba(198,241,53,0.14)",
                    border: "1px solid rgba(198,241,53,0.35)",
                    borderRadius: "var(--r-lg)",
                    color: "var(--text-1)",
                    display: "flex",
                    fontSize: "0.8125rem",
                    gap: "0.375rem",
                    lineHeight: 1.45,
                    padding: "0.75rem 0.875rem",
                  }}
                >
                  <span>{resetMessage}</span>
                </div>
              )}

              <p className="pb-legal-consent">
                By continuing, you agree to the <Link href="/terms">Terms</Link> and acknowledge the{" "}
                <Link href="/privacy">Privacy Policy</Link>.
              </p>
              <LegalLinks compact />
          </>
        </div>
      </div>

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
