import { redirect } from "next/navigation";
import { getManagerBill } from "@/lib/billing-manager-api";

type Params = Promise<{ billId: string }>;
type SearchParams = Promise<{ id?: string | string[] }>;

function single(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ billId }, query] = await Promise.all([params, searchParams]);
  const targetBillId = single(query.id) || billId;
  const bill = await getManagerBill(targetBillId);
  const dashboardQuery = new URLSearchParams({
    billId: targetBillId,
    month: bill.billingMonth,
  });

  redirect(`/manager/billing?${dashboardQuery.toString()}`);
}
