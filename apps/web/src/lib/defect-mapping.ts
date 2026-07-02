// 팀 백엔드(Prisma/store) 응답 → @roomlog/types(프로토타입 화면이 소비하는 shape) 매퍼.
// 근거: 팀은 UPPERCASE enum·complaint/ticket 분리·priority(Int)·responsibilityHint(한글 문자열),
// 프로토타입 화면은 lowercase enum·unitId·urgency·verdict를 기대. 여기서 단일 방향 정합.
import type {
  Ticket,
  TicketStatus,
  DefectAnalysis,
  RepairJob,
  RepairStage,
  ResponsibilityVerdict,
  Urgency
} from "@roomlog/types";

// 팀 응답 중 필요한 부분만 느슨히 타입화 (web는 api 내부 타입을 import하지 않는다).
export interface TeamAnalysis {
  category: string;
  detailCategory?: string;
  priority: number;
  responsibilityHint: string;
  confidenceScore: number;
  reasons?: string[];
  recommendedAction?: string;
  photoAnalysis?: { previousAttachmentUrls?: string[] };
}
export interface TeamRepair {
  id: string;
  ticketId: string;
  status: string;
  title?: string;
  estimateAmount?: number;
  estimateDescription?: string;
  scheduledAt?: string;
}
export interface TeamTicket {
  id: string;
  complaintId: string;
  status: string;
  priority: number;
  responsibilityHint: string;
  analysis?: TeamAnalysis;
  repairs?: TeamRepair[];
  assignedVendor?: { businessName?: string };
}
export interface TeamComplaint {
  id: string;
  title: string;
  description: string;
  location?: string;
  occurredAt?: string;
  createdAt: string;
  updatedAt: string;
  room?: { roomNo?: string };
  ticket: TeamTicket;
}

// 팀 TicketStatus(11) → 프로토타입 TicketStatus(6, 접수·검토 트랙만). 수리 트랙은 RepairJob로 분리.
const TICKET_STATUS: Record<string, TicketStatus> = {
  RECEIVED: "received",
  REVIEWING: "reviewing",
  ADDITIONAL_INFO_REQUESTED: "info_requested",
  VENDOR_ASSIGNMENT_PENDING: "processing",
  VENDOR_ASSIGNED: "processing",
  ESTIMATE_REVIEW: "processing",
  REPAIR_IN_PROGRESS: "processing",
  COMPLETION_REPORTED: "processing",
  COMPLETED: "resolved",
  REOPENED: "reopened",
  CANCELLED: "resolved"
};

// 팀 RepairStatus(9) → 프로토타입 RepairStage(6).
// COMPLETION_REPORTED은 "완료 보고"일 뿐 관리인 완료 승인 전이므로 completed로 올리지 않는다(in_progress).
// CANCELLED는 활성 수리가 아니므로 stage로 매핑하지 않고 toRepair에서 null 처리.
const REPAIR_STAGE: Record<string, RepairStage> = {
  REQUESTED: "vendor_assigned",
  ACCEPTED: "vendor_assigned",
  ESTIMATE_SUBMITTED: "quoted",
  ESTIMATE_APPROVED: "quoted",
  SCHEDULED: "scheduled",
  IN_PROGRESS: "in_progress",
  COMPLETION_REPORTED: "in_progress",
  COMPLETED: "completed"
};

// 한글 책임 힌트 → verdict. AI 책임 확정 금지(가능성/판단어려움만) 원칙 유지.
const RESPONSIBILITY: Record<string, ResponsibilityVerdict> = {
  "임대인 책임 가능성": "landlord_likely",
  "임차인 책임 가능성": "tenant_likely",
  "판단 어려움": "unclear"
};

function clampUrgency(n: number): Urgency {
  // 0은 1로 clamp돼야 하고(‖n||3‖는 0을 3으로 만드는 버그), 비숫자/NaN은 기본 3.
  const rounded = Number.isFinite(n) ? Math.round(n) : 3;
  return Math.min(4, Math.max(1, rounded)) as Urgency;
}

export function mapTicketStatus(status: string): TicketStatus {
  const mapped = TICKET_STATUS[status];
  if (!mapped) console.warn(`[defect-mapping] 미매핑 TicketStatus: ${status} → received`);
  return mapped ?? "received";
}
export function mapResponsibility(hint: string): ResponsibilityVerdict {
  const mapped = RESPONSIBILITY[hint];
  if (!mapped) console.warn(`[defect-mapping] 미매핑 responsibilityHint: ${hint} → unclear`);
  return mapped ?? "unclear";
}

export function toTicket(c: TeamComplaint): Ticket {
  const repair = c.ticket.repairs?.[0];
  return {
    id: c.id,
    type: "defect",
    unitId: c.room?.roomNo ?? "",
    title: c.title,
    description: c.description,
    location: c.location,
    occurredAt: c.occurredAt,
    status: mapTicketStatus(c.ticket.status),
    urgency: clampUrgency(c.ticket.priority),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    analysisId: c.ticket.analysis ? `${c.ticket.id}-analysis` : undefined,
    repairJobId: repair?.id
  };
}

export function toAnalysis(c: TeamComplaint): DefectAnalysis | null {
  const a = c.ticket.analysis;
  if (!a) return null;
  return {
    // ticket-scoped 식별자는 complaint id(c.id)가 아니라 실제 ticket id를 쓴다.
    id: `${c.ticket.id}-analysis`,
    ticketId: c.ticket.id,
    problemCandidates: [a.detailCategory ?? a.category].filter(Boolean) as string[],
    urgency: clampUrgency(a.priority),
    responsibility: mapResponsibility(a.responsibilityHint),
    reasoning: a.reasons?.length ? [...a.reasons] : a.recommendedAction ? [a.recommendedAction] : [],
    confidence: a.confidenceScore ?? 0,
    safetyRisk: a.priority === 1, // 팀 응답에 명시 필드 없음 → 1순위를 안전위험으로 근사
    moveinComparisonAvailable: Boolean(a.photoAnalysis?.previousAttachmentUrls?.length),
    createdAt: c.createdAt
  };
}

export function toRepair(c: TeamComplaint): RepairJob | null {
  const r = c.ticket.repairs?.[0];
  if (!r) return null;
  if (r.status === "CANCELLED") return null; // 취소된 수리는 활성 수리로 표시하지 않는다
  return {
    id: r.id,
    ticketId: c.ticket.id,
    stage: REPAIR_STAGE[r.status] ?? "vendor_assigned",
    vendorName: c.ticket.assignedVendor?.businessName,
    quoteAmount: r.estimateAmount,
    quoteItems:
      r.estimateAmount != null
        ? [{ label: r.estimateDescription ?? r.title ?? "견적", amount: r.estimateAmount }]
        : undefined,
    scheduledAt: r.scheduledAt
  };
}
