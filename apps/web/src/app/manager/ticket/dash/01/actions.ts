"use server";

import { revalidatePath } from "next/cache";
import {
  cancelManagerTicketDirectHandling,
  completeManagerTicketDirectHandling,
  decideManagerTicketResponsibility,
  sendManagerTicketReply,
  startManagerTicketDirectHandling,
} from "@/lib/ticket-manager-api";
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

export async function startDirectHandlingAction(
  _previousState: ManagerMutationState,
  formData: FormData,
): Promise<ManagerMutationState> {
  const ticketId = formString(formData, "ticketId");
  const note = formString(formData, "note");

  try {
    await requireManager(ticketId);
    await startManagerTicketDirectHandling(ticketId, note ? { note } : {});
    revalidateTicket(ticketId);
    return managerMutationSuccess("관리자 직접 처리를 시작했습니다.");
  } catch (error) {
    return managerMutationError(error);
  }
}

export async function completeDirectHandlingAction(
  _previousState: ManagerMutationState,
  formData: FormData,
): Promise<ManagerMutationState> {
  const ticketId = formString(formData, "ticketId");
  const note = formString(formData, "note");
  const amountText = formString(formData, "amount");
  const item = formString(formData, "item");

  try {
    await requireManager(ticketId);
    if (!note) throw new Error("완료 처리 내용은 필수입니다.");

    let cost: { amount: number; item?: string } | undefined;
    if (amountText || item) {
      if (!amountText) throw new Error("비용 항목을 기록하려면 금액도 입력해 주세요.");
      const amount = Number(amountText);
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2_147_483_647) {
        throw new Error("비용 금액은 1원 이상의 정수로 입력해 주세요.");
      }
      cost = { amount, ...(item ? { item } : {}) };
    }

    await completeManagerTicketDirectHandling(ticketId, {
      note,
      ...(cost ? { cost } : {}),
    });
    revalidateTicket(ticketId);
    return managerMutationSuccess("처리 완료를 보고했습니다. 세입자 확인을 기다립니다.");
  } catch (error) {
    return managerMutationError(error);
  }
}

export async function cancelDirectHandlingAction(
  _previousState: ManagerMutationState,
  formData: FormData,
): Promise<ManagerMutationState> {
  const ticketId = formString(formData, "ticketId");
  const reason = formString(formData, "reason");

  try {
    await requireManager(ticketId);
    if (!reason) throw new Error("직접 처리 취소 사유를 입력해 주세요.");
    await cancelManagerTicketDirectHandling(ticketId, { reason });
    revalidateTicket(ticketId);
    return managerMutationSuccess("직접 처리를 취소하고 검토 단계로 돌렸습니다.");
  } catch (error) {
    return managerMutationError(error);
  }
}

export async function sendTicketChatAction(
  _previousState: ManagerMutationState,
  formData: FormData,
): Promise<ManagerMutationState> {
  const ticketId = formString(formData, "ticketId");
  const messageText = formString(formData, "messageText");

  try {
    await requireManager(ticketId);
    if (!messageText) throw new Error("전송할 메시지를 입력해 주세요.");
    await sendManagerTicketReply(ticketId, {
      action: "SEND_REPLY",
      messageText,
    });
    revalidateTicket(ticketId);
    return managerMutationSuccess("진행 메시지를 전송했습니다.");
  } catch (error) {
    return managerMutationError(error);
  }
}
