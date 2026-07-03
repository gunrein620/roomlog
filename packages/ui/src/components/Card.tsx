import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ children, style, ...rest }: CardProps) {
  return (
    <div
      style={{
        background: "var(--surface-container-lowest)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--card-padding)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
