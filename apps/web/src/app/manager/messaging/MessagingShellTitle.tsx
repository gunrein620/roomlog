"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";

export function MessagingShellTitle() {
  const pathname = usePathname();
  const isThreadDetail = pathname === MANAGER_MESSAGING_ROUTES["M-MSG-04"];

  if (!isThreadDetail) {
    return <>소통</>;
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-sm)" }}>
      <Link
        href={MANAGER_MESSAGING_ROUTES["M-MSG-00"]}
        aria-label="소통 허브로 돌아가기"
        style={{
          width: "calc(var(--touch-target) - var(--space-sm))",
          height: "calc(var(--touch-target) - var(--space-sm))",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          borderRadius: "var(--radius-btn)",
          color: "var(--on-surface)",
          textDecoration: "none",
        }}
      >
        <ArrowLeft aria-hidden="true" />
      </Link>
      <span>소통</span>
    </span>
  );
}
