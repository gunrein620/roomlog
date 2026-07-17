import type {
  VendorEstimate,
  VendorJobSummary,
  VendorPaymentRequestStatus,
} from "@roomlog/types";

export function nextVendorJobRoute(
  job: Pick<VendorJobSummary, "status"> & Partial<Pick<VendorJobSummary, "latestEstimate">>,
): string {
  const estimate = job.latestEstimate;
  if (estimate?.status === "DRAFT" || estimate?.status === "REVISION_REQUESTED") {
    return "/vendor/job/02";
  }
  if (estimate?.status === "SUBMITTED") return "/vendor/job/03";
  if (
    estimate?.responseType === "VISIT_REQUIRED"
    && estimate.status === "VISIT_SCHEDULED"
  ) {
    return "/vendor/job/02";
  }
  switch (job.status) {
    case "VENDOR_ASSIGNED":
    case "REQUESTED":
    case "REVIEWING":
      return "/vendor/job/02";
    case "ESTIMATE_SUBMITTED":
    case "COMPLETION_REPORTED":
    case "COMPLETED":
    case "CANCELLED":
      return "/vendor/job/03";
    case "ESTIMATE_APPROVED":
      return "/vendor/job/04";
    case "SCHEDULED":
      return estimate?.responseType === "FIXED_ESTIMATE" && estimate.status === "APPROVED"
        ? "/vendor/job/05"
        : "/vendor/job/02";
    case "IN_PROGRESS":
      return "/vendor/job/06";
    default:
      return job.latestEstimate?.status === "DRAFT" ? "/vendor/job/02" : "/vendor/job/03";
  }
}

export function vendorJobStatusLabel(status: string) {
  const labels: Record<string, string> = {
    REQUESTED: "견적 요청",
    VENDOR_ASSIGNED: "견적 요청",
    REVIEWING: "견적 작성 중",
    ESTIMATE_SUBMITTED: "견적 검토 중",
    ESTIMATE_APPROVED: "일정 확인 필요",
    SCHEDULED: "방문 예정",
    IN_PROGRESS: "작업 중",
    COMPLETION_REPORTED: "완료 확인 중",
    COMPLETED: "작업 완료",
    CANCELLED: "종료",
  };
  return labels[status] ?? "진행 상태 확인 중";
}

export function estimateStatusLabel(status?: VendorEstimate["status"]) {
  if (!status) return "미작성";
  const labels: Record<VendorEstimate["status"], string> = {
    DRAFT: "임시 저장",
    SUBMITTED: "관리자 검토 중",
    VISIT_SCHEDULED: "방문 일정 확정",
    DECLINED: "견적 불가 회신",
    REVISION_REQUESTED: "수정 요청",
    APPROVED: "승인 완료",
    REJECTED: "미선정",
    WITHDRAWN: "철회",
    SUPERSEDED: "이전 견적",
  };
  return labels[status];
}

export function paymentStatusLabel(status?: VendorPaymentRequestStatus) {
  if (!status) return "완료 승인 후 정산 요청 생성";
  const labels: Record<VendorPaymentRequestStatus, string> = {
    WAITING_COMPLETION: "관리자 완료 확인 대기",
    PENDING_APPROVAL: "관리자 지급 승인 대기",
    AUTO_PAID: "크레딧 자동 지급 완료",
    MANUAL_CREDIT_PAID: "크레딧 지급 완료",
    DIRECT_PAID: "외부 지급 기록 완료",
    TOSS_PAID: "Toss 결제 완료",
    INSUFFICIENT_CREDIT: "관리자 결제수단 확인 중",
    CANCELLED: "정산 요청 취소",
    REVERSED: "지급 취소",
    DIRECT_PAYMENT_VOIDED: "외부 지급 기록 취소",
  };
  return labels[status];
}
