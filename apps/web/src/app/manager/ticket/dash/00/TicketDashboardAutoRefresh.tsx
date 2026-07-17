"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getRealtimeSocket } from "@/lib/realtime-client";
import { shouldRefreshTicketDashboard } from "./ticket-dashboard-activity";

type TicketDashboardAutoRefreshProps = {
  intervalMs?: number;
};

function hasFocusedControl(): boolean {
  const activeElement = document.activeElement;

  return (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement ||
    activeElement?.getAttribute("contenteditable") === "true"
  );
}

export function TicketDashboardAutoRefresh({
  intervalMs = 3000,
}: TicketDashboardAutoRefreshProps) {
  const router = useRouter();
  const isSocketLiveRef = useRef(false);

  useEffect(() => {
    if (intervalMs <= 0) return undefined;

    const refreshVisibleDashboard = () => {
      if (document.visibilityState !== "visible" || hasFocusedControl()) return;
      router.refresh();
    };
    const socket = getRealtimeSocket();
    const onConnect = () => {
      isSocketLiveRef.current = true;
    };
    const onDisconnect = () => {
      isSocketLiveRef.current = false;
    };
    const onActivity = (payload: unknown) => {
      if (shouldRefreshTicketDashboard(payload)) refreshVisibleDashboard();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshVisibleDashboard();
    };

    isSocketLiveRef.current = socket.connected;
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("roomlog:activity", onActivity);

    const fallbackId = window.setInterval(() => {
      if (!isSocketLiveRef.current) refreshVisibleDashboard();
    }, intervalMs);
    const safetyId = window.setInterval(refreshVisibleDashboard, 30000);
    window.addEventListener("focus", refreshVisibleDashboard);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("roomlog:activity", onActivity);
      window.clearInterval(fallbackId);
      window.clearInterval(safetyId);
      window.removeEventListener("focus", refreshVisibleDashboard);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [intervalMs, router]);

  return null;
}
