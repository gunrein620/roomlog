"use server";

import { revalidatePath } from "next/cache";
import { assignManagerVendor } from "@/lib/vendor-mgmt-api";
import type { ManagerMutationState } from "../../../_components/manager-mutation-state";
import {
  managerMutationError,
  managerMutationSuccess,
} from "../../../_components/manager-mutation-state";

function requiredFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} 값이 필요합니다.`);
  }
  return value.trim();
}

export async function assignVendorFromDashboardAction(
  _previousState: ManagerMutationState,
  formData: FormData,
): Promise<ManagerMutationState> {
  try {
    await assignManagerVendor(requiredFormString(formData, "ticketId"), {
      vendorId: requiredFormString(formData, "vendorId"),
      requestNote: "민원/하자 관리 화면에서 업체 배정을 요청했습니다.",
    });
    revalidatePath("/manager/ticket/dash/00");
    return managerMutationSuccess("업체를 배정했습니다.");
  } catch (error) {
    return managerMutationError(error);
  }
}
