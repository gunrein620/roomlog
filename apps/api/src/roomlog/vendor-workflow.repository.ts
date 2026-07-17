import type {
  DecideRepairCompletionInput,
  RepairCompletionDecision,
  RequestTenantDirectPaymentInput,
  StartVendorJobResult,
  SubmitVendorCompletionInput,
  TenantVendorCompletionDecisionInput,
  TenantVendorEstimateReviewInput,
  TenantVendorVisitScheduleInput,
  TenantVendorWorkflowView,
  VendorCompletionReport,
  VendorEstimate,
  VendorEstimateDraftInput,
  VendorEstimateReviewInput,
  VendorJobDetail,
  VendorJobMessageView,
  VendorJobPaymentView,
  VendorJobSummary,
  VendorPaymentRequest,
  VendorSettlementRow,
  VendorVisitScheduleInput
} from "@roomlog/types";
import type { AddVendorRepairMessageInput } from "./roomlog.types";

export const VENDOR_WORKFLOW_REPOSITORY = Symbol("VENDOR_WORKFLOW_REPOSITORY");

export interface AssignVendorCommand {
  managerId: string;
  ticketId: string;
  vendorId: string;
  requestNote: string;
}

export type VendorWorkflowRepositoryErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_MANAGER"
  | "TICKET_NOT_FOUND"
  | "TICKET_ACCESS_DENIED"
  | "VENDOR_NOT_ASSIGNABLE"
  | "CONCURRENT_ASSIGNMENT"
  | "REPAIR_NOT_FOUND"
  | "REPAIR_ACCESS_DENIED"
  | "ESTIMATE_NOT_FOUND"
  | "INVALID_STATE"
  | "ESTIMATE_IMMUTABLE"
  | "PAYMENT_SNAPSHOT_LOCKED"
  | "REVIEW_CONFLICT"
  | "COMPLETION_NOT_FOUND"
  | "ATTACHMENT_NOT_FOUND";

export class VendorWorkflowRepositoryError extends Error {
  constructor(
    readonly code: VendorWorkflowRepositoryErrorCode,
    message: string
  ) {
    super(message);
    this.name = "VendorWorkflowRepositoryError";
  }
}

export interface SaveVendorCompletionAttachmentCommand {
  vendorId: string;
  userId: string;
  repairId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  category: "COMPLETION_PHOTO";
}

export type VendorCompletionAttachmentAccess =
  | { role: "VENDOR"; vendorId: string }
  | { role: "LANDLORD"; managerId: string }
  | { role: "TENANT"; tenantId: string };

export interface VendorCompletionAttachmentRecord {
  fileName: string;
  mimeType: string;
}

export interface CompletionCommit {
  report: VendorCompletionReport;
  paymentRequest?: VendorPaymentRequest;
  eventKeys: string[];
}

export interface DecisionCommit {
  decision: RepairCompletionDecision;
  paymentRequest?: VendorPaymentRequest;
  eventKey: string;
}

/**
 * 업체 발신 메시지의 내부 원장 레코드 — Prisma 저장 직후 인메모리 스토어 동기화에 쓴다.
 * (스토어를 안 거치는 저장소 직행 쓰기라서, 이 레코드를 서비스에 되돌려 세입자/관리자
 * 읽기 경로가 재하이드레이션 없이 즉시 메시지를 보게 한다.)
 */
export interface VendorRepairMessageRecord {
  id: string;
  ticketId: string;
  complaintId: string;
  repairId: string;
  senderUserId: string;
  senderRole: "VENDOR";
  messageText: string;
  attachmentUrls: string[];
  createdAt: string;
}

export interface VendorRepairMessageResult {
  view: VendorJobMessageView;
  record: VendorRepairMessageRecord;
}

export interface VendorWorkflowRepository {
  assignVendor(command: AssignVendorCommand): Promise<VendorJobDetail>;
  listJobs(vendorId: string): Promise<VendorJobSummary[]>;
  getJob(vendorId: string, repairId: string): Promise<VendorJobDetail | null>;
  addRepairMessage(
    vendorId: string,
    vendorUserId: string,
    repairId: string,
    input: AddVendorRepairMessageInput
  ): Promise<VendorRepairMessageResult>;
  saveEstimateDraft(command: {
    vendorId: string;
    repairId: string;
    estimateId?: string;
    input: VendorEstimateDraftInput;
  }): Promise<VendorEstimate>;
  submitEstimate(
    vendorId: string,
    repairId: string,
    estimateId: string
  ): Promise<VendorEstimate>;
  withdrawEstimate(
    vendorId: string,
    repairId: string,
    estimateId: string
  ): Promise<VendorEstimate>;
  reviewEstimate(
    managerId: string,
    repairId: string,
    estimateId: string,
    input: VendorEstimateReviewInput
  ): Promise<VendorEstimate>;
  confirmEstimateVisit(
    managerId: string,
    repairId: string,
    estimateId: string,
    input: VendorVisitScheduleInput
  ): Promise<VendorJobDetail>;
  scheduleApprovedJob(
    vendorId: string,
    repairId: string,
    input: VendorVisitScheduleInput
  ): Promise<VendorJobDetail>;
  startJob(vendorId: string, repairId: string): Promise<StartVendorJobResult>;
  saveCompletionAttachment(
    command: SaveVendorCompletionAttachmentCommand
  ): Promise<{ attachmentId: string; fileUrl: string }>;
  findCompletionAttachmentForAccess(
    fileName: string,
    access: VendorCompletionAttachmentAccess
  ): Promise<VendorCompletionAttachmentRecord | null>;
  submitCompletion(
    vendorId: string,
    repairId: string,
    input: SubmitVendorCompletionInput
  ): Promise<CompletionCommit>;
  decideCompletion(
    managerId: string,
    repairId: string,
    input: DecideRepairCompletionInput
  ): Promise<DecisionCommit>;
  getTenantWorkflow(
    tenantId: string,
    complaintId: string
  ): Promise<TenantVendorWorkflowView | null>;
  listTenantPayableWorkflows(
    tenantId: string
  ): Promise<TenantVendorWorkflowView[]>;
  reviewTenantEstimate(
    tenantId: string,
    repairId: string,
    estimateId: string,
    input: TenantVendorEstimateReviewInput
  ): Promise<TenantVendorWorkflowView>;
  confirmTenantEstimateVisit(
    tenantId: string,
    repairId: string,
    estimateId: string,
    input: TenantVendorVisitScheduleInput
  ): Promise<TenantVendorWorkflowView>;
  decideTenantCompletion(
    tenantId: string,
    repairId: string,
    input: TenantVendorCompletionDecisionInput
  ): Promise<TenantVendorWorkflowView>;
  requestTenantDirectPayment(
    tenantId: string,
    paymentRequestId: string,
    input: RequestTenantDirectPaymentInput
  ): Promise<VendorJobPaymentView>;
  confirmVendorDirectPayment(
    vendorId: string,
    vendorUserId: string,
    paymentRequestId: string
  ): Promise<VendorJobPaymentView>;
  listSettlements(vendorId: string): Promise<VendorSettlementRow[]>;
}
