"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  PLAYER_GENDER_LABELS,
  PLAYER_GENDERS,
  parsePlayerGender,
  type PlayerGender,
} from "@picklebaddies/domain";
import { normalizePlayerDisplayName } from "@/lib/auth/display-name";
import { updateMyPlayerProfile } from "@/server/users/actions";

type PlayerNameDialogProps = {
  currentName: string;
  currentGender: PlayerGender | null;
  open: boolean;
  requireGender?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export function PlayerNameDialog({
  currentName,
  currentGender,
  open,
  requireGender = false,
  onClose,
  onSaved,
}: PlayerNameDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(currentName);
  const [gender, setGender] = useState<PlayerGender | "">(currentGender ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(currentName);
    setGender(currentGender ?? "");
    setError(null);

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => inputRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving && !requireGender) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("input:not(:disabled), select:not(:disabled), button:not(:disabled)");
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
  }, [currentGender, currentName, onClose, open, requireGender, saving]);

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
    const parsedGender = parsePlayerGender(gender);
    if (!parsedGender) {
      setError("Choose Male, Female, or Non-binary.");
      return;
    }

    setSaving(true);
    try {
      const result = await updateMyPlayerProfile({ displayName, gender: parsedGender });
      if (!result.ok) throw new Error(result.message);
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update your profile");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="pb-confirm-backdrop"
      onMouseDown={(event) => {
        if (!saving && !requireGender && event.currentTarget === event.target) onClose();
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
        <h2 id={titleId}>{requireGender ? "Complete your player profile" : "Your player profile"}</h2>
        <p id={descriptionId}>
          We ask this so DuoRally can support mixed games and balanced session formats in future.
        </p>
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
          <label style={{ display: "grid", gap: "0.4rem", marginTop: "0.875rem" }}>
            <span style={{ color: "var(--text-1)", fontSize: "0.8125rem", fontWeight: 800 }}>
              Gender
            </span>
            <select
              className="pb-input"
              value={gender}
              onChange={(event) => setGender(event.target.value as PlayerGender | "")}
              disabled={saving}
              required
            >
              <option value="" disabled>Choose gender</option>
              {PLAYER_GENDERS.map((option) => (
                <option key={option} value={option}>{PLAYER_GENDER_LABELS[option]}</option>
              ))}
            </select>
          </label>
          {error && <div className="pb-error" role="alert" style={{ marginTop: "0.75rem" }}>{error}</div>}
          <div className="pb-confirm-dialog__actions">
            {!requireGender && (
              <button type="button" className="pb-confirm-dialog__cancel" onClick={onClose} disabled={saving}>
                Cancel
              </button>
            )}
            <button type="submit" className="pb-confirm-dialog__confirm" disabled={saving}>
              {saving ? "Saving profile..." : "Save profile"}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
