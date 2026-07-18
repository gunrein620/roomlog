"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getRealtimeSocket } from "@/lib/realtime-client";
import { shouldRefreshTicketDashboard } from "./ticket-dashboard-activity";
import { createTicketDashboardRefreshGate } from "./ticket-dashboard-refresh-gate";
import { isLocalTicketLaneMutationActivity } from "./ticket-lane-mutation-activity";

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
  const refreshGateRef = useRef(createTicketDashboardRefreshGate());

  useEffect(() => {
    let mounted = true;
    const canRefreshDashboard = () =>
      document.visibilityState === "visible" && !hasFocusedControl();
    const refreshDashboard = () => {
      router.refresh();
    };
    const socket = getRealtimeSocket();
    const onActivity = (payload: unknown) => {
      if (isLocalTicketLaneMutationActivity(payload)) return;
      if (!shouldRefreshTicketDashboard(payload)) return;
      if (!refreshGateRef.current.request(canRefreshDashboard())) return;
      refreshDashboard();
    };
    const flushPendingRefresh = () => {
      if (!mounted) return;
      if (!refreshGateRef.current.flush(canRefreshDashboard())) return;
      refreshDashboard();
    };
    const flushAfterFocusSettles = () => {
      queueMicrotask(flushPendingRefresh);
    };

    socket.on("roomlog:activity", onActivity);
    document.addEventListener("focusout", flushAfterFocusSettles);
    document.addEventListener("visibilitychange", flushPendingRefresh);

    return () => {
      mounted = false;
      socket.off("roomlog:activity", onActivity);
      document.removeEventListener("focusout", flushAfterFocusSettles);
      document.removeEventListener("visibilitychange", flushPendingRefresh);
    };
  }, [router]);

  return null;
}
