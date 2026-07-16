"use server";

import { redirect } from "next/navigation";
import type {
  ManagerReplyDraftResult,
  ManagerReplyIntent,
} from "@roomlog/types";
import {
  draftManagerTicketReply,
  sendManagerTicketReply,
} from "@/lib/ticket-manager-api";
import { ApiError } from "@/lib/server-api";
import { requireUser } from "@/lib/session";
import {
  replyActionForIntent,
  validateReplyMessage,
} from "./ticket-reply-action";

export type ManagerTicketReplyState = {
  draft: ManagerReplyDraftResult;
  note: string;
  messageText: string;
  error?: string;
  formKey: string;
};

function formString(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function isReplyIntent(value: string): value is ManagerReplyIntent {
  return [
    "RECEIPT_ACK",
    "REQUEST_PHOTO",
    "REQUEST_DETAILS",
    "SCHEDULE_VISIT",
    "ASSIGN_VENDOR_NOTICE",
    "COMPLETION_NOTICE",
  ].includes(value);
}

function actionError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "답변을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

export async function submitManagerReplyAction(
  previousState: ManagerTicketReplyState,
  formData: FormData,
): Promise<ManagerTicketReplyState> {
  const ticketId = formString(formData, "ticketId");
  const intentValue = formString(formData, "intent");
  const intent = isReplyIntent(intentValue)
    ? intentValue
    : previousState.draft.intent;
  const note = formString(formData, "note");
  const messageText = formString(formData, "messageText");
  const operation = formString(formData, "operation");

  await requireUser("LANDLORD", `/manager/ticket/dash/03?id=${encodeURIComponent(ticketId)}`);

  if (operation === "regenerate") {
    try {
      const draft = await draftManagerTicketReply(ticketId, { intent, note });
      return {
        draft,
        note,
        messageText: draft.messageText,
        formKey: draft.generatedAt,
      };
    } catch (error) {
      return {
        ...previousState,
        note,
        messageText,
        error: actionError(error),
        formKey: `${previousState.formKey}-error`,
      };
    }
  }

  const validationError = validateReplyMessage(messageText);
  if (validationError) {
    return {
      ...previousState,
      note,
      messageText,
      error: validationError,
      formKey: `${previousState.formKey}-validation`,
    };
  }

  try {
    await sendManagerTicketReply(ticketId, {
      action: replyActionForIntent(intent),
      messageText,
    });
  } catch (error) {
    return {
      ...previousState,
      note,
      messageText,
      error: actionError(error),
      formKey: `${previousState.formKey}-error`,
    };
  }

  redirect(`/manager/ticket/dash/01?id=${encodeURIComponent(ticketId)}&replySent=1`);
}
