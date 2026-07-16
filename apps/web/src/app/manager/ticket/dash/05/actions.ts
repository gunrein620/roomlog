"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { decideRepairCompletion } from "@/lib/vendor-mgmt-api";
import { ticketDashHref } from "../../_components/ticket-manager-ui";
import type { ManagerMutationState } from "../../../_components/manager-mutation-state";
import { managerMutationError } from "../../../_components/manager-mutation-state";

function required(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} 값이 필요합니다.`);
  return value.trim();
}

export async function decideCompletionAction(
  _previousState: ManagerMutationState,
  formData: FormData,
): Promise<ManagerMutationState> {
  let ticketId: string;
  let repairId: string;
  try {
    ticketId = required(formData, "ticketId");
    repairId = required(formData, "repairId");
    const decision = required(formData, "decision");
    const note = String(formData.get("note") ?? "").trim();
    if (decision === "REJECTED" && !note) throw new Error("완료 반려 사유를 입력해 주세요.");
    if (decision !== "APPROVED" && decision !== "REJECTED") {
      throw new Error("지원하지 않는 완료 검토 방식입니다.");
    }
    await decideRepairCompletion(
      repairId,
      decision === "REJECTED"
        ? { decision: "REJECTED", note }
        : { decision: "APPROVED", ...(note ? { note } : {}) },
    );
  } catch (error) {
    return managerMutationError(error);
  }
  const href = `${ticketDashHref("05", ticketId)}&repairId=${encodeURIComponent(repairId)}`;
  revalidatePath(href);
  redirect(href);
}
