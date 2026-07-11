"use server";

import { redirect } from "next/navigation";
import { publishManagerBill } from "@/lib/billing-manager-api";
import { ApiError } from "@/lib/server-api";

export async function publishBillAction(formData: FormData) {
  const billId = String(formData.get("billId") ?? "").trim();
  if (!billId) redirect("/manager/billing?publishError=missing-bill");

  try {
    await publishManagerBill(billId);
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : "청구서를 확정하지 못했습니다.";
    redirect(
      `/manager/billing/${encodeURIComponent(billId)}?publishError=${encodeURIComponent(message)}`,
    );
  }

  redirect(`/manager/billing/${encodeURIComponent(billId)}?published=1`);
}
