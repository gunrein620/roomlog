import type {
  DecideRepairCompletionInput,
  ManagerVendorDetail,
  ManagerVendorJobLookup,
  ManagerVendorView,
  VendorCatalogSearchFilters,
  VendorCatalogSearchResult,
  VendorCompletionDecisionResult,
  VendorEstimate,
  VendorEstimateReviewInput,
  VendorJobDetail,
  VendorVisitScheduleInput,
} from "@roomlog/types";
import {
  DEMO_MANAGER_VENDOR_DETAILS,
  DEMO_MANAGER_VENDORS,
  DEMO_VENDOR_SEARCH_RESULTS,
} from "./demo-vendor-mgmt";
import { serverFetch } from "./server-api";

export type VendorReadResult<T> = { data: T; source: "API" | "DEMO" };

/** Node/browser fetch가 연결 단계에서 내는 TypeError만 데모 허용 대상으로 본다. */
export function canUseVendorReadDemo(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  return /fetch failed|failed to fetch|networkerror|load failed/i.test(error.message);
}

export async function readVendorData<T>(
  read: () => Promise<T>,
  demo: T,
): Promise<VendorReadResult<T>> {
  try {
    return { data: await read(), source: "API" };
  } catch (error) {
    if (!canUseVendorReadDemo(error)) throw error;
    console.warn("[vendor-mgmt/api] API 연결 불가 · 명시적 데모 데이터 사용");
    return { data: demo, source: "DEMO" };
  }
}

export function toSeoulScheduleIso(value: string) {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
    throw new Error("방문 일정을 확인해 주세요.");
  }
  const date = new Date(`${normalized}:00+09:00`);
  if (Number.isNaN(date.getTime())) throw new Error("방문 일정을 확인해 주세요.");
  return date.toISOString();
}

