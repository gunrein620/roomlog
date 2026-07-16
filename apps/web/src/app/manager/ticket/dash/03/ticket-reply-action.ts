import type {
  ManagerReplyAction,
  ManagerReplyIntent,
} from "@roomlog/types";

export function replyActionForIntent(
  intent: ManagerReplyIntent,
): ManagerReplyAction {
  return intent === "REQUEST_PHOTO" || intent === "REQUEST_DETAILS"
    ? "REQUEST_ADDITIONAL_INFO"
    : "SEND_REPLY";
}

export function validateReplyMessage(messageText: string): string | null {
  return messageText.trim() ? null : "전송할 답변 내용을 입력해주세요.";
}
