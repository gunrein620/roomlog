import type {
  TenantVendorCompletionDecisionInput,
  TenantVendorEstimateReviewInput,
  TenantVendorVisitScheduleInput,
  TenantVendorWorkflowView,
} from "@roomlog/types";
import { TenantClientApiError } from "./tenant-intake-api";

type BrowserFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

async function workflowJson<T>(
  path: string,
  init: RequestInit,
  fetcher: BrowserFetcher,
): Promise<T> {
  const response = await fetcher(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    const rawMessage = payload && typeof payload === "object" && "message" in payload
      ? (payload as { message?: unknown }).message
      : undefined;
    const message = Array.isArray(rawMessage)
      ? rawMessage.filter((item): item is string => typeof item === "string").join(", ")
      : typeof rawMessage === "string"
        ? rawMessage
        : "협력업체 작업을 처리하지 못했습니다.";
    throw new TenantClientApiError(response.status, message);
  }
  return payload as T;
}

function tenantComplaintPath(complaintId: string) {
  return `/api/tenant/complaints/${encodeURIComponent(complaintId)}`;
}

function tenantRepairPath(repairId: string) {
  return `/api/tenant/repairs/${encodeURIComponent(repairId)}`;
}

export function getTenantVendorWorkflow(
  complaintId: string,
  fetcher: BrowserFetcher = fetch,
) {
  return workflowJson<TenantVendorWorkflowView | null>(
    `${tenantComplaintPath(complaintId)}/vendor-workflow`,
    { method: "GET" },
    fetcher,
  );
}

export function reviewTenantVendorEstimate(
  repairId: string,
  estimateId: string,
  input: TenantVendorEstimateReviewInput,
  fetcher: BrowserFetcher = fetch,
) {
  const body: TenantVendorEstimateReviewInput = input.action === "APPROVE"
    ? { action: "APPROVE" }
    : { action: "REQUEST_REVISION", note: input.note.trim() };
  return workflowJson<TenantVendorWorkflowView>(
    `${tenantRepairPath(repairId)}/estimates/${encodeURIComponent(estimateId)}/review`,
    { method: "POST", body: JSON.stringify(body) },
    fetcher,
  );
}

export function confirmTenantVendorVisit(
  repairId: string,
  estimateId: string,
  input: TenantVendorVisitScheduleInput,
  fetcher: BrowserFetcher = fetch,
) {
  return workflowJson<TenantVendorWorkflowView>(
    `${tenantRepairPath(repairId)}/estimates/${encodeURIComponent(estimateId)}/confirm-visit`,
    { method: "POST", body: JSON.stringify(input) },
    fetcher,
  );
}

export function decideTenantVendorCompletion(
  repairId: string,
  input: TenantVendorCompletionDecisionInput,
  fetcher: BrowserFetcher = fetch,
) {
  const body: TenantVendorCompletionDecisionInput = input.decision === "APPROVED"
    ? { decision: "APPROVED", ...(input.note?.trim() ? { note: input.note.trim() } : {}) }
    : { decision: "REJECTED", note: input.note.trim() };
  return workflowJson<TenantVendorWorkflowView>(
    `${tenantRepairPath(repairId)}/completion-decisions`,
    { method: "POST", body: JSON.stringify(body) },
    fetcher,
  );
}
