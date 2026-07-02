import type { ReactNode } from "react";

// M-DOC(데스크탑) — 각 page가 화면별 title로 ManagerShell을 직접 감싼다.
export default function ManagerContractLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
