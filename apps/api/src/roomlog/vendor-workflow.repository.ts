import type {
  DecideRepairCompletionInput,
  RepairCompletionDecision,
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
  VendorJobSummary,
  VendorPaymentRequest,
  VendorSettlementRow,
  VendorVisitScheduleInput
} from "@roomlog/types";

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
  | "TRADE_MISMATCH"
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

export interface VendorWorkflowRepository {
  assignVendor(command: AssignVendorCommand): Promise<VendorJobDetail>;
  listJobs(vendorId: string): Promise<VendorJobSummary[]>;
  getJob(vendorId: string, repairId: string): Promise<VendorJobDetail | null>;
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
  listSettlements(vendorId: string): Promise<VendorSettlementRow[]>;
}
