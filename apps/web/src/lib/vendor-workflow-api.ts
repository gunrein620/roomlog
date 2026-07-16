import { cookies } from "next/headers";
import type {
  StartVendorJobResult,
  SubmitVendorCompletionInput,
  VendorEstimate,
  VendorEstimateDraftInput,
  VendorJobDetail,
  VendorJobPaymentView,
  VendorJobSummary,
  VendorSettlementRow,
  VendorVisitScheduleInput,
} from "@roomlog/types";
import { AUTH_COOKIE } from "./auth-cookie";
import { apiUrl } from "./api-url";
import { ApiError, serverFetch } from "./server-api";

export {
  estimateStatusLabel,
  nextVendorJobRoute,
  paymentStatusLabel,
  vendorJobStatusLabel,
} from "./vendor-workflow-presenter";

export type VendorWorkflowReadResult<T> = { data: T; source: "API" | "DEMO" };
export type VendorWorkflowJobReadResult = VendorWorkflowReadResult<VendorJobDetail | null> & {
  accessDenied: boolean;
};

const DEMO_ESTIMATE: VendorEstimate = {
  id: "estimate-demo-vendor",
  repairId: "repair-demo-vendor",
  vendorId: "vendor-demo",
  version: 1,
  origin: "LIVE",
  responseType: "FIXED_ESTIMATE",
  status: "APPROVED",
  estimatedDurationMinutes: 60,
  workDescription: "배수 호스 재결합과 드레인 청소",
  totalAmount: 80000,
  submittedAt: "2026-07-12T01:30:00.000Z",
  reviewedAt: "2026-07-12T02:30:00.000Z",
  lineItems: [
    {
      id: "estimate-line-demo-vendor-1",
      category: "MATERIAL",
      description: "배수 호스 및 연결 부속",
      quantity: 1,
      unitAmount: 30000,
      lineAmount: 30000,
      sortOrder: 0,
    },
    {
      id: "estimate-line-demo-vendor-2",
      category: "LABOR",
      description: "드레인 청소 및 재결합",
      quantity: 1,
      unitAmount: 50000,
      lineAmount: 50000,
      sortOrder: 1,
    },
  ],
};

export const DEMO_VENDOR_JOB_DETAIL: VendorJobDetail = {
  repairId: "repair-demo-vendor",
  ticketId: "ticket-demo-vendor",
  title: "거실 에어컨 배수 누수 수리",
  trade: "냉난방",
  status: "IN_PROGRESS",
  publicLocation: "정글빌라 302호",
  description: "거실 에어컨에서 물이 새고 바닥에 물이 고입니다.",
  attachmentIds: ["attachment-demo-1", "attachment-demo-2"],
  scheduledAt: "2026-07-16T01:00:00.000Z",
  latestEstimate: DEMO_ESTIMATE,
  estimates: [DEMO_ESTIMATE],
  completionReports: [],
  updatedAt: "2026-07-15T05:10:00.000Z",
};

export const DEMO_VENDOR_JOBS: VendorJobSummary[] = [DEMO_VENDOR_JOB_DETAIL];

export function canUseVendorWorkflowDemo(error: unknown) {
  return error instanceof TypeError
    && /fetch failed|failed to fetch|networkerror|load failed/i.test(error.message);
}

export async function readVendorWorkflowData<T>(
  read: () => Promise<T>,
  demo: T,
): Promise<VendorWorkflowReadResult<T>> {
  try {
    return { data: await read(), source: "API" };
  } catch (error) {
    if (!canUseVendorWorkflowDemo(error)) throw error;
    console.warn("[vendor/workflow] API 연결 불가 · 읽기 전용 데모 데이터를 표시합니다.");
    return { data: demo, source: "DEMO" };
  }
}

/** An explicit job that is absent or outside this vendor's scope must never fall through to demo. */
export async function readVendorWorkflowJobData(
  read: () => Promise<VendorJobDetail | null>,
  demo: VendorJobDetail,
): Promise<VendorWorkflowJobReadResult> {
  try {
    return { data: await read(), source: "API", accessDenied: false };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      return { data: null, source: "API", accessDenied: true };
    }
    if (!canUseVendorWorkflowDemo(error)) throw error;
    console.warn("[vendor/workflow] API 연결 불가 · 읽기 전용 데모 데이터를 표시합니다.");
    return { data: demo, source: "DEMO", accessDenied: false };
  }
}

export function listVendorWorkflowJobs() {
  return readVendorWorkflowData(
    () => serverFetch<VendorJobSummary[]>("/vendor/jobs"),
    DEMO_VENDOR_JOBS,
  );
}

export function getVendorWorkflowJob(
  repairId?: string,
): Promise<VendorWorkflowJobReadResult> {
  const read = async (): Promise<VendorJobDetail | null> => {
    if (repairId) {
      return serverFetch<VendorJobDetail>(`/vendor/jobs/${encodeURIComponent(repairId)}`);
    }
    const jobs = await serverFetch<VendorJobSummary[]>("/vendor/jobs");
    const first = jobs[0];
    if (!first) return null;
    return serverFetch<VendorJobDetail>(`/vendor/jobs/${encodeURIComponent(first.repairId)}`);
  };
  return readVendorWorkflowJobData(read, DEMO_VENDOR_JOB_DETAIL);
}

export function listVendorSettlements() {
  return readVendorWorkflowData(
    () => serverFetch<VendorSettlementRow[]>("/vendor/settlements"),
    [],
  );
}

export function saveVendorEstimateDraft(
  repairId: string,
  input: VendorEstimateDraftInput,
  estimateId?: string,
) {
  const suffix = estimateId ? `/${encodeURIComponent(estimateId)}` : "";
  return serverFetch<VendorEstimate>(
    `/vendor/jobs/${encodeURIComponent(repairId)}/estimate-draft${suffix}`,
    { method: "PUT", body: JSON.stringify(input) },
  );
}

export function submitVendorEstimate(repairId: string, estimateId: string) {
  return serverFetch<VendorEstimate>(
    `/vendor/jobs/${encodeURIComponent(repairId)}/estimates/${encodeURIComponent(estimateId)}/submit`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function scheduleVendorWorkflowJob(
  repairId: string,
  input: VendorVisitScheduleInput,
) {
  return serverFetch<VendorJobDetail>(
    `/vendor/jobs/${encodeURIComponent(repairId)}/schedule`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function startVendorWorkflowJob(repairId: string) {
  return serverFetch<StartVendorJobResult>(
    `/vendor/jobs/${encodeURIComponent(repairId)}/start`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function uploadVendorCompletionPhoto(repairId: string, file: File) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const form = new FormData();
  form.set("file", file, file.name);
  const response = await fetch(
    apiUrl(`/vendor/jobs/${encodeURIComponent(repairId)}/completion-attachments`),
    {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    },
  );
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new Error(message || "완료 사진을 업로드하지 못했습니다.");
  }
  return body as { attachmentId: string; fileUrl: string };
}

export function submitVendorCompletionReport(
  repairId: string,
  input: SubmitVendorCompletionInput,
) {
  return serverFetch<{ report: unknown; paymentRequest?: VendorJobPaymentView }>(
    `/vendor/jobs/${encodeURIComponent(repairId)}/completion-reports`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function toSeoulVendorScheduleIso(value: string) {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
    throw new Error("방문 일정을 확인해 주세요.");
  }
  const parsed = new Date(`${normalized}:00+09:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error("방문 일정을 확인해 주세요.");
  return parsed.toISOString();
}
