// 팀 GET /manager/tickets → @roomlog/types 매퍼 (관리인 표면).
// 팀 응답은 presentTicket(ticket-centric: {...ticket, complaint, room, analysis, repairs, assignedVendor}).
// 하자(complaint-centric) 매퍼(defect-mapping)를 그대로 재사용하려고 TeamComplaint로 어댑트한다
// → status/stage/responsibility/urgency 매핑·교정(적대검토 반영)을 단일 소스로 공유.
import type { Ticket, DefectAnalysis, RepairJob, ManagerQueueSummary } from "@roomlog/types";
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
  complaint: {
    title: string;
    description: string;
    location?: string;
    occurredAt?: string;
    createdAt: string;
    updatedAt: string;
  };
  room?: { roomNo?: string };
  analysis?: TeamAnalysis;
  repairs?: TeamRepair[];
  assignedVendor?: { businessName?: string };
}

function asComplaint(t: TeamManagerTicket): TeamComplaint {
  return {
    id: t.complaintId,
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
  const today = new Date().toISOString().slice(0, 10);
  return {
    total: tickets.length,
    urgent: tickets.filter((t) => t.urgency === 1).length,
    awaitingReview: tickets.filter((t) => t.status === "received" || t.status === "reviewing").length,
    today: tickets.filter((t) => t.createdAt?.slice(0, 10) === today).length,
    awaitingPayment: repairs.filter((r) => r?.stage === "completed").length,
    onHold: tickets.filter((t) => t.disposition === "on_hold").length
  };
}
