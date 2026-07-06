import type { ReactNode } from "react";
import { ManagerShell } from "@roomlog/ui";
import { requireUser } from "@/lib/session";
import { ManagerMessagingNav } from "./_components";

export const dynamic = "force-dynamic";

export default async function ManagerMessagingLayout({ children }: { children: ReactNode }) {
  await requireUser("LANDLORD");
  return (
    <ManagerShell title="소통" context="관리 중인 집 · 소통" nav={<ManagerMessagingNav />}>
      {children}
    </ManagerShell>
  );
}
