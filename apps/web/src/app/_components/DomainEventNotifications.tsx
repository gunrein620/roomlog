"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getRealtimeSocket } from "@/lib/realtime-client";
import styles from "./DomainEventNotifications.module.css";

type PublicDomainEvent = {
  type?: unknown;
  title?: unknown;
  message?: unknown;
  occurredAt?: unknown;
};

type Notification = {
  key: string;
  title: string;
  message: string;
};

export function DomainEventNotifications({
  placement,
}: {
  placement: "manager" | "phone";
}) {
  const router = useRouter();
  const [notification, setNotification] = useState<Notification | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const socket = getRealtimeSocket();
    const onDomainEvent = (event: PublicDomainEvent) => {
      if (typeof event?.title !== "string" || typeof event.message !== "string") return;
      const title = event.title.trim();
      const message = event.message.trim();
      if (!title || !message) return;

      if (clearTimer.current) clearTimeout(clearTimer.current);
      setNotification({
        key: `${String(event.type ?? "event")}:${String(event.occurredAt ?? Date.now())}`,
        title,
        message,
      });
      router.refresh();
      clearTimer.current = setTimeout(() => setNotification(null), 8_000);
    };

    socket.on("roomlog-domain-event", onDomainEvent);
    return () => {
      socket.off("roomlog-domain-event", onDomainEvent);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      clearTimer.current = null;
    };
  }, [router]);

  if (!notification) return null;

  return (
    <aside
      className={`${styles.notification} ${placement === "phone" ? styles.phone : styles.manager}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-event-key={notification.key}
    >
      <div>
        <strong>{notification.title}</strong>
        <p>{notification.message}</p>
      </div>
      <button type="button" onClick={() => setNotification(null)} aria-label="알림 닫기">
        닫기
      </button>
    </aside>
  );
}
