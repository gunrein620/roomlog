import Link from "next/link";
import type { ReactNode } from "react";
import { ManagerShell } from "@roomlog/ui";
import { dashRoutes } from "../_components/ticket-manager-ui";

const navItems = [
  ["00", "대시보드"],
  ["01", "상세·검토"],
  ["02", "사진 비교"],
  ["03", "답변 초안"],
  ["04", "업체·수리"],
  ["05", "결제 승인"],
  ["e0", "로드 오류"],
] as const;

export default function DashLayout({ children }: { children: ReactNode }) {
  return (
    <ManagerShell
      title="하자/민원 티켓 처리"
      context="M-DASH · 데스크탑"
      nav={
        <nav style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          {navItems.map(([id, label]) => (
            <Link
              key={id}
              href={dashRoutes[id]}
              style={{
                color: "var(--on-surface)",
                textDecoration: "none",
                padding: "var(--space-sm) var(--space-md)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--surface-container-lowest)",
                fontSize: "var(--fs-caption)",
              }}
            >
              M-DASH-{id.toUpperCase()} · {label}
            </Link>
          ))}
          <Link
            href="/manager/ticket/call/00"
            style={{
              color: "var(--primary)",
              textDecoration: "none",
              padding: "var(--space-sm) var(--space-md)",
              borderRadius: "var(--radius)",
              border: "1.5px solid var(--primary)",
              fontSize: "var(--fs-caption)",
              marginTop: "var(--space-md)",
            }}
          >
            모바일 통화로 처리
          </Link>
        </nav>
      }
    >
      {children}
    </ManagerShell>
  );
}
