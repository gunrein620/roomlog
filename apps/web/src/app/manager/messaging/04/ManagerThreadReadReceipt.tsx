"use client";

import { useEffect } from "react";
import { MANAGER_MESSAGING_READ_EVENT } from "@/lib/manager-messaging-unread";
import { markManagerTicketRead } from "@/lib/manager-ticket-unread";

export function ManagerThreadReadReceipt({
  threadId,
  ticketId,
}: {
  threadId: string;
  ticketId?: string;
}) {
  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/manager/messaging/threads/${encodeURIComponent(threadId)}/read`, {
      method: "POST",
      signal: controller.signal,
    })
      .then((response) => {
        if (response.ok && !controller.signal.aborted) {
          window.dispatchEvent(new Event(MANAGER_MESSAGING_READ_EVENT));
        }
      })
      .catch(() => {
        // 읽음 처리 실패가 대화 열람을 막지 않게 두고 다음 진입에서 재시도한다.
      });

    if (ticketId) {
      void markManagerTicketRead(ticketId).catch(() => {
        // 티켓 읽음 처리도 대화 읽음과 독립적으로 다음 진입에서 재시도한다.
      });
    }

    return () => controller.abort();
  }, [threadId, ticketId]);

  return null;
}
