import type { RepairStage, TicketStatus } from "@roomlog/types";

export type TicketTimelineInput = {
  ticketStatus: TicketStatus;
  hasAnalysis: boolean;
  repairStage?: RepairStage;
};

export type TicketTimelineItem = {
  label:
    | "접수됨"
    | "AI 분석 완료"
    | "관리인 검토 대기"
    | "업체 진행 상태 동기화";
  reached: boolean;
};

const REVIEW_REACHED: readonly TicketStatus[] = [
  "reviewing",
  "info_requested",
  "processing",
  "resolved",
  "reopened",
  "cancelled",
];

export function buildTicketTimeline(
  input: TicketTimelineInput,
): TicketTimelineItem[] {
  const reviewReached = REVIEW_REACHED.includes(input.ticketStatus);
  const vendorSyncReached =
    (input.ticketStatus === "processing" || input.ticketStatus === "resolved") &&
    Boolean(input.repairStage);

  return [
    { label: "접수됨", reached: true },
    { label: "AI 분석 완료", reached: input.hasAnalysis },
    { label: "관리인 검토 대기", reached: reviewReached },
    { label: "업체 진행 상태 동기화", reached: vendorSyncReached },
  ];
}
