import type { ReactNode } from "react";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// M-HOME(데스크탑) — 각 page가 화면별 타이틀로 @roomlog/ui ManagerShell을 직접 감싼다.
// 따라서 이 레이아웃은 통과만 한다.
export default async function ManagerHomeLayout({ children }: { children: ReactNode }) {
  await requireUser("LANDLORD");
  return <>{children}</>;
}
