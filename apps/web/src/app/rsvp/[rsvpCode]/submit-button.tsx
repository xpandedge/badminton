"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface RsvpSubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pendingLabel?: ReactNode;
}

export function RsvpSubmitButton({
  pendingLabel = "Updating...",
  children,
  disabled,
  style,
  ...props
}: RsvpSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = pending || Boolean(disabled);

  return (
    <button
      {...props}
      type={props.type ?? "submit"}
      disabled={isDisabled}
      aria-busy={pending || undefined}
      style={{
        ...style,
        cursor: isDisabled ? "default" : style?.cursor ?? "pointer",
        opacity: pending ? 0.55 : style?.opacity,
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
