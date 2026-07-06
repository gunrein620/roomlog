import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ style, ...rest }: InputProps) {
  return (
    <input
      style={{
        height: "var(--touch-target)",
        border: "1px solid var(--input-border)",
        borderRadius: "var(--radius-md)",
        padding: "0 14px",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-body)",
        color: "var(--input-text)",
        background: "var(--surface-container-lowest)",
        width: "100%",
        boxSizing: "border-box",
        ...style,
      }}
      {...rest}
    />
  );
}
