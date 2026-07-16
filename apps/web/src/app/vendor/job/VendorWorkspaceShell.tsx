"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PhoneFrame } from "@roomlog/ui";
import { ROUTES } from "@/lib/vendor-nav";
import { DomainEventNotifications } from "../../_components/DomainEventNotifications";

export function VendorWorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const settlementActive = pathname.startsWith(ROUTES["V-JOB-SETTLEMENT"]);

  return (
    <PhoneFrame label={<span>업체 워크스페이스</span>} homeHref="/vendor">
      <DomainEventNotifications placement="phone" />
      <nav
        aria-label="업체 작업 메뉴"
        style={{
          flex: "none",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-container-lowest)",
        }}
      >
        {[
          [ROUTES["V-JOB-00"], "작업", !settlementActive],
          [ROUTES["V-JOB-SETTLEMENT"], "정산", settlementActive],
        ].map(([href, label, active]) => (
          <Link
            key={String(href)}
            href={String(href)}
            aria-current={active ? "page" : undefined}
            style={{
              minHeight: 38,
              borderRadius: "var(--radius-btn)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              fontSize: "var(--fs-body)",
              fontWeight: 800,
              color: active ? "var(--on-primary-container)" : "var(--on-surface-variant)",
              background: active ? "var(--primary-container)" : "transparent",
            }}
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </PhoneFrame>
  );
}
