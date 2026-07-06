"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getRealtimeSocket } from "@/lib/realtime-client";

type MessageAutoRefreshProps = {
  intervalMs?: number;
};

function hasFocusedDraftInput(): boolean {
  const activeElement = document.activeElement;

  return (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement ||
    activeElement?.getAttribute("contenteditable") === "true"
  );
}

/**
 * 룸로그 메시징 화면 자동 갱신.
 * 1차 채널은 웹소켓 "roomlog:activity" 신호(도착 즉시 refresh)이고,
 * 소켓이 끊겨 있으면 기존 폴링 주기로 폴백한다(연결 중에는 30초 안전망만).
 * 입력 중이거나 탭이 백그라운드면 어느 채널이든 갱신을 미룬다.
 */
export function MessageAutoRefresh({ intervalMs = 3000 }: MessageAutoRefreshProps) {
  const router = useRouter();
  const isSocketLiveRef = useRef(false);

  useEffect(() => {
    if (intervalMs <= 0) {
      return undefined;
    }

    const refreshVisibleThread = () => {
      if (document.visibilityState !== "visible" || hasFocusedDraftInput()) {
        return;
      }

      router.refresh();
    };

    const socket = getRealtimeSocket();
    const onConnect = () => {
      isSocketLiveRef.current = true;
    };
    const onDisconnect = () => {
      isSocketLiveRef.current = false;
    };
    isSocketLiveRef.current = socket.connected;
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("roomlog:activity", refreshVisibleThread);

    // 폴링 폴백 — 소켓이 살아 있으면 건너뛰고, 30초 안전망만 별도로 돈다.
    const tick = () => {
      if (isSocketLiveRef.current) return;
      refreshVisibleThread();
    };
    const intervalId = window.setInterval(tick, intervalMs);
    const safetyId = window.setInterval(refreshVisibleThread, Math.max(intervalMs * 10, 30000));
    window.addEventListener("focus", refreshVisibleThread);
    document.addEventListener("visibilitychange", refreshVisibleThread);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("roomlog:activity", refreshVisibleThread);
      window.clearInterval(intervalId);
      window.clearInterval(safetyId);
      window.removeEventListener("focus", refreshVisibleThread);
      document.removeEventListener("visibilitychange", refreshVisibleThread);
    };
  }, [intervalMs, router]);

  return null;
}
