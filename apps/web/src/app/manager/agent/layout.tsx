import type { ReactNode } from "react";
import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ManagerAgentLayout({ children }: { children: ReactNode }) {
  await requireUser("LANDLORD");

  return (
    <ManagerAppShell title="실시간 AI 운영 에이전트" context="관리 중인 집 · Realtime">
      {children}
    </ManagerAppShell>
  );
}
