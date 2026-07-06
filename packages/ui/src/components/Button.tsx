import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
  children: ReactNode;
}

const base = {
  height: "var(--touch-target)",
  borderRadius: "var(--radius-btn)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  cursor: "pointer",
  padding: "0 16px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
} as const;

const variants: Record<Variant, React.CSSProperties> = {
  primary: { background: "var(--primary)", color: "var(--on-primary)", border: "none" },
  secondary: {
    background: "transparent",
    color: "var(--primary)",
    border: "1.5px solid var(--primary)",
  },
  ghost: { background: "transparent", color: "var(--on-surface-variant)", border: "none" },
};

export function Button({
  variant = "primary",
  fullWidth,
  children,
  style,
  ...rest
}: ButtonProps) {
  return (
    <button
      style={{ ...base, ...variants[variant], width: fullWidth ? "100%" : undefined, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}
