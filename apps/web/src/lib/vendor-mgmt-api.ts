import type {
  VendorDuplicateCandidate,
  VendorJobRecord,
  VendorPerf,
  VendorProfile,
  VendorTrade,
} from "@roomlog/types";
import {
  DEMO_VENDOR_DUPLICATE_CANDIDATES,
  DEMO_VENDOR_ID,
  DEMO_VENDOR_JOBS,
  DEMO_VENDOR_PERF,
  DEMO_VENDORS,
} from "./demo-vendor-mgmt";
import { serverFetch } from "./server-api";

// 룸로그 API 클라이언트 (관리인 업체관리 M-VEND 슬라이스).
// 서버 컴포넌트 전용: httpOnly 쿠키 토큰을 Nest /manager/vendor-mgmt projection API로 forward한다.
// api가 안 떠 있거나 인증 전이면 경고 로그 후 데모 데이터로 폴백한다.

export const DEMO_MANAGER_VENDOR_ID = DEMO_VENDOR_ID;

export type VendorSort = "trade_recent" | "recent";

export interface VendorListFilters {
  q?: string;
  trade?: VendorTrade | "all";
  sort?: VendorSort;
}

export interface VendorDetailBundle {
  vendor: VendorProfile;
  jobs: VendorJobRecord[];
  perf?: VendorPerf;
}

export interface VendorPerfBundle {
  vendor: VendorProfile;
  jobs: VendorJobRecord[];
  perf: VendorPerf;
}

export interface SaveVendorProfileInput {
  businessName: string;
  contactPerson: string;
  phone: string;
  serviceArea: string;
}

async function tryFetch<T>(path: string, fallback: T, label: string): Promise<T> {
  try {
    return await serverFetch<T>(path);
  } catch (error) {
    console.warn(`[vendor-mgmt/api] ${label} 실패 → 데모 폴백`, error);
    return fallback;
  }
}

function byRecent(a: VendorProfile, b: VendorProfile): number {
  const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
  const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
  return bTime - aTime;
}

function filterVendors(vendors: VendorProfile[], filters: VendorListFilters = {}): VendorProfile[] {
  const q = filters.q?.trim().toLowerCase();
  const trade = filters.trade && filters.trade !== "all" ? filters.trade : undefined;

  return vendors
    .filter((vendor) => {
      const matchesQuery =
        !q ||
        vendor.name.toLowerCase().includes(q) ||
        vendor.phone?.toLowerCase().includes(q) ||
        vendor.contactPerson?.toLowerCase().includes(q);
      const matchesTrade = !trade || vendor.trades.includes(trade);
      return matchesQuery && matchesTrade;
    })
    .sort(byRecent);
}

export function listVendors(filters: VendorListFilters = {}): Promise<VendorProfile[]> {
  const fallback = filterVendors(DEMO_VENDORS, filters);
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.trade && filters.trade !== "all") params.set("trade", filters.trade);
  if (filters.sort) params.set("sort", filters.sort);
  const query = params.toString() ? `?${params.toString()}` : "";
  return tryFetch(`/manager/vendor-mgmt/vendors${query}`, fallback, "업체 목록 조회");
}

export async function getVendorDetail(id = DEMO_MANAGER_VENDOR_ID): Promise<VendorDetailBundle> {
  const fallbackVendor = DEMO_VENDORS.find((vendor) => vendor.id === id) ?? DEMO_VENDORS[0];
  const fallback: VendorDetailBundle = {
    vendor: fallbackVendor,
    jobs: DEMO_VENDOR_JOBS.filter((job) => job.vendorId === fallbackVendor.id),
    perf: DEMO_VENDOR_PERF.find((perf) => perf.vendorId === fallbackVendor.id),
  };
  return tryFetch(
    `/manager/vendor-mgmt/vendors/${encodeURIComponent(id)}`,
    fallback,
    "업체 상세 조회"
  );
}

export function createVendorProfile(input: SaveVendorProfileInput): Promise<VendorDetailBundle> {
  return serverFetch<VendorDetailBundle>(
    "/manager/vendor-mgmt/vendors",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function updateVendorProfile(
  id: string,
  input: SaveVendorProfileInput
): Promise<VendorDetailBundle> {
  return serverFetch<VendorDetailBundle>(
    `/manager/vendor-mgmt/vendors/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(input) }
  );
}

export async function getVendorPerf(id = DEMO_MANAGER_VENDOR_ID): Promise<VendorPerfBundle> {
  const detail = await getVendorDetail(id);
  const fallbackPerf =
    detail.perf ??
    DEMO_VENDOR_PERF.find((perf) => perf.vendorId === detail.vendor.id) ??
    DEMO_VENDOR_PERF[0];
  const fallback: VendorPerfBundle = {
    vendor: detail.vendor,
    jobs: detail.jobs,
    perf: fallbackPerf,
  };
  return tryFetch(
    `/manager/vendor-mgmt/vendors/${encodeURIComponent(id)}/perf`,
    fallback,
    "업체 성과 조회"
  );
}

export function listVendorDuplicateCandidates(): Promise<VendorDuplicateCandidate[]> {
  return tryFetch(
    "/manager/vendor-mgmt/duplicate-candidates",
    DEMO_VENDOR_DUPLICATE_CANDIDATES,
    "업체 중복 후보 조회"
  );
}
