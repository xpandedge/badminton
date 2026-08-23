"use client";

import { useState } from "react";
import { submitSupportRequest } from "@/server/support/actions";

export function SupportForm() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setStatus(null);
    const result = await submitSupportRequest({ subject, message, honeypot }).catch(() => null);
    setBusy(false);

    if (!result || !result.ok) {
      setStatus({ type: "error", message: result?.message ?? "Support is temporarily unavailable. Please try again later." });
      return;
    }

    setSubject("");
    setMessage("");
    setHoneypot("");
    setStatus({ type: "success", message: "Thanks. Your support request has been logged." });
  }

  return (
    <section
      id="support"
      style={{
        display: "grid",
        gap: "0.875rem",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-xl)",
        padding: "1rem",
        boxShadow: "var(--shadow-sm)",
        scrollMarginTop: 80,
      }}
    >
      <div>
        <p style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.625rem",
          fontWeight: 900,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          marginBottom: "0.375rem",
        }}>
          Need a hand?
        </p>
        <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, color: "var(--text-1)" }}>
          Contact support
        </h2>
        <p style={{ marginTop: "0.375rem", color: "var(--text-2)", fontSize: "0.875rem", lineHeight: 1.55 }}>
          Send a question or report a problem and we will get back to you.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.75rem" }}>
        <label style={{ display: "grid", gap: "0.375rem", color: "var(--text-2)", fontSize: "0.8125rem", fontWeight: 800 }}>
          Subject
          <input
            className="pb-input"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="What can we help with?"
            minLength={3}
            maxLength={120}
            required
            disabled={busy}
            style={{ marginTop: 0 }}
          />
        </label>

        <label style={{ display: "grid", gap: "0.375rem", color: "var(--text-2)", fontSize: "0.8125rem", fontWeight: 800 }}>
          Message
          <textarea
            className="pb-input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Tell us what happened, including the session or squad if relevant."
            minLength={10}
            maxLength={4000}
            required
            disabled={busy}
            rows={5}
            style={{ marginTop: 0, resize: "vertical", minHeight: 128 }}
          />
        </label>

        <label aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
          Leave this field empty
          <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
        </label>

        <button type="submit" className="pb-btn pb-btn-volt" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Sending..." : "Send to support"}
        </button>
      </form>

      {status && (
        <p
          role="status"
          aria-live="polite"
          style={{
            margin: 0,
            color: status.type === "success" ? "var(--success)" : "var(--danger)",
            fontSize: "0.8125rem",
            fontWeight: 800,
            lineHeight: 1.45,
          }}
        >
          {status.message}
        </p>
      )}
    </section>
  );
}
