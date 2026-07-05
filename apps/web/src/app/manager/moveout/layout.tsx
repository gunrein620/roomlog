import Link from "next/link";
import type { ReactNode } from "react";
import { ManagerShell } from "@roomlog/ui";
import { MANAGER_MOVEOUT_ROUTES } from "@/lib/moveout-manager-nav";

const navItems = [
  ["M-OUT-00", "대시보드"],
  ["M-OUT-01", "기록 리포트"],
  ["M-OUT-02", "예상 정산안"],
  ["M-OUT-03", "이의 처리"],
] as const;

export default function MoveoutManagerLayout({ children }: { children: ReactNode }) {
  return (
    <ManagerShell title="퇴실·정산 검토" context="관리 중인 집 · 퇴실 정산" nav={<MoveoutManagerNav />}>
      {children}
    </ManagerShell>
  );
}

function MoveoutManagerNav() {
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
      {navItems.map(([id, label]) => (
        <Link
          key={id}
          href={MANAGER_MOVEOUT_ROUTES[id]}
          style={{
            color: "var(--on-surface)",
            textDecoration: "none",
            padding: "var(--space-sm) var(--space-md)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            background: "var(--surface-container-lowest)",
            fontSize: "var(--fs-caption)",
            fontWeight: 700,
          }}
        >
          {label}
        </Link>
      ))}
      <div
        style={{
          marginTop: "var(--space-md)",
          padding: "var(--space-md)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          color: "var(--on-surface-variant)",
          fontSize: "var(--fs-caption)",
          lineHeight: "var(--lh-body)",
        }}
      >
        예상 정산안은 참고 검토용입니다. 실제 차감·반환 송금은 별도 고위험 플로우로
        분리합니다.
      </div>
    </nav>
  );
}
