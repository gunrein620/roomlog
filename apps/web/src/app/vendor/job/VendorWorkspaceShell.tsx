"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { PhoneFrame } from "@roomlog/ui";
import { ROUTES } from "@/lib/vendor-nav";
import { DomainEventNotifications } from "../../_components/DomainEventNotifications";

export function VendorWorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const settlementActive = pathname.startsWith(ROUTES["V-JOB-SETTLEMENT"]);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function logout() {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("logout_failed");
      window.location.replace("/login?intent=vendor");
    } catch {
      setLogoutError("로그아웃하지 못했습니다. 다시 시도해 주세요.");
      setLogoutPending(false);
    }
  }

  const logoutAction = (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={logout}
        disabled={logoutPending}
        aria-busy={logoutPending}
        aria-label={logoutPending ? "로그아웃 중" : "로그아웃"}
        style={{
          border: 0,
          padding: "4px 0",
          background: "transparent",
          color: "var(--on-surface)",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          font: "inherit",
          fontWeight: 800,
          cursor: logoutPending ? "wait" : "pointer",
          opacity: logoutPending ? 0.64 : 1,
        }}
      >
        <LogOut size={14} strokeWidth={2.2} aria-hidden="true" />
        {logoutPending ? "로그아웃 중…" : "로그아웃"}
      </button>
      {logoutError ? (
        <span
          role="alert"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 20,
            width: 220,
            padding: "var(--space-sm) var(--space-md)",
            border: "1px solid var(--error)",
            borderRadius: "var(--radius-btn)",
            background: "var(--surface-container-lowest)",
            color: "var(--error)",
            boxShadow: "var(--shadow)",
            fontSize: "var(--fs-caption)",
            lineHeight: "var(--lh-body)",
          }}
        >
          {logoutError}
        </span>
      ) : null}
    </span>
  );

  return (
    <PhoneFrame label={<span>업체 워크스페이스</span>} leadingAction={logoutAction}>
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
