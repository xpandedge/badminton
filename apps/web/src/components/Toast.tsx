"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export type ToastMessage = {
  id: number;
  message: string;
  tone?: "success" | "error";
};

export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, 3600);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast]);

  if (!toast || typeof document === "undefined") return null;

  const tone = toast.tone ?? "success";

  return createPortal(
    <div className="pb-toast" data-tone={tone} role={tone === "error" ? "alert" : "status"}>
      <span className="pb-toast__marker" aria-hidden="true">{tone === "error" ? "!" : "OK"}</span>
      <span className="pb-toast__message">{toast.message}</span>
      <button type="button" className="pb-toast__close" onClick={onDismiss} aria-label="Dismiss notification">
        &times;
      </button>
    </div>,
    document.body,
  );
}
