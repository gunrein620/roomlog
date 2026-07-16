import type { ReactNode } from "react";
import { requireUser } from "@/lib/session";
import { VendorWorkspaceShell } from "./VendorWorkspaceShell";

// 인증 쿠키를 읽는 서버 컴포넌트라 정적 프리렌더 제외.
export const dynamic = "force-dynamic";

export default async function VendorLayout({ children }: { children: ReactNode }) {
  // [레퍼런스 가드] 수리업체(VENDOR) 전용.
  await requireUser("VENDOR");
  return <VendorWorkspaceShell>{children}</VendorWorkspaceShell>;
}
