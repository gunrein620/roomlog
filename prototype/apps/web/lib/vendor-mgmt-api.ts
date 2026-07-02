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

// 룸로그 API 클라이언트 (관리인 업체관리 M-VEND 슬라이스).
// api가 안 떠 있어도 화면이 렌더되도록 데모 데이터로 폴백한다.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

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

async function tryFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
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
  return tryFetch(`/vendor-mgmt/vendors${query}`, fallback);
}

export async function getVendorDetail(id = DEMO_MANAGER_VENDOR_ID): Promise<VendorDetailBundle> {
  const fallbackVendor = DEMO_VENDORS.find((vendor) => vendor.id === id) ?? DEMO_VENDORS[0];
  const fallback: VendorDetailBundle = {
    vendor: fallbackVendor,
    jobs: DEMO_VENDOR_JOBS.filter((job) => job.vendorId === fallbackVendor.id),
    perf: DEMO_VENDOR_PERF.find((perf) => perf.vendorId === fallbackVendor.id),
  };
  return tryFetch(`/vendor-mgmt/vendors/${encodeURIComponent(id)}`, fallback);
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
  return tryFetch(`/vendor-mgmt/vendors/${encodeURIComponent(id)}/perf`, fallback);
}

export function listVendorDuplicateCandidates(): Promise<VendorDuplicateCandidate[]> {
  return tryFetch("/vendor-mgmt/duplicate-candidates", DEMO_VENDOR_DUPLICATE_CANDIDATES);
}
