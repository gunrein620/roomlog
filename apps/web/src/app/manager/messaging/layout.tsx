import type { ReactNode } from "react";
import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ManagerMessagingLayout({ children }: { children: ReactNode }) {
  await requireUser("LANDLORD");
  return (
    <ManagerAppShell title="소통" context="관리 중인 집 · 소통">
      {children}
    </ManagerAppShell>
  );
}
