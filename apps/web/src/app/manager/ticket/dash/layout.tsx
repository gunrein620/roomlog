import type { ReactNode } from "react";
import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";
import { requireUser } from "@/lib/session";

// 인증 쿠키를 읽는 서버 컴포넌트라 정적 프리렌더 대상 아님(요청마다 렌더).
export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: { children: ReactNode }) {
  // [레퍼런스 가드] 관리인(LANDLORD) 전용. 미인증/타역할이면 관리인 로그인으로.
  await requireUser("LANDLORD");
  return (
    <ManagerAppShell
      title="하자/민원 티켓 처리"
      context="관리 중인 집 · 하자·민원"
      subnav={false}
    >
      {children}
    </ManagerAppShell>
  );
}
