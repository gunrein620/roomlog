import type { ReactNode } from "react";
import { ManagerShell } from "@roomlog/ui";
import { requireUser } from "@/lib/session";
import { ManagerMessagingNav } from "./_components";

export const dynamic = "force-dynamic";

export default async function ManagerMessagingLayout({ children }: { children: ReactNode }) {
  await requireUser("/manager/login", "LANDLORD");
  return (
    <ManagerShell title="소통" context="M-MSG · 관리인 데스크탑" nav={<ManagerMessagingNav />}>
      {children}
    </ManagerShell>
  );
}
