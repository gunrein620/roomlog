import type { VendorVerificationStatus } from "./vendor";
import type { RepairPaymentOrderPublicView } from "./repair-payment";
import type {
  VendorCompletionSubmissionReportView,
  VendorJobEstimateView,
  VendorJobPaymentView,
} from "./vendor-workflow";

export type TenantVendorConnectionRequestStatus = "REQUESTED";

/** 임차인에게 공개 가능한 협력업체 정보. 연락처와 내부 식별자는 포함하지 않는다. */
export interface TenantPartnerVendorPublicView {
  businessName: string;
  trades: string[];
  serviceAreas: string[];
  verificationStatus: Extract<VendorVerificationStatus, "VERIFIED">;
}

export interface TenantPartnerVendorCandidate
  extends TenantPartnerVendorPublicView {
  /** DB 식별자가 아닌 짧은 수명의 opaque 선택 토큰. */
  vendorId: string;
}

export interface TenantVendorConnectionComplaintView {
  complaintId: string;
  title: string;
  category: string;
  location: string;
}

export interface TenantPartnerVendorSearchResult {
  complaint: TenantVendorConnectionComplaintView;
  requiredTrade: string;
  vendors: TenantPartnerVendorCandidate[];
}

export interface PrepareTenantVendorConnectionInput {
  vendorId: string;
}

export interface TenantVendorConnectionPreview {
  previewId: string;
  complaint: TenantVendorConnectionComplaintView;
  ticket: {
    category: string;
    summary: string;
  };
  vendor: TenantPartnerVendorPublicView;
  sharedInfo: Array<{ label: string; value: string }>;
  requiresManagerApproval: false;
}

export interface ConfirmTenantVendorConnectionInput {
  previewId: string;
  idempotencyKey: string;
  requestNote?: string;
}

export interface TenantVendorConnectionRequestView {
  id: string;
  complaintId: string;
  status: TenantVendorConnectionRequestStatus;
  vendor: TenantPartnerVendorPublicView;
  requestNote?: string;
  requestedAt: string;
}

export interface TenantVendorConnectionRequestResult {
  request: TenantVendorConnectionRequestView;
  idempotent: boolean;
}

export type TenantVendorEstimateReviewInput =
  | { action: "APPROVE" }
  | {
      action: "REQUEST_REVISION";
      note: string;
      tenantAvailableTimes?: string;
    };

export interface TenantVendorVisitScheduleInput {
  scheduledAt: string;
}

export type TenantVendorCompletionDecisionInput =
  | { decision: "APPROVED"; note?: string }
  | { decision: "REJECTED"; note: string };

export interface TenantVendorWorkflowView {
  complaintId: string;
  repairId: string;
  title: string;
  publicLocation: string;
  status: string;
  vendor: TenantPartnerVendorPublicView;
  scheduledAt?: string;
  latestEstimate?: VendorJobEstimateView;
  latestCompletion?: VendorCompletionSubmissionReportView;
  paymentRequest?: VendorJobPaymentView;
  latestRepairPaymentOrder?: RepairPaymentOrderPublicView;
  updatedAt: string;
}
