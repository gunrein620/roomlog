import { redirect } from "next/navigation";
import {
  confirmTenantRepairPaymentOrder,
  getTenantRepairPaymentOrder,
} from "@/lib/tenant-repair-payment-api";
import { resolveTenantRepairPaymentSuccess } from "../callback";

export default async function TenantRepairPaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const target = await resolveTenantRepairPaymentSuccess(await searchParams, {
    getOrder: getTenantRepairPaymentOrder,
    confirmOrder: confirmTenantRepairPaymentOrder,
  });
  redirect(target);
}
