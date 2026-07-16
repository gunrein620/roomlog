import type { ReactNode } from "react";
import { PhoneFrame } from "@roomlog/ui";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function TenantFurnitureLayout({ children }: { children: ReactNode }) {
  await requireUser("TENANT");

  return (
    <PhoneFrame label={<span>이사 준비 · 가구 배치</span>} fitViewport>
      {children}
    </PhoneFrame>
  );
}
