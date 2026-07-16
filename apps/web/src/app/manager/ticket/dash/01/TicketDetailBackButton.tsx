"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

const TICKET_LIST_PATH = "/manager/ticket/dash/00";

export function TicketDetailBackButton() {
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(TICKET_LIST_PATH);
  }

  return (
    <button
      type="button"
      aria-label="이전 페이지로 돌아가기"
      onClick={goBack}
      style={{
        width: "calc(var(--touch-target) - var(--space-sm))",
        height: "calc(var(--touch-target) - var(--space-sm))",
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        border: "none",
        borderRadius: "var(--radius-btn)",
        background: "transparent",
        color: "var(--on-surface)",
        cursor: "pointer",
      }}
    >
      <ArrowLeft aria-hidden="true" />
    </button>
  );
}
