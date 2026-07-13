"use server";

import { redirect } from "next/navigation";
import type { CreateManagerBillsInput } from "@roomlog/types";
import { createManagerBills } from "@/lib/billing-manager-api";
import { ApiError } from "@/lib/server-api";

export interface CreateBillsActionState {
  error?: string;
}

export async function createBillsAction(
  _previous: CreateBillsActionState,
  formData: FormData,
): Promise<CreateBillsActionState> {
  const buildingName = String(formData.get("buildingName") ?? "").trim();
  const billingMonth = String(formData.get("billingMonth") ?? "").trim();
  const selectedRoomIds = formData.getAll("selectedRoomId").map(String);

  if (!buildingName || !billingMonth || selectedRoomIds.length === 0) {
    return { error: "건물과 청구월을 확인하고 호실을 하나 이상 선택해주세요." };
  }

  const input: CreateManagerBillsInput = {
    buildingName,
    billingMonth,
    account: {
      bankName: String(formData.get("bankName") ?? "").trim(),
      accountNumber: String(formData.get("accountNumber") ?? "").trim(),
      accountHolder: String(formData.get("accountHolder") ?? "").trim(),
    },
    rows: selectedRoomIds.map((roomId) => ({
      roomId,
      contractId: String(formData.get(`contractId:${roomId}`) ?? ""),
      monthlyRent: Number(formData.get(`monthlyRent:${roomId}`)),
      maintenanceFee: Number(formData.get(`maintenanceFee:${roomId}`)),
      dueDate: String(formData.get(`dueDate:${roomId}`) ?? ""),
    })),
  };

  let result;
  try {
    result = await createManagerBills(input);
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : "청구 저장 서버에 연결할 수 없습니다.";
    return { error: `${message} 어떤 초안도 저장되지 않았습니다.` };
  }

  const params = new URLSearchParams({
    building: result.buildingName,
    month: result.billingMonth,
    created: String(result.createdCount),
  });
  redirect(`/manager/billing?${params.toString()}`);
}
