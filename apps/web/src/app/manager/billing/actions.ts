"use server";

import { redirect } from "next/navigation";
import type { ManagerBillDetail } from "@roomlog/types";
import { getManagerBill, publishManagerBill } from "@/lib/billing-manager-api";
import { ApiError } from "@/lib/server-api";
import { requireUser } from "@/lib/session";

type DashboardRedirectOptions = {
  billId: string;
  billingMonth?: string;
  buildingName?: string;
  published?: boolean;
  publishError?: string;
};

function dashboardRedirectHref(options: DashboardRedirectOptions) {
  const params = new URLSearchParams({ billId: options.billId });
  if (options.billingMonth) params.set("month", options.billingMonth);
  if (options.buildingName) params.set("building", options.buildingName);
  if (options.published) params.set("published", "1");
  if (options.publishError) params.set("publishError", options.publishError);
  return `/manager/billing?${params.toString()}`;
}

export async function loadManagerBillDetailAction(billId: string): Promise<ManagerBillDetail> {
  await requireUser("LANDLORD", "/manager/billing");
  const normalizedBillId = billId.trim();
  if (!normalizedBillId) throw new Error("청구 정보가 없습니다.");
  return getManagerBill(normalizedBillId);
}

export async function publishBillAction(formData: FormData) {
  await requireUser("LANDLORD", "/manager/billing");
  const billId = String(formData.get("billId") ?? "").trim();
  const billingMonth = String(formData.get("billingMonth") ?? "").trim();
  const buildingName = String(formData.get("buildingName") ?? "").trim();

  if (!billId) redirect("/manager/billing?publishError=missing-bill");

  try {
    await publishManagerBill(billId);
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : "청구서를 확정하지 못했습니다.";
    redirect(
      dashboardRedirectHref({
        billId,
        billingMonth,
        buildingName,
        publishError: message,
      }),
    );
  }

  redirect(
    dashboardRedirectHref({
      billId,
      billingMonth,
      buildingName,
      published: true,
    }),
  );
}
