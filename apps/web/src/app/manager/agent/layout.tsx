import Link from "next/link";
import type { ReactNode } from "react";
import { ManagerShell } from "@roomlog/ui";
import { requireUser } from "@/lib/session";
import { MANAGER_CROSS, MHOME_ROUTES } from "@/lib/manager-home-nav";

export const dynamic = "force-dynamic";

export default async function ManagerAgentLayout({ children }: { children: ReactNode }) {
  await requireUser("LANDLORD");

  return (
    <ManagerShell title="실시간 AI 운영 에이전트" context="관리 중인 집 · Realtime" nav={<AgentNav />}>
      {children}
    </ManagerShell>
  );
}

function AgentNav() {
  const items = [
    ["홈", MHOME_ROUTES["M-HOME-00"]],
    ["에이전트", MANAGER_CROSS.realtimeAgent],
    ["티켓 처리", MANAGER_CROSS.ticketDash],
    ["청구", MANAGER_CROSS.billing],
    ["소통", MANAGER_CROSS.messaging],
  ] as const;

  return (
    <nav aria-label="관리인 AI 에이전트" style={{ display: "grid", gap: "var(--space-sm)" }}>
      {items.map(([label, href]) => (
        <Link key={href} href={href} style={navLinkStyle}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

const navLinkStyle = {
  minHeight: 42,
  display: "flex",
  alignItems: "center",
  padding: "0 var(--space-md)",
  borderRadius: "var(--radius)",
  color: "var(--on-surface)",
  textDecoration: "none",
  fontWeight: 800,
  background: "var(--surface-container-lowest)",
  border: "1px solid var(--border)",
} as const;
