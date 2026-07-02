import type { ReactNode } from "react";

export interface BadgeProps {
  children: ReactNode;
  /** 강조(테두리 진하게) — 현재 상태 등 */
  emphasis?: boolean;
  style?: React.CSSProperties;
}

/** 칩/뱃지 — pill 형태. 상태·긴급도 등 메타데이터 */
export function Badge({ children, emphasis, style }: BadgeProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "var(--chip-bg)",
        color: "var(--chip-on)",
        border: emphasis ? "1.5px solid var(--primary)" : "1px solid transparent",
        borderRadius: "var(--radius-full)",
        padding: "4px 12px",
        fontSize: "var(--fs-caption)",
        fontFamily: "var(--font-sans)",
        lineHeight: "var(--lh-caption)",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
