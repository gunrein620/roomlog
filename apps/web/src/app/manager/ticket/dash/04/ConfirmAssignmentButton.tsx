"use client";

import type { ReactNode } from "react";

export function ConfirmAssignmentButton({
  className,
  disabled,
  confirmMessage,
  children,
}: {
  className: string;
  disabled?: boolean;
  confirmMessage?: string;
  children: ReactNode;
}) {
  return (
    <button
      className={className}
      type="submit"
      disabled={disabled}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
