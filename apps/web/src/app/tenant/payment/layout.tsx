import type { ReactNode } from "react";
import { requireUser } from "@/lib/session";
import { ResponsiveTenantPaymentShell } from "./ResponsiveTenantPaymentShell";

// 결제 콘텐츠는 한 번만 렌더하고, 공용 셸이 화면 폭에 맞는 크롬을 제공한다.
export default async function PaymentLayout({ children }: { children: ReactNode }) {
  await requireUser("TENANT", "/tenant/payment/00");

  return <ResponsiveTenantPaymentShell>{children}</ResponsiveTenantPaymentShell>;
}
