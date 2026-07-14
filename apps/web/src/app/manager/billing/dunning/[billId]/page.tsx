import { redirect } from "next/navigation";
import { getManagerDunning } from "@/lib/billing-manager-api";

type Params = Promise<{ billId: string }>;
type SearchParams = Promise<{ id?: string }>;

export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ billId }, { id }] = await Promise.all([params, searchParams]);
  const targetBillId = id || billId;
  const draft = await getManagerDunning(targetBillId);
  const prompt = [
    draft.buildingName,
    `${draft.unitId}호`,
    `${draft.tenantName}님의`,
    draft.billingMonth ? `${draft.billingMonth} 청구` : "연체 청구",
    `미수금 ${draft.unpaidAmount.toLocaleString("ko-KR")}원 독촉 문구를 준비해줘.`,
    "발송 전에는 반드시 나에게 확인받아.",
  ]
    .filter(Boolean)
    .join(" ");
  const query = new URLSearchParams({ billId: targetBillId, prompt });

  redirect(`/manager/agent/realtime?${query.toString()}`);
}
