import { redirect } from "next/navigation";
import {
  confirmManagerRepairPaymentOrder,
  getManagerRepairPaymentOrder,
} from "@/lib/vendor-credit-api";
import { resolveManagerRepairPaymentSuccess } from "../callback";

export default async function ManagerRepairPaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const target = await resolveManagerRepairPaymentSuccess(await searchParams, {
    getOrder: getManagerRepairPaymentOrder,
    confirmOrder: confirmManagerRepairPaymentOrder,
  });
  redirect(target);
}
