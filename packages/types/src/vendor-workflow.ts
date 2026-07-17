import type { VendorCatalogRecord } from "./vendor";
import type { RepairPaymentPayerRole } from "./repair-payment";

export type ManagerVendorStatus = "ACTIVE" | "ARCHIVED";
export type VendorAccountProjectionStatus = "ACTIVE" | "DISABLED" | "UNLINKED";

export interface VendorCatalogSearchFilters {
  query?: string;
  trade?: VendorCatalogRecord["trades"][number];
  serviceArea?: string;
  verificationStatus?: VendorCatalogRecord["verificationStatus"];
  isActive?: boolean;
}

export interface ManagerVendorView {
  id: string;
  managerId: string;
  vendorId: string;
  status: ManagerVendorStatus;
  managerNote?: string;
  registeredAt: string;
  catalog: VendorCatalogRecord;
  accountStatus: VendorAccountProjectionStatus;
  activeJobCount: number;
  waitingPaymentCount: number;
  completedJobCount: number;
}

export interface VendorCatalogSearchResult {
  catalog: VendorCatalogRecord;
  accountStatus: VendorAccountProjectionStatus;
  registrationStatus: ManagerVendorStatus | "UNREGISTERED";
  canAssign: boolean;
  assignmentBlockReasons: Array<
    "UNVERIFIED" | "INACTIVE" | "ACCOUNT_UNLINKED" | "NOT_REGISTERED"
  >;
}

export interface ManagerVendorDetail {
  vendor: ManagerVendorView;
  jobs: VendorJobSummary[];
  performance: {
    completedCount: number;
    medianEstimateResponseHours?: number;
    averageApprovedAmount?: number;
    updatedAt: string;
  };
}

/** 등록 관계가 없는 세입자 연결 업체의 관리자용 공개 축약 뷰. */
export interface ManagerVendorPublicView {
  vendorId: string;
  catalog: VendorCatalogRecord;
}

/** 관리자가 특정 하자 티켓에서 현재 진행 중인 업체 작업을 조회한 결과. */
export type ManagerVendorJobLookup =
  | {
      partnership: "REGISTERED";
      vendor: ManagerVendorView;
      job: VendorJobSummary;
    }
  | {
      partnership: "UNREGISTERED";
      vendor: ManagerVendorPublicView;
      job: VendorJobSummary;
    };

export interface ManagerVendorJobLookupResponse {
  data: ManagerVendorJobLookup | null;
}

export type VendorEstimateResponseType =
  | "FIXED_ESTIMATE"
  | "VISIT_REQUIRED"
  | "DECLINED";
export type VendorEstimateStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "VISIT_SCHEDULED"
  | "DECLINED"
  | "REVISION_REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN"
  | "SUPERSEDED";
export type VendorEstimateLineItemCategory =
  | "VISIT"
  | "LABOR"
  | "MATERIAL"
  | "LEGACY_TOTAL";
export type VendorEstimateDraftLineItemCategory = Exclude<
  VendorEstimateLineItemCategory,
  "LEGACY_TOTAL"
>;
export type VendorWorkflowRecordOrigin = "LIVE" | "LEGACY_MIGRATION";

export interface VendorEstimateLineItem {
  id: string;
  category: VendorEstimateLineItemCategory;
  description: string;
  quantity: number;
  unitAmount: number;
  lineAmount: number;
  sortOrder: number;
}

export interface VendorEstimate {
  id: string;
  repairId: string;
  vendorId: string;
  version: number;
  origin: VendorWorkflowRecordOrigin;
  responseType: VendorEstimateResponseType;
  status: VendorEstimateStatus;
  visitAvailableAt?: string;
  estimatedDurationMinutes?: number;
  workDescription?: string;
  declineReason?: string;
  totalAmount?: number;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedByManagerId?: string;
  reviewedByTenantId?: string;
  reviewNote?: string;
  lineItems: VendorEstimateLineItem[];
}

/** 업체 작업 화면에 공개 가능한 견적 정보. 관리자 내부 식별자는 포함하지 않는다. */
export type VendorJobEstimateView = Omit<
  VendorEstimate,
  "reviewedByManagerId" | "reviewedByTenantId"
>;

export type VendorEstimateDraftInput =
  | {
      responseType: "FIXED_ESTIMATE";
      estimatedDurationMinutes?: number;
      workDescription: string;
      lineItems: Array<{
        category: VendorEstimateDraftLineItemCategory;
        description: string;
        quantity: number;
        unitAmount: number;
      }>;
    }
  | {
      responseType: "VISIT_REQUIRED";
      visitAvailableAt: string;
      workDescription: string;
      lineItems?: never;
    }
  | { responseType: "DECLINED"; declineReason: string; lineItems?: never };

export type VendorEstimateReviewInput =
  | {
      action: "APPROVE";
      costBearer: "LANDLORD" | "TENANT" | "PENDING";
      note?: string;
    }
  | { action: "REQUEST_REVISION" | "REJECT"; note: string };

