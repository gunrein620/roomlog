import type { ReactNode } from "react";
import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";

export default function CostLayout({ children }: { children: ReactNode }) {
  return (
    <ManagerAppShell title="비용 원장" context="관리 중인 집 · 비용 원장">
      {children}
    </ManagerAppShell>
  );
}
