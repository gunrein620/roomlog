import { redirect } from "next/navigation";
import {
  cancelTenantRepairPaymentOrder,
  getTenantRepairPaymentOrder,
} from "@/lib/tenant-repair-payment-api";
import { resolveTenantRepairPaymentFailure } from "../callback";

export default async function TenantRepairPaymentFailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const target = await resolveTenantRepairPaymentFailure(await searchParams, {
    getOrder: getTenantRepairPaymentOrder,
    cancelOrder: cancelTenantRepairPaymentOrder,
  });
  redirect(target);
}
