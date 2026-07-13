import type { Contract, ContractExtraction, ContractPrivacy, DeletionState } from "@roomlog/types";
import { cookies } from "next/headers";
import { apiUrl } from "./api-url";
import { AUTH_COOKIE } from "./auth-cookie";
import { ApiError, serverFetch } from "./server-api";

export type ManagerContractOrigin = "tenant_upload" | "manager_upload" | "manual";

export interface ManagerContractRow {
  contract: Contract;
  tenantName: string;
  buildingName: string;
  origin: ManagerContractOrigin;
  statusLabel: string;
  slaOverdue: boolean;
  needsCheckCount: number;
  daysToExpire: number;
  mobileQuickConfirm: boolean;
}

export interface ManagerContractDashboard {
  counts: {
    pending: number;
    needsCheck: number;
    slaOverdue: number;
    expiringSoon: number;
    unregistered: number;
    deletionRequests: number;
  };
  rows: ManagerContractRow[];
}

export interface ManagerContractDetail {
  row: ManagerContractRow;
  extraction: ContractExtraction;
  privacy: ContractPrivacy;
  tenant: {
    name: string;
    phone: string;
    moveInDate: string;
    residentState: string;
  };
  manualValues: {
    deposit: string;
    rent: string;
    maintenanceFee: string;
    paymentDay: string;
    account: string;
  };
  inventory: string[];
  timeline: ManagerContractTimelineItem[];
  auditLogs: ManagerContractAuditLog[];
  deletionRequests: ManagerDeletionRequest[];
  inviteLinks: ManagerInviteLink[];
  conflictCandidates: ManagerConflictCandidate[];
}

export interface ManagerContractTimelineItem {
  at: string;
  kind: string;
  title: string;
  detail: string;
  href?: string;
}

export interface ManagerContractAuditLog {
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface ManagerDeletionRequest {
  id: string;
  contractId: string;
  unitId: string;
  tenantName: string;
  requestedAt: string;
  slaHours: number;
  state: DeletionState;
  retentionNote: string;
}

export interface ManagerInviteLink {
  id: string;
  unitId: string;
  tenantName: string;
  state: "waiting" | "connected" | "disputed";
  link: string;
  audit: string;
}

export interface ManagerConflictCandidate {
  source: "tenant" | "manager";
  uploadedAt: string;
  summary: string;
  decision: string;
}

export interface ManagerContractUpload {
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
}

export function getManagerContractDashboard(): Promise<ManagerContractDashboard> {
  return serverFetch("/contracts/manager");
}

export function getManagerContractDetail(id?: string): Promise<ManagerContractDetail> {
  const contractId = id || "ct_0001";

  return serverFetch(`/contracts/manager/${encodeURIComponent(contractId)}`);
}

export function confirmManagerContract(id: string): Promise<ManagerContractDetail> {
  return serverFetch<ManagerContractDetail>(`/contracts/manager/${encodeURIComponent(id)}/confirm`, {
    method: "POST",
    body: JSON.stringify({ confirmNeedsCheck: true }),
  });
}

export function requestManagerContractInfo(id: string): Promise<ManagerContractDetail> {
  return serverFetch<ManagerContractDetail>(`/contracts/manager/${encodeURIComponent(id)}/request-info`, {
    method: "POST",
  });
}

export function runManagerContractOcr(id: string): Promise<ManagerContractDetail> {
  return serverFetch<ManagerContractDetail>(`/contracts/manager/${encodeURIComponent(id)}/ocr`, {
    method: "POST",
  });
}

export async function uploadManagerContractDocument(file: File): Promise<ManagerContractUpload> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) {
    throw new ApiError(401, "로그인이 필요합니다.");
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(apiUrl("/contracts/manager/uploads"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: formData,
    cache: "no-store",
  });
  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    throw new ApiError(response.status, message || "계약서 파일 업로드에 실패했습니다.");
  }

  return data as ManagerContractUpload;
}

export function createManagerContract(input: {
  roomId?: string;
  unitId?: string;
  tenantId?: string;
  tenantName?: string;
  fileName?: string;
  fileUrl?: string;
  monthlyRent?: number;
  maintenanceFee?: number;
  paymentDay?: number;
  startDate?: string;
  endDate?: string;
}): Promise<ManagerContractDetail> {
  return serverFetch("/contracts/manager", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateManagerContractManualValues(
  id: string,
  input: {
    deposit?: string;
    monthlyRent?: number;
    maintenanceFee?: number;
    paymentDay?: number;
    account?: string;
    startDate?: string;
    endDate?: string;
  },
): Promise<ManagerContractDetail> {
  return serverFetch(`/contracts/manager/${encodeURIComponent(id)}/manual-values`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updateManagerContractInventory(
  id: string,
  items: string[],
): Promise<ManagerContractDetail> {
  return serverFetch(`/contracts/manager/${encodeURIComponent(id)}/inventory`, {
    method: "PATCH",
    body: JSON.stringify({ items }),
  });
}

export function createManagerContractInvite(
  id: string,
  input: { tenantName: string; email?: string; phone?: string },
): Promise<{ invite: ManagerInviteLink; detail: ManagerContractDetail }> {
  return serverFetch(`/contracts/manager/${encodeURIComponent(id)}/invites`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateManagerContractInvite(
  inviteId: string,
  input: { state: "waiting" | "connected" | "disputed"; note?: string },
): Promise<ManagerContractDetail> {
  return serverFetch(`/contracts/manager/invites/${encodeURIComponent(inviteId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updateManagerContractPrivacy(
  id: string,
  input: { maskingEnabled?: boolean; forwardingConsent?: boolean; retentionNote?: string },
): Promise<ManagerContractDetail> {
  return serverFetch(`/contracts/manager/${encodeURIComponent(id)}/privacy`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function decideManagerContractDeletion(
  id: string,
  state: Extract<DeletionState, "completed" | "limited" | "denied">,
  retentionNote?: string,
): Promise<ManagerContractDetail> {
  return serverFetch<ManagerContractDetail>(`/contracts/manager/${encodeURIComponent(id)}/deletion-decision`, {
    method: "POST",
    body: JSON.stringify({ state, retentionNote }),
  });
}
