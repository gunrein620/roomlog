import type { TicketStatus } from "@roomlog/types";

/**
 * 관리인 대화 패널의 진행 레인 — 접수 | 진행 | 완료.
 * 7개 티켓 상태를 관리인이 실제로 신경 쓰는 3단계로 접는다. 취소는 레인이 아니라
 * 별도 종결 상태이므로 토글에서 빠지고, 토글 자체가 잠긴다.
 */
export type TicketLane = "received" | "processing" | "resolved";

export const TICKET_LANES = [
  ["received", "접수"],
  ["processing", "진행"],
  ["resolved", "완료"],
] as const satisfies readonly (readonly [TicketLane, string])[];

const STATUS_LANE: Record<TicketStatus, TicketLane | null> = {
  received: "received",
  reviewing: "received",
  info_requested: "received",
  reopened: "received",
  processing: "processing",
  resolved: "resolved",
  cancelled: null,
};

/** 현재 티켓 상태가 속한 레인. 취소 건은 어떤 레인에도 속하지 않는다(null). */
export function ticketLaneOf(status: TicketStatus): TicketLane | null {
  return STATUS_LANE[status] ?? null;
}

/** 취소 건은 토글로 되살리지 않는다 — 재요청은 세입자 경로로만 열린다. */
export function canSwitchTicketLane(status: TicketStatus): boolean {
  return status !== "cancelled";
}
