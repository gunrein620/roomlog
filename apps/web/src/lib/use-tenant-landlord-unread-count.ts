"use client";

import type { Thread } from "@roomlog/types";
import { useEffect, useState } from "react";
import {
  isTenantLandlordMessagingActivity,
  tenantLandlordConversationPaths,
} from "@/lib/tenant-landlord-conversation";
import { getRealtimeSocket } from "@/lib/realtime-client";
import { sumTenantLandlordUnreadCount } from "@/lib/tenant-landlord-nav-unread";

export function useTenantLandlordUnreadCount(
  enabled: boolean,
  viewerId?: string,
): number {
  const [unreadState, setUnreadState] = useState({ viewerId: "", count: 0 });

  useEffect(() => {
    if (!enabled || !viewerId) return;

    let cancelled = false;
    let requestVersion = 0;

    const refreshUnreadCount = async () => {
      const currentRequest = ++requestVersion;
      try {
        const response = await fetch(tenantLandlordConversationPaths.threads(), {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("임대인 문의 미확인 수 조회 실패");

        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) throw new Error("임대인 문의 응답 형식 오류");

        const nextCount = sumTenantLandlordUnreadCount(payload as Thread[]);
        if (!cancelled && currentRequest === requestVersion) {
          setUnreadState({ viewerId, count: nextCount });
        }
      } catch {
        // 상단 탐색은 유지하고 다음 메시징 이벤트·포커스 복귀 때 다시 시도한다.
      }
    };
    const refreshMessagingActivity = (payload: unknown) => {
      if (isTenantLandlordMessagingActivity(payload)) void refreshUnreadCount();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshUnreadCount();
    };
    const socket = getRealtimeSocket();

    void refreshUnreadCount();
    socket.on("roomlog:activity", refreshMessagingActivity);
    window.addEventListener("focus", refreshUnreadCount);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      socket.off("roomlog:activity", refreshMessagingActivity);
      window.removeEventListener("focus", refreshUnreadCount);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [enabled, viewerId]);

  return enabled && viewerId && unreadState.viewerId === viewerId
    ? unreadState.count
    : 0;
}
