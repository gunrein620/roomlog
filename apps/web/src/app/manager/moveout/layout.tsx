import type { ReactNode } from "react";
import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";

export default function MoveoutManagerLayout({ children }: { children: ReactNode }) {
  return (
    <ManagerAppShell title="퇴실·정산 검토" context="관리 중인 집 · 퇴실 정산">
      {children}
    </ManagerAppShell>
  );
}
