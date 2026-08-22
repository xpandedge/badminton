"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ConfirmDialogOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "default" | "danger";
};

type ConfirmDialogProps = {
  options: ConfirmDialogOptions | null;
  onCancel: () => void;
  onConfirm: () => void;
};

function ConfirmDialog({ options, onCancel, onConfirm }: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!options) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => cancelRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)");
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
  }, [onCancel, options]);

  if (!options || typeof document === "undefined") return null;

  const tone = options.tone ?? "default";

  return createPortal(
    <div
      className="pb-confirm-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        className="pb-confirm-dialog"
        data-tone={tone}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="pb-confirm-dialog__handle" aria-hidden="true" />
        <div className="pb-confirm-dialog__heading">
          <span className="pb-confirm-dialog__marker" aria-hidden="true" />
          <span>{tone === "danger" ? "This affects the session" : "Confirm change"}</span>
        </div>
        <h2 id={titleId}>{options.title}</h2>
        <p id={descriptionId}>{options.description}</p>
        <div className="pb-confirm-dialog__actions">
          <button ref={cancelRef} type="button" className="pb-confirm-dialog__cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="pb-confirm-dialog__confirm" onClick={onConfirm}>
            {options.confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const close = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback((nextOptions: ConfirmDialogOptions) => {
    resolverRef.current?.(false);

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions(nextOptions);
    });
  }, []);

  const handleCancel = useCallback(() => close(false), [close]);
  const handleConfirm = useCallback(() => close(true), [close]);

  useEffect(() => () => resolverRef.current?.(false), []);

  return {
    confirm,
    confirmationDialog: (
      <ConfirmDialog
        options={options}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
      />
    ),
  };
}
