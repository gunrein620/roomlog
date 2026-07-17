// 티켓 도메인 공유 모델 (임차인 하자 · 관리인 티켓 · 수리업체가 공유하는 단일 도메인)
// 근거: 결정로그 — 단일 Ticket(type 구분) + DefectAnalysis(하자 AI) + RepairJob(수리 상태 분리)
// 원칙: 티켓 상태 ≠ 수리 상태 (데이터·표시 분리). AI는 책임 확정 금지(가능성만).

/** 티켓 종류 — 하자 경로부터 구현, type 필드로 민원 등 확장 대비 */
export type TicketType = "defect" | "complaint";

/** 티켓(민원/접수) 상태 — 수리 상태와 분리 */
export type TicketStatus =
  | "received" // 접수
  | "reviewing" // 검토
  | "info_requested" // 추가정보 요청
  | "processing" // 처리 중
  | "resolved" // 완료
  | "reopened" // 재요청
  | "cancelled"; // 취소됨

/** 수리(업체 실행) 상태 — 티켓 상태와 별개로 진행 */
export type RepairStage =
  | "vendor_assigned" // 업체 배정
  | "quoted" // 견적
  | "scheduled" // 일정 확정
  | "in_progress" // 수리 중
  | "completed" // 완료
  | "paid"; // 결제

/** AI 책임 가능성 — 확정 아님(가능성/판단어려움만). false agency 금지 */
export type ResponsibilityVerdict =
  | "tenant_likely" // 임차인 책임 가능성
  | "landlord_likely" // 임대인 책임 가능성
  | "unclear"; // 판단 어려움

/** 관리자가 확정한 책임 주체. AI 가능성 값과 별도 축이다. */
export type ResponsibilityDecisionValue = "TENANT" | "LANDLORD";

export interface TicketResponsibilityDecision {
  responsibility: ResponsibilityDecisionValue;
  decidedById: string;
  decidedAt: string;
  note: string;
}

/** RepairRequest를 만들지 않는 관리자 직접 처리 진행 메타. */
export interface TicketDirectHandling {
  startedAt: string;
  completedAt?: string;
  note?: string;
}

/** 관리자 목록에 노출하는 세입자 주도 수리의 활성 진행 요약. */
export interface TicketSelfRepairSummary {
  active: true;
  statusLabel: string;
}

export type TicketAiFeedbackTarget =
  | "SUMMARY"
  | "CATEGORY"
  | "PRIORITY"
  | "RESPONSIBILITY"
  | "COMPLETION";

export interface TicketAiFeedback {
  id: string;
  ticketId: string;
  complaintId: string;
  target: TicketAiFeedbackTarget;
  targetLabel: string;
  originalValue: string;
  reason: string;
  requestedAction?: string;
  status: "OPEN" | "REVIEWED";
  managerReviewNote?: string;
  correctedValue?: string;
  reviewedAt?: string;
  createdAt: string;
}

/** 긴급도 1~4순위 (1=즉시) */
export type Urgency = 1 | 2 | 3 | 4;

/**
 * 수리업체 견적 회신 유형 (V-JOB-02) — 3택.
 * numeric=숫자 견적(확정가) · visit=방문 견적(현장 확인 후 산정) · decline=견적 불가.
 * 방문 견적 건은 선정 후 V-JOB-05 현장 확정가 게이트에서 확정.
 */
export type VendorQuoteType = "numeric" | "visit" | "decline";

/**
 * 현장 확정가 착수 전 승인 상태 (V-JOB-05 게이트 · v3 P1).
 * 방문 견적 건은 현장 확정가 제출 → pending(임차인/관리자 승인 대기) → approved 시에만 착수.
 * 숫자 견적 건은 이미 확정가이므로 이 게이트 스킵.
 */
export type OnsiteApprovalStatus = "pending" | "approved" | "rejected";

/**
 * 관리인 처리 결과(disposition) — 티켓 상태(TicketStatus)와 **별개 축**.
 * 보류/반려는 상태 머신이 아니라 관리인 큐 개념이므로 TicketStatus를 확장하지 않는다.
 * (TicketStatus 확장은 임차인 표면의 Record<TicketStatus>를 깨뜨림 → 분리 유지)
 */
export type TicketDisposition =
  | "open" // 처리 대기(기본)
  | "on_hold" // 보류 큐
  | "rejected"; // 반려/종결

/** 관리인 답변 초안의 목적 — 발송 전 관리인이 반드시 검토·편집한다. */
export type ManagerReplyIntent =
  | "RECEIPT_ACK"
  | "REQUEST_PHOTO"
  | "REQUEST_DETAILS"
  | "SCHEDULE_VISIT"
  | "ASSIGN_VENDOR_NOTICE"
  | "COMPLETION_NOTICE";

/** 답변 발송 시 적용할 티켓 워크플로 액션. */
export type ManagerReplyAction = "SEND_REPLY" | "REQUEST_ADDITIONAL_INFO";

