"use server";

import { revalidatePath } from "next/cache";
import { decideManagerTicketResponsibility } from "@/lib/ticket-manager-api";
import { requireUser } from "@/lib/session";
import type { ManagerMutationState } from "../../../_components/manager-mutation-state";
import {
  managerMutationError,
  managerMutationSuccess,
} from "../../../_components/manager-mutation-state";
import { ticketDashHref } from "../../_components/ticket-manager-ui";

function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function decideResponsibilityAction(
  _previousState: ManagerMutationState,
  formData: FormData,
): Promise<ManagerMutationState> {
  const ticketId = formString(formData, "ticketId");
  const responsibility = formString(formData, "responsibility");
  const note = formString(formData, "note");

  try {
    await requireUser(
      "LANDLORD",
      ticketDashHref("01", ticketId),
    );
    if (!ticketId) throw new Error("티켓을 확인해 주세요.");
    if (responsibility !== "TENANT" && responsibility !== "LANDLORD") {
      throw new Error("책임 주체를 선택해 주세요.");
    }
    if (!note) throw new Error("세입자에게 보이는 확정 사유를 입력해 주세요.");

    await decideManagerTicketResponsibility(ticketId, { responsibility, note });
    revalidatePath(ticketDashHref("01", ticketId));
    return managerMutationSuccess("책임 판단을 확정하고 세입자에게 알렸습니다.");
  } catch (error) {
    return managerMutationError(error);
  }
}
