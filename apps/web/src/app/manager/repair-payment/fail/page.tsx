import { redirect } from "next/navigation";
import {
  cancelManagerRepairPaymentOrder,
  getManagerRepairPaymentOrder,
} from "@/lib/vendor-credit-api";
import { resolveManagerRepairPaymentFailure } from "../callback";

export default async function ManagerRepairPaymentFailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const target = await resolveManagerRepairPaymentFailure(await searchParams, {
    getOrder: getManagerRepairPaymentOrder,
    cancelOrder: cancelManagerRepairPaymentOrder,
  });
  redirect(target);
}
