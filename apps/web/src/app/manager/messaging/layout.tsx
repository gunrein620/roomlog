import type { ReactNode } from "react";
import { ManagerShell } from "@roomlog/ui";
import { ManagerMessagingNav } from "./_components";

export default function ManagerMessagingLayout({ children }: { children: ReactNode }) {
  return (
    <ManagerShell title="소통" context="M-MSG · 관리인 데스크탑" nav={<ManagerMessagingNav />}>
      {children}
    </ManagerShell>
  );
}
