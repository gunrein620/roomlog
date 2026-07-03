import Link from "next/link";
import type { ReactNode } from "react";
import { ManagerShell } from "@roomlog/ui";
import { MANAGER_COST_ROUTES } from "@/lib/cost-nav";

const navItems = [
  ["M-COST-00", "원장/큐"],
  ["M-COST-01", "영수증 첨부"],
  ["M-COST-02", "OCR 검토"],
  ["M-COST-03", "비용 상세"],
  ["M-COST-04", "공개 관리"],
  ["M-COST-E0", "오류 복구"],
] as const;

export default function CostLayout({ children }: { children: ReactNode }) {
  return (
    <ManagerShell title="비용 원장" context="M-COST · 지출 투명성" nav={<CostNav />}>
      {children}
    </ManagerShell>
  );
}

function CostNav() {
  return (
    <nav aria-label="관리인 비용 화면" style={{ display: "grid", gap: "var(--space-sm)" }}>
      {navItems.map(([id, label]) => (
        <Link
          key={id}
          href={MANAGER_COST_ROUTES[id]}
          style={{
            color: "var(--on-surface)",
            textDecoration: "none",
            minHeight: 40,
            display: "flex",
            alignItems: "center",
            padding: "0 var(--space-md)",
            borderRadius: "var(--radius)",
            background: "var(--surface-container-lowest)",
            border: "1px solid var(--border)",
            fontSize: "var(--fs-caption)",
            fontWeight: 800,
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
          borderRadius: "var(--radius)",
          background: "var(--surface-container-lowest)",
          color: "var(--on-surface-variant)",
          fontSize: "var(--fs-caption)",
          lineHeight: "var(--lh-body)",
        }}
      >
        비용은 지출 원장입니다. 청구액(M-BILL)과 관리비 사용내역(T-PAY-04)은 같은 수치로
        취급하지 않습니다.
      </div>
    </nav>
  );
}
