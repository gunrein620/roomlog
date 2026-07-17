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
  TicketAiFeedback,
  TicketDirectHandling,
  TicketResponsibilityDecision,
  TicketType,
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
  responsibilityDecision?: TicketResponsibilityDecision;
  directHandling?: TicketDirectHandling | null;
  aiFeedback?: TeamAiFeedback[];
  /** 팀 Ticket.category(하자/소음/납부…) — 하자 민원 vs 일반 민원 구분 근거 */
  category?: string;
  /** API가 확정한 티켓 종류. 구버전 응답은 category fallback을 사용한다. */
  kind?: TicketType;
  analysis?: TeamAnalysis;
  repairs?: TeamRepair[];
  assignedVendor?: { businessName?: string };
}
export interface TeamAiFeedback extends TicketAiFeedback {
  tenantId?: string;
  attachmentUrls?: string[];
  updatedAt?: string;
}
export interface TeamComplaint {
  id: string;
  title: string;
  description: string;
  location?: string;
  occurredAt?: string;
  createdAt: string;
  updatedAt: string;
  room?: { id?: string; buildingName?: string; roomNo?: string };
  ticket: TeamTicket;
  aiFeedback?: TeamAiFeedback[];
}

// 팀 TicketStatus(11) → 프로토타입 TicketStatus(7, 접수·검토 트랙만). 수리 트랙은 RepairJob로 분리.
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
  CANCELLED: "cancelled"
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

// 시설 수리가 아닌 카테고리(소음/납부/계약/공용공간/기타 등)는 일반 민원으로 분류한다.
// 하드코딩 "defect" 고정이던 것을 팀 category 기반으로 교정 — 미지정/수리성 카테고리는 기존대로 defect.
const COMPLAINT_CATEGORIES = new Set(["소음", "납부", "계약", "공용공간", "기타", "주차", "민원"]);

export function ticketTypeFromCategory(category?: string): Ticket["type"] {
  return category && COMPLAINT_CATEGORIES.has(category) ? "complaint" : "defect";
}

// 배열 순서와 무관하게 현재 진행 중인 수리를 완료 이력보다 우선한다.
// 활성 수리가 없을 때만 COMPLETED를 이력 경로로 남기고 CANCELLED는 제외한다.
export function selectRepairPath(repairs?: TeamRepair[]): TeamRepair | undefined {
  return repairs?.find(
    (repair) => repair.status !== "COMPLETED" && repair.status !== "CANCELLED",
  ) ?? repairs?.find((repair) => repair.status === "COMPLETED");
}

export function toTicket(c: TeamComplaint): Ticket {
  const repair = selectRepairPath(c.ticket.repairs);
  return {
    id: c.id,
    type: c.ticket.kind ?? ticketTypeFromCategory(c.ticket.category ?? c.ticket.analysis?.category),
    buildingName: c.room?.buildingName?.trim() || undefined,
    category: c.ticket.category ?? c.ticket.analysis?.detailCategory ?? c.ticket.analysis?.category,
    // 화면들이 `{unitId}호`로 렌더하므로 unitId는 호 없는 숫자여야 한다(roomNo "301호" → "301").
    unitId: (c.room?.roomNo ?? "").replace(/\s*호\s*$/, ""),
    title: c.title,
    description: c.description,
    location: c.location,
    occurredAt: c.occurredAt,
    status: mapTicketStatus(c.ticket.status),
    urgency: clampUrgency(c.ticket.priority),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    analysisId: c.ticket.analysis ? `${c.ticket.id}-analysis` : undefined,
    repairJobId: repair?.id,
    responsibilityDecision: c.ticket.responsibilityDecision,
    directHandling: c.ticket.directHandling ?? null,
  };
}

export function toTicketAiFeedback(feedback: TeamAiFeedback): TicketAiFeedback {
  return {
    id: feedback.id,
    ticketId: feedback.ticketId,
    complaintId: feedback.complaintId,
    target: feedback.target,
    targetLabel: feedback.targetLabel,
    originalValue: feedback.originalValue,
    reason: feedback.reason,
    requestedAction: feedback.requestedAction,
    status: feedback.status,
    managerReviewNote: feedback.managerReviewNote,
    correctedValue: feedback.correctedValue,
    reviewedAt: feedback.reviewedAt,
    createdAt: feedback.createdAt
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

// 특정 TeamRepair 하나를 RepairJob으로 매핑(호출자가 '어떤 repair'인지 명시).
// repairs[0] 고정 선택의 오류(복수 수리 시 엉뚱한 건)를 피하려면 이 함수를 직접 쓴다.
export function mapRepair(
  r: TeamRepair | undefined,
  ticketId: string,
  vendorName?: string
): RepairJob | null {
  if (!r) return null;
  if (r.status === "CANCELLED") return null; // 취소된 수리는 활성 수리로 표시하지 않는다
  return {
    id: r.id,
    ticketId,
    stage: REPAIR_STAGE[r.status] ?? "vendor_assigned",
    vendorName,
    quoteAmount: r.estimateAmount,
    quoteItems:
      r.estimateAmount != null
        ? [{ label: r.estimateDescription ?? r.title ?? "견적", amount: r.estimateAmount }]
        : undefined,
    scheduledAt: r.scheduledAt
  };
}

export function toRepair(c: TeamComplaint): RepairJob | null {
  return mapRepair(
    selectRepairPath(c.ticket.repairs),
    c.ticket.id,
    c.ticket.assignedVendor?.businessName,
  );
}
