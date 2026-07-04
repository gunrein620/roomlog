"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

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

export function MessageAutoRefresh({ intervalMs = 3000 }: MessageAutoRefreshProps) {
  const router = useRouter();

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

    const intervalId = window.setInterval(refreshVisibleThread, intervalMs);
    window.addEventListener("focus", refreshVisibleThread);
    document.addEventListener("visibilitychange", refreshVisibleThread);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVisibleThread);
      document.removeEventListener("visibilitychange", refreshVisibleThread);
    };
  }, [intervalMs, router]);

  return null;
}
