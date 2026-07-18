"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getRealtimeSocket } from "@/lib/realtime-client";
import { shouldRefreshTicketDashboard } from "./ticket-dashboard-activity";

function hasFocusedControl(): boolean {
  const activeElement = document.activeElement;

  return (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement ||
    activeElement?.getAttribute("contenteditable") === "true"
  );
}

export function TicketDashboardAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refreshVisibleDashboard = () => {
      if (document.visibilityState !== "visible" || hasFocusedControl()) return;
      router.refresh();
    };
    const socket = getRealtimeSocket();
    const onActivity = (payload: unknown) => {
      if (shouldRefreshTicketDashboard(payload)) refreshVisibleDashboard();
    };

    socket.on("roomlog:activity", onActivity);

    return () => {
      socket.off("roomlog:activity", onActivity);
    };
  }, [router]);

  return null;
}
