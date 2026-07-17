"use client";

import { useEffect, useState } from "react";
import { getRealtimeSocket } from "./realtime-client";

const MANAGER_TICKET_UNREAD_REFRESH_MS = 10_000;
export const MANAGER_TICKET_READ_EVENT = "manager-ticket-read";

type ManagerTicketUnreadState = {
  isManagerUnread?: boolean;
};

export function totalManagerUnreadTickets(
  tickets: readonly ManagerTicketUnreadState[],
): number {
  return tickets.filter((ticket) => ticket.isManagerUnread === true).length;
}

export async function markManagerTicketRead(ticketId: string): Promise<void> {
  const response = await fetch(`/api/manager/tickets/${encodeURIComponent(ticketId)}/read`, {
    method: "POST",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("민원·하자 열람 상태를 저장하지 못했습니다.");
  }

  window.dispatchEvent(new Event(MANAGER_TICKET_READ_EVENT));
}

export function useManagerTicketUnreadCount(pathname: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    function loadUnreadCount() {
      fetch("/api/manager/tickets", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error("미확인 민원·하자를 조회하지 못했습니다.");
          return response.json() as Promise<ManagerTicketUnreadState[]>;
        })
        .then((tickets) => setCount(totalManagerUnreadTickets(tickets)))
        .catch(() => {
          // 일시적인 조회 실패로 기존 배지를 0으로 오도하지 않는다.
        });
    }

    const socket = getRealtimeSocket();
    const onActivity = (payload: unknown) => {
      if (
        typeof payload === "object" &&
        payload !== null &&
        (payload as { kind?: unknown }).kind === "ticket"
      ) {
        loadUnreadCount();
      }
    };

    loadUnreadCount();
    socket.on("roomlog:activity", onActivity);
    const interval = window.setInterval(
      loadUnreadCount,
      MANAGER_TICKET_UNREAD_REFRESH_MS,
    );
    window.addEventListener(MANAGER_TICKET_READ_EVENT, loadUnreadCount);

    return () => {
      socket.off("roomlog:activity", onActivity);
      window.clearInterval(interval);
      window.removeEventListener(MANAGER_TICKET_READ_EVENT, loadUnreadCount);
      controller.abort();
    };
  }, [pathname]);

  return count;
}
