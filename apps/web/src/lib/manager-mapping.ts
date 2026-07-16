// 팀 GET /manager/tickets → @roomlog/types 매퍼 (관리인 표면).
// 팀 응답은 presentTicket(ticket-centric: {...ticket, complaint, room, analysis, repairs, assignedVendor}).
// 하자(complaint-centric) 매퍼(defect-mapping)를 그대로 재사용하려고 TeamComplaint로 어댑트한다
// → status/stage/responsibility/urgency 매핑·교정(적대검토 반영)을 단일 소스로 공유.
import type { Ticket, TicketType, DefectAnalysis, RepairJob, ManagerQueueSummary } from "@roomlog/types";
import {
  toTicket,
  toAnalysis,
  toRepair,
  type TeamComplaint,
  type TeamAnalysis,
  type TeamRepair
} from "./defect-mapping";

export interface TeamManagerTicket {
  id: string;
  complaintId: string;
  status: string;
  priority: number;
  responsibilityHint: string;
  /** 팀 Ticket.category(하자/소음/납부…) — presentTicket이 ticket 필드를 spread하므로 함께 온다 */
  category?: string;
  /** API 응답 경계에서 확정된 티켓 종류 */
  kind?: TicketType;
  complaint: {
    title: string;
    description: string;
    location?: string;
    occurredAt?: string;
    createdAt: string;
    updatedAt: string;
  };
  room?: { buildingName?: string; roomNo?: string };
  analysis?: TeamAnalysis;
  repairs?: TeamRepair[];
  assignedVendor?: { businessName?: string };
  messages?: Array<{ attachmentUrls?: string[] }>;
}

function asComplaint(t: TeamManagerTicket): TeamComplaint {
  return {
    // 관리인 표면의 Ticket.id는 실제 ticket id여야 한다(PATCH/상세 타깃). toTicket이
    // TeamComplaint.id를 Ticket.id로 쓰므로 여기에 ticket id를 넣는다(임차인 표면과 반대).
    id: t.id,
    title: t.complaint.title,
    description: t.complaint.description,
    location: t.complaint.location,
    occurredAt: t.complaint.occurredAt,
    createdAt: t.complaint.createdAt,
    updatedAt: t.complaint.updatedAt,
    room: t.room,
    ticket: {
      id: t.id,
      complaintId: t.complaintId,
      status: t.status,
      priority: t.priority,
      responsibilityHint: t.responsibilityHint,
      category: t.category,
      kind: t.kind,
      analysis: t.analysis,
      repairs: t.repairs,
      assignedVendor: t.assignedVendor
    }
  };
}

export function toManagerTicket(t: TeamManagerTicket): Ticket {
  return toTicket(asComplaint(t));
}
export function toManagerAnalysis(t: TeamManagerTicket): DefectAnalysis | null {
  return toAnalysis(asComplaint(t));
}
export function toManagerRepair(t: TeamManagerTicket): RepairJob | null {
  return toRepair(asComplaint(t));
}

// ManagerQueueSummary는 팀 전용 엔드포인트가 없어 목록에서 계산(데모 위조 대신 실집계).
export function computeQueueSummary(
  tickets: Ticket[],
  repairs: (RepairJob | null)[]
): ManagerQueueSummary {
  // today 기준은 Asia/Seoul(KST) 날짜 — createdAt(ISO/UTC)도 KST로 환산해 비교.
  const kstDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }) : "";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  return {
    total: tickets.length,
    urgent: tickets.filter((t) => t.urgency === 1).length,
    // 재요청(reopened)도 확인대기에 포함(데모 요약과 동일 기준).
    awaitingReview: tickets.filter(
      (t) => t.status === "received" || t.status === "reviewing" || t.status === "reopened"
    ).length,
    today: tickets.filter((t) => kstDate(t.createdAt) === today).length,
    // 결제완료(paid) 상태가 백엔드에 없어 완료 수리를 결제대기로 근사(follow-up: 결제 도메인).
    awaitingPayment: repairs.filter((r) => r?.stage === "completed").length,
    // disposition(보류)은 현재 팀 Ticket에 없어 항상 0(follow-up: disposition 축 정합).
    onHold: 0
  };
}
