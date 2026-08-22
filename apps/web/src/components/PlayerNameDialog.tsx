"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { normalizePlayerDisplayName } from "@/lib/auth/display-name";
import { updateMyDisplayName } from "@/server/users/actions";

type PlayerNameDialogProps = {
  currentName: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export function PlayerNameDialog({ currentName, open, onClose, onSaved }: PlayerNameDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(currentName);
    setError(null);

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => inputRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)");
      if (!focusable?.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [currentName, onClose, open, saving]);

  if (!open || typeof document === "undefined") return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    let displayName: string;
    try {
      displayName = normalizePlayerDisplayName(name);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Enter a valid player name");
      return;
    }

    setSaving(true);
    try {
      const result = await updateMyDisplayName(displayName);
      if (!result.ok) throw new Error(result.message);
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update your name");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="pb-confirm-backdrop"
      onMouseDown={(event) => {
        if (!saving && event.currentTarget === event.target) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="pb-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="pb-confirm-dialog__handle" aria-hidden="true" />
        <div className="pb-confirm-dialog__heading">
          <span className="pb-confirm-dialog__marker" aria-hidden="true" />
          <span>Your account</span>
        </div>
        <h2 id={titleId}>Your player name</h2>
        <p id={descriptionId}>This is the name other players will see across DuoRally.</p>
        <form onSubmit={handleSubmit} style={{ marginTop: "1rem" }}>
          <label style={{ display: "grid", gap: "0.4rem" }}>
            <span style={{ color: "var(--text-1)", fontSize: "0.8125rem", fontWeight: 800 }}>
              What should players call you?
            </span>
            <input
              ref={inputRef}
              className="pb-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={60}
              autoComplete="name"
              disabled={saving}
              required
            />
          </label>
          {error && <div className="pb-error" role="alert" style={{ marginTop: "0.75rem" }}>{error}</div>}
          <div className="pb-confirm-dialog__actions">
            <button type="button" className="pb-confirm-dialog__cancel" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="pb-confirm-dialog__confirm" disabled={saving}>
              {saving ? "Saving name..." : "Save name"}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
