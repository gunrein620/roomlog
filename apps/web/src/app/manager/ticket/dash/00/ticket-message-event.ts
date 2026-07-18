import type { TicketThreadMessage } from "@roomlog/types";

/**
 * 소켓 `roomlog:ticket-message` 페이로드에서 이 티켓의 메시지만 꺼낸다.
 * 페이로드는 서버가 방금 저장한 메시지 본문을 그대로 실어 오므로, 받는 쪽은 재조회 없이 붙이면 된다.
 * 형태가 어긋나거나 다른 티켓 것이면 null — 화면에 쓰레기를 붙이지 않는다.
 */
export function ticketMessageFor(
  ticketId: string,
  payload: unknown,
): TicketThreadMessage | null {
  if (!payload || typeof payload !== "object") return null;

  const { ticketId: payloadTicketId, message } = payload as {
    ticketId?: unknown;
    message?: unknown;
  };

  if (payloadTicketId !== ticketId) return null;
  if (!message || typeof message !== "object") return null;

  const candidate = message as Partial<TicketThreadMessage>;
  if (typeof candidate.id !== "string" || typeof candidate.messageText !== "string") {
    return null;
  }

  return {
    ...(candidate as TicketThreadMessage),
    attachmentUrls: Array.isArray(candidate.attachmentUrls) ? candidate.attachmentUrls : [],
  };
}

/** 같은 메시지를 두 번 붙이지 않는다 — 소켓 브로드캐스트는 보낸 본인에게도 돌아온다. */
export function appendTicketMessage(
  messages: readonly TicketThreadMessage[],
  message: TicketThreadMessage,
): TicketThreadMessage[] {
  if (messages.some((existing) => existing.id === message.id)) return messages as TicketThreadMessage[];
  return [...messages, message];
}