function queryString(filters: VendorCatalogSearchFilters = {}) {
  const params = new URLSearchParams();
  if (filters.query?.trim()) params.set("query", filters.query.trim());
  if (filters.trade?.trim()) params.set("trade", filters.trade.trim());
  if (filters.serviceArea?.trim()) params.set("serviceArea", filters.serviceArea.trim());
  if (filters.verificationStatus) {
    params.set("verificationStatus", filters.verificationStatus);
  }
  if (typeof filters.isActive === "boolean") {
    params.set("isActive", String(filters.isActive));
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

function includesText(values: Array<string | undefined>, query?: string) {
  const normalized = query?.trim().toLocaleLowerCase("ko");
  if (!normalized) return true;
  return values.some((value) => value?.toLocaleLowerCase("ko").includes(normalized));
}

function filterManagerDemo(filters: VendorCatalogSearchFilters) {
  return DEMO_MANAGER_VENDORS.filter(({ catalog }) =>
    includesText(
      [catalog.businessName, catalog.contactPerson, catalog.phone, catalog.businessNumber],
      filters.query,
    )
    && (!filters.trade || catalog.trades.includes(filters.trade))
    && (!filters.serviceArea || catalog.serviceAreas.some((area) => area.includes(filters.serviceArea!)))
    && (!filters.verificationStatus || catalog.verificationStatus === filters.verificationStatus)
    && (filters.isActive === undefined || catalog.isActive === filters.isActive),
  );
}

function filterSearchDemo(filters: VendorCatalogSearchFilters) {
  return DEMO_VENDOR_SEARCH_RESULTS.filter(({ catalog }) =>
    includesText(
      [catalog.businessName, catalog.contactPerson, catalog.phone, catalog.businessNumber],
      filters.query,
    )
    && (!filters.trade || catalog.trades.includes(filters.trade))
    && (!filters.serviceArea || catalog.serviceAreas.some((area) => area.includes(filters.serviceArea!)))
    && (!filters.verificationStatus || catalog.verificationStatus === filters.verificationStatus)
    && (filters.isActive === undefined || catalog.isActive === filters.isActive),
  );
}

export function listManagerVendors(
  filters: VendorCatalogSearchFilters = {},
): Promise<VendorReadResult<ManagerVendorView[]>> {
  return readVendorData(
    () => serverFetch<ManagerVendorView[]>(`/manager/vendor-mgmt/vendors${queryString(filters)}`),
    filterManagerDemo(filters),
  );
}

export function searchVendorCatalog(
  filters: VendorCatalogSearchFilters = {},
): Promise<VendorReadResult<VendorCatalogSearchResult[]>> {
  return readVendorData(
    () => serverFetch<VendorCatalogSearchResult[]>(`/manager/vendor-mgmt/search${queryString(filters)}`),
    filterSearchDemo(filters),
  );
}

export function getManagerVendorDetail(
  vendorId: string,
): Promise<VendorReadResult<ManagerVendorDetail>> {
  const demo = DEMO_MANAGER_VENDOR_DETAILS.find((detail) => detail.vendor.vendorId === vendorId);
  if (!demo) {
    return serverFetch<ManagerVendorDetail>(
      `/manager/vendor-mgmt/vendors/${encodeURIComponent(vendorId)}`,
    ).then((data) => ({ data, source: "API" }));
  }
  return readVendorData(
    () => serverFetch<ManagerVendorDetail>(
      `/manager/vendor-mgmt/vendors/${encodeURIComponent(vendorId)}`,
    ),
    demo,
  );
}

export function getManagerVendorPerformance(
  vendorId: string,
): Promise<VendorReadResult<ManagerVendorDetail["performance"]>> {
  const demo = DEMO_MANAGER_VENDOR_DETAILS.find((detail) => detail.vendor.vendorId === vendorId);
  if (!demo) {
    return serverFetch<ManagerVendorDetail["performance"]>(
      `/manager/vendor-mgmt/vendors/${encodeURIComponent(vendorId)}/performance`,
    ).then((data) => ({ data, source: "API" }));
  }
  return readVendorData(
    () => serverFetch<ManagerVendorDetail["performance"]>(
      `/manager/vendor-mgmt/vendors/${encodeURIComponent(vendorId)}/performance`,
    ),
    demo.performance,
  );
}

export function findDemoManagerVendorJobByTicket(
  ticketId: string,
): ManagerVendorJobLookup | null {
  const candidates = DEMO_MANAGER_VENDOR_DETAILS.flatMap((detail) =>
    detail.jobs
      .filter((job) => job.ticketId === ticketId && job.status !== "CANCELLED")
      .map((job) => ({ vendor: detail.vendor, job })),
  );
  return candidates.find(({ job }) => job.status !== "COMPLETED")
    ?? candidates.find(({ job }) => job.status === "COMPLETED")
    ?? null;
}

export function findManagerVendorJobByTicket(
  ticketId: string,
): Promise<VendorReadResult<ManagerVendorJobLookup | null>> {
  return readVendorData(
    () => serverFetch<ManagerVendorJobLookup | null>(
      `/manager/vendor-mgmt/tickets/${encodeURIComponent(ticketId)}/job`,
    ),
    findDemoManagerVendorJobByTicket(ticketId),
  );
}

export function registerManagerVendor(vendorId: string): Promise<ManagerVendorView> {
  return serverFetch<ManagerVendorView>(
    `/manager/vendor-mgmt/vendors/${encodeURIComponent(vendorId)}/registration`,
    { method: "PUT", body: JSON.stringify({}) },
  );
}

export function archiveManagerVendor(vendorId: string): Promise<ManagerVendorView> {
  return serverFetch<ManagerVendorView>(
    `/manager/vendor-mgmt/vendors/${encodeURIComponent(vendorId)}/registration`,
    { method: "DELETE" },
  );
}

export function updateManagerVendorNote(
  vendorId: string,
  managerNote: string,
): Promise<ManagerVendorView> {
  return serverFetch<ManagerVendorView>(
    `/manager/vendor-mgmt/vendors/${encodeURIComponent(vendorId)}/manager-note`,
    { method: "PATCH", body: JSON.stringify({ managerNote }) },
  );
}

export function assignManagerVendor(
  ticketId: string,
  input: { vendorId: string; requestNote: string },
): Promise<VendorJobDetail> {
  return serverFetch<VendorJobDetail>(
    `/manager/tickets/${encodeURIComponent(ticketId)}/assign-vendor`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function reviewVendorEstimate(
  repairId: string,
  estimateId: string,
  input: VendorEstimateReviewInput,
): Promise<VendorEstimate> {
  return serverFetch<VendorEstimate>(
    `/manager/repairs/${encodeURIComponent(repairId)}/estimates/${encodeURIComponent(estimateId)}/review`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function confirmEstimateVisit(
  repairId: string,
  estimateId: string,
  input: VendorVisitScheduleInput,
): Promise<VendorJobDetail> {
  return serverFetch<VendorJobDetail>(
    `/manager/repairs/${encodeURIComponent(repairId)}/estimates/${encodeURIComponent(estimateId)}/confirm-visit`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function decideRepairCompletion(
  repairId: string,
  input: DecideRepairCompletionInput,
): Promise<VendorCompletionDecisionResult> {
  return serverFetch<VendorCompletionDecisionResult>(
    `/manager/repairs/${encodeURIComponent(repairId)}/completion-decisions`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