export type VendorPaymentRequestStatus =
  | "WAITING_COMPLETION"
  | "PENDING_APPROVAL"
  | "AUTO_PAID"
  | "MANUAL_CREDIT_PAID"
  | "DIRECT_PAID"
  | "TOSS_PAID"
  | "INSUFFICIENT_CREDIT"
  | "CANCELLED"
  | "REVERSED"
  | "DIRECT_PAYMENT_VOIDED";

export type VendorPaymentAttemptMode =
  | "AUTO_CREDIT"
  | "MANUAL_CREDIT"
  | "DIRECT"
  | "TOSS";

export interface VendorCompletionReport {
  id: string;
  repairId: string;
  vendorId: string;
  version: number;
  origin: VendorWorkflowRecordOrigin;
  workSummary: string;
  completedAt: string;
  attachmentIds: string[];
  /** 화면에 공개 가능한 완료 증빙 이미지 URL. */
  attachmentUrls?: string[];
  /** 업체 화면에 공개 가능한 관리자 완료 검토 결과. */
  review?: {
    decision: "APPROVED" | "REJECTED";
    note?: string;
    decidedAt: string;
  };
  submissionKey: string;
  submittedAt: string;
}

export interface SubmitVendorCompletionInput {
  workSummary: string;
  completedAt: string;
  attachmentIds: string[];
  submissionKey: string;
}

export interface RepairCompletionDecision {
  id: string;
  repairId: string;
  completionReportId: string;
  managerId?: string;
  tenantId?: string;
  source: "MANAGER" | "TENANT" | "LEGACY_MIGRATION";
  decision: "APPROVED" | "REJECTED";
  note?: string;
  decidedAt: string;
}

export type DecideRepairCompletionInput =
  | { decision: "APPROVED"; note?: string }
  | { decision: "REJECTED"; note: string };

export interface VendorPaymentRequest {
  id: string;
  repairId: string;
  vendorId: string;
  managerId: string;
  approvedEstimateId: string;
  completionReportId: string;
  completionDecisionId?: string;
  costId?: string;
  payerRole: RepairPaymentPayerRole;
  payerUserId: string;
  amount: number;
  status: VendorPaymentRequestStatus;
  failureReason?: string;
  lastAttemptMode?: VendorPaymentAttemptMode;
  ledgerEntryId?: string;
  createdAt: string;
  processedAt?: string;
}

/** 업체 작업/정산 화면에 공개 가능한 결제 진행 정보. */
export interface VendorJobPaymentView {
  id: string;
  repairId: string;
  amount: number;
  status: VendorPaymentRequestStatus;
  failureReason?: string;
  lastAttemptMode?: VendorPaymentAttemptMode;
  createdAt: string;
  processedAt?: string;
}

/** 세입자 직접결제 대기 기록에는 클라이언트가 금액을 전달하지 않는다. */
export interface RequestTenantDirectPaymentInput {
  idempotencyKey: string;
}

/** 완료 승인 응답에 공개 가능한 결제 정보. 실제 결제자 식별자는 포함하지 않는다. */
export interface VendorCompletionDecisionPaymentView
  extends VendorJobPaymentView {
  payerRole: RepairPaymentPayerRole;
}

/** 관리자 완료 승인 API의 공개 응답. 저장·이벤트용 내부 커밋은 포함하지 않는다. */
export interface VendorCompletionDecisionResult {
  decision: RepairCompletionDecision;
  paymentRequest?: VendorCompletionDecisionPaymentView;
  eventKey: string;
}

/** 완료보고 제출 응답에 공개 가능한 보고 정보. 내부 연결 키는 제외한다. */
export type VendorCompletionSubmissionReportView = Omit<
  VendorCompletionReport,
  "vendorId" | "attachmentIds" | "submissionKey"
>;

/** 업체 완료보고 제출 API의 공개 응답. 저장·이벤트용 내부 커밋은 포함하지 않는다. */
export interface SubmitVendorCompletionResult {
  report: VendorCompletionSubmissionReportView;
  paymentRequest?: VendorJobPaymentView;
}

export interface VendorJobSummary {
  repairId: string;
  ticketId: string;
  title: string;
  trade: string;
  status: string;
  publicLocation: string;
  latestEstimate?: VendorJobEstimateView;
  latestCompletion?: VendorCompletionReport;
  paymentRequest?: VendorJobPaymentView;
  updatedAt: string;
}

export interface VendorJobDetail extends VendorJobSummary {
  description: string;
  attachmentIds: string[];
  /** 임차인/관리자가 작업 요청에 첨부한 공개 가능한 하자 이미지 URL. */
  attachmentUrls?: string[];
  scheduledAt?: string;
  estimates: VendorJobEstimateView[];
  completionReports: VendorCompletionReport[];
}

export interface VendorVisitScheduleInput {
  scheduledAt: string;
}

export interface StartVendorJobResult {
  repairId: string;
  status: "IN_PROGRESS";
  startedAt: string;
}

export interface VendorSettlementRow {
  repairId: string;
  jobTitle: string;
  completedAt: string;
  paymentRequest?: VendorJobPaymentView;
  approvedAmount?: number;
  requestedAt?: string;
}
