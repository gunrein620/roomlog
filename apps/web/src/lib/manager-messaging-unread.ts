"use client";

import type { Thread } from "@roomlog/types";
import { useEffect, useState } from "react";

const MANAGER_UNREAD_REFRESH_MS = 10_000;
export const MANAGER_MESSAGING_READ_EVENT = "manager-messaging-read";

export function totalManagerUnreadGeneralMessages(threads: readonly Thread[]): number {
  return threads.reduce(
    (total, thread) =>
      thread.context === "general" ? total + thread.managerUnreadCount : total,
    0,
  );
}

export function useManagerMessagingUnreadCount(pathname: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    function loadUnreadCount() {
      fetch("/api/manager/messaging/threads?context=general", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error("관리인 미확인 메시지를 조회하지 못했습니다.");
          return response.json() as Promise<Thread[]>;
        })
        .then((threads) => setCount(totalManagerUnreadGeneralMessages(threads)))
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setCount(0);
          }
        });
    }

    loadUnreadCount();
    const interval = window.setInterval(loadUnreadCount, MANAGER_UNREAD_REFRESH_MS);
    window.addEventListener(MANAGER_MESSAGING_READ_EVENT, loadUnreadCount);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(MANAGER_MESSAGING_READ_EVENT, loadUnreadCount);
      controller.abort();
    };
  }, [pathname]);

  return count;
}
