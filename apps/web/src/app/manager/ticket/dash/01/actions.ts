"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  decideManagerTicketResponsibility,
} from "@/lib/ticket-manager-api";
import { assignManagerVendor } from "@/lib/vendor-mgmt-api";
import { requireUser } from "@/lib/session";
import type { ManagerMutationState } from "../../../_components/manager-mutation-state";
import {
  managerMutationError,
  managerMutationSuccess,
} from "../../../_components/manager-mutation-state";
import { ticketDashHref } from "../../_components/ticket-manager-ui";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function requireManager(ticketId: string) {
  await requireUser("LANDLORD", ticketDashHref("01", ticketId));
  if (!ticketId) throw new Error("티켓을 확인해 주세요.");
}

function revalidateTicket(ticketId: string) {
  revalidatePath(ticketDashHref("01", ticketId));
  revalidatePath(ticketDashHref("00"));
}

export async function decideResponsibilityAction(
  _previousState: ManagerMutationState,
  formData: FormData,
): Promise<ManagerMutationState> {
  const ticketId = formString(formData, "ticketId");
  const responsibility = formString(formData, "responsibility");
  const note = formString(formData, "note");

  try {
    await requireManager(ticketId);
    if (responsibility !== "TENANT" && responsibility !== "LANDLORD") {
      throw new Error("책임 주체를 선택해 주세요.");
    }
    if (!note) throw new Error("세입자에게 보이는 확정 사유를 입력해 주세요.");

    await decideManagerTicketResponsibility(ticketId, { responsibility, note });
    revalidateTicket(ticketId);
    return managerMutationSuccess("책임 판단을 확정하고 세입자에게 알렸습니다.");
  } catch (error) {
    return managerMutationError(error);
  }
}

export async function assignVendorAction(
  _previousState: ManagerMutationState,
  formData: FormData,
): Promise<ManagerMutationState> {
  const ticketId = formString(formData, "ticketId");
  const vendorId = formString(formData, "vendorId");
  const requestNote = formString(formData, "requestNote");

  try {
    await requireManager(ticketId);
    if (!vendorId) throw new Error("배정할 업체를 선택해 주세요.");
    if (!requestNote) throw new Error("업체에 전달할 요청 내용을 확인해 주세요.");
    await assignManagerVendor(ticketId, { vendorId, requestNote });
    revalidateTicket(ticketId);
    revalidatePath("/gara");
  } catch (error) {
    return managerMutationError(error);
  }
  redirect(ticketDashHref("01", ticketId));
}