export interface ManagerReplyDraftInput {
  intent?: ManagerReplyIntent;
  note?: string;
}

export interface ManagerTicketReplyInput {
  action?: ManagerReplyAction;
  messageText?: string;
}

export interface DecideTicketResponsibilityInput {
  responsibility: ResponsibilityDecisionValue;
  note: string;
}

export interface StartTicketDirectHandlingInput {
  note?: string;
}

export interface CompleteTicketDirectHandlingInput {
  note: string;
  cost?: {
    amount: number;
    item?: string;
  };
}

export interface CancelTicketDirectHandlingInput {
  reason: string;
}

export interface SubmitTicketAiFeedbackInput {
  target: TicketAiFeedbackTarget;
  reason: string;
  requestedAction?: string;
  attachmentUrls?: string[];
}

export interface CreateDefectComplaintInput {
  title: string;
  description: string;
  location: string;
  roomId?: string;
  clientRequestId?: string;
  attachmentUrls?: string[];
  occurredAt?: string;
  availableTimes?: string;
  urgency?: Urgency;
}

export interface ManagerReplyDraftResult {
  ticketId: string;
  complaintId: string;
  intent: ManagerReplyIntent;
  subject: string;
  messageText: string;
  deliveryChannels: string[];
  requiresTenantAction: boolean;
  tenantActionLabel?: string;
  evidence: string[];
  warnings: string[];
  generatedAt: string;
}

export interface Ticket {
  id: string;
  type: TicketType;
  buildingName?: string; // 건물명
  /** 운영 원장의 세부 하자/민원 분류. 업체 업종 적합성 판단에 사용한다. */
  category?: string;
  unitId: string; // 호실
  title: string; // 예: "에어컨 물샘"
  description: string;
  location?: string;
  occurredAt?: string; // ISO
  status: TicketStatus;
  urgency: Urgency;
  createdAt: string;
  updatedAt: string;
  analysisId?: string;
  repairJobId?: string;
  /** 관리인 처리 결과 축(보류/반려). 미지정=open. 상태(status)와 독립. */
  disposition?: TicketDisposition;
  /** 반려/보류 사유 (관리인 기록). 자동 발송 금지 원칙에 따라 통보는 별도. */
  dispositionReason?: string;
  /** 관리자 확정 메타. AI 책임 가능성 분석과 혼동하지 않는다. */
  responsibilityDecision?: TicketResponsibilityDecision;
  /** 관리자 직접 처리 메타. null/미지정이면 직접 처리 갈래가 아니다. */
  directHandling?: TicketDirectHandling | null;
  /** 관리자 표면에서만 오는 활성 자가수리 요약. */
  selfRepair?: TicketSelfRepairSummary | null;
}

/**
 * 관리인 대시보드(M-DASH-00) 미처리 카운트 요약.
 * 청구·연체·리포트는 슬라이스 밖 — 큐 처리에 필요한 카운트만.
 */
export interface ManagerQueueSummary {
  today: number; // 오늘 처리할 민원
  urgent: number; // 긴급(1순위) 건수
  awaitingReview: number; // 확인대기(접수·검토)
  awaitingPayment: number; // 결제대기(수리완료·결제 전)
  onHold: number; // 보류 N
  total: number; // 전체 활성 티켓
}

/** 하자 AI 분석 결과 — 책임은 '가능성'만, 근거는 검증가능하게 */
export interface DefectAnalysis {
  id: string;
  ticketId: string;
  problemCandidates: string[]; // 문제 후보 (예: ["에어컨 물샘"])
  urgency: Urgency;
  responsibility: ResponsibilityVerdict;
  reasoning: string[]; // 근거 후보 (더보기)
  confidence: number; // 0~1 모델 신뢰도
  safetyRisk: boolean; // 위험 키워드 감지 → 긴급도 상향
  moveinComparisonAvailable: boolean; // 입주 기록 있으면 비교 표시 (공백 ≠ 책임 추정)
  createdAt: string;
}

export interface RepairJob {
  id: string;
  ticketId: string;
  stage: RepairStage;
  vendorName?: string;
  quoteAmount?: number; // 원
  quoteItems?: { label: string; amount: number }[];
  scheduledAt?: string;
  paidAt?: string;
  /** 견적 회신 유형 (V-JOB-02 3택). 미지정=아직 회신 전. */
  quoteType?: VendorQuoteType;
  /** 비고 · 방문견적 개략가 범위 · 견적 불가 사유 (자유입력). */
  quoteNote?: string;
  /** 현장 확정가 (방문견적 건, V-JOB-05). 원. */
  onsiteQuoteAmount?: number;
  /** 현장 확정가 착수 전 승인 상태 (V-JOB-05 게이트). 미지정=게이트 없음(숫자견적). */
  onsiteApproval?: OnsiteApprovalStatus;
  /** 완료 보고 수리 내역·사용 자재 (V-JOB-06). */
  completionNote?: string;
  /** 최종 정산 금액 (V-JOB-06). 현장 확정가 대비. 원. */
  finalAmount?: number;
}
