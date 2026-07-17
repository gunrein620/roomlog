"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { VendorEstimateReviewInput } from "@roomlog/types";
import {
  assignManagerVendor,
  confirmEstimateVisit,
  reviewVendorEstimate,
  toSeoulScheduleIso,
} from "@/lib/vendor-mgmt-api";
import { ticketDashHref } from "../../_components/ticket-manager-ui";
import type { ManagerMutationState } from "../../../_components/manager-mutation-state";
import { managerMutationError } from "../../../_components/manager-mutation-state";

function required(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} 값이 필요합니다.`);
  return value.trim();
}

export async function assignVendorAction(
  _previousState: ManagerMutationState,
  formData: FormData,
): Promise<ManagerMutationState> {
  let ticketId: string;
  try {
    ticketId = required(formData, "ticketId");
    await assignManagerVendor(ticketId, {
      vendorId: required(formData, "vendorId"),
      requestNote: required(formData, "requestNote"),
    });
  } catch (error) {
    return managerMutationError(error);
  }
  revalidatePath(ticketDashHref("04", ticketId));
  redirect(ticketDashHref("04", ticketId));
}

export async function reviewEstimateAction(
  _previousState: ManagerMutationState,
  formData: FormData,
): Promise<ManagerMutationState> {
  let ticketId: string;
  try {
    ticketId = required(formData, "ticketId");
    const repairId = required(formData, "repairId");
    const estimateId = required(formData, "estimateId");
    const action = required(formData, "action");
    const note = String(formData.get("note") ?? "").trim();
    let input: VendorEstimateReviewInput;
    if (action === "APPROVE") {
      const costBearer = required(formData, "costBearer");
      if (!(["LANDLORD", "TENANT"] as const).includes(costBearer as never)) {
        throw new Error("비용 부담 주체를 확인해 주세요.");
      }
      input = {
        action: "APPROVE",
        costBearer: costBearer as "LANDLORD" | "TENANT",
        ...(note ? { note } : {}),
      };
    } else if (action === "REQUEST_REVISION" || action === "REJECT") {
      if (!note) throw new Error("검토 사유를 입력해 주세요.");
      input = { action, note };
    } else {
      throw new Error("지원하지 않는 견적 검토 방식입니다.");
    }
    await reviewVendorEstimate(repairId, estimateId, input);
  } catch (error) {
    return managerMutationError(error);
  }
  revalidatePath(ticketDashHref("04", ticketId));
  redirect(ticketDashHref("04", ticketId));
}

export async function confirmVisitAction(
  _previousState: ManagerMutationState,
  formData: FormData,
): Promise<ManagerMutationState> {
  let ticketId: string;
  try {
    ticketId = required(formData, "ticketId");
    await confirmEstimateVisit(
      required(formData, "repairId"),
      required(formData, "estimateId"),
      { scheduledAt: toSeoulScheduleIso(required(formData, "scheduledAt")) },
    );
  } catch (error) {
    return managerMutationError(error);
  }
  revalidatePath(ticketDashHref("04", ticketId));
  redirect(ticketDashHref("04", ticketId));
}
