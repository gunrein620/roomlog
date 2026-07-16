import type { ReactNode } from "react";
import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function VendorMgmtLayout({ children }: { children: ReactNode }) {
  await requireUser("LANDLORD", "/manager/vendor-mgmt/vendors");
  return (
    <ManagerAppShell title="업체 관리" context="협력업체 · 작업 · 결제">
      {children}
    </ManagerAppShell>
  );
}
