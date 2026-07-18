/** 관리자 업체관리의 의미 기반 정식 경로. */
export const MANAGER_VENDOR_MGMT_PATHS = {
  vendors: "/manager/vendor-mgmt/vendors",
  search: "/manager/vendor-mgmt/search",
  credit: "/manager/vendor-mgmt/credit",
  vendor: (vendorId: string) =>
    `/manager/vendor-mgmt/vendors/${encodeURIComponent(vendorId)}`,
  performance: (vendorId: string) =>
    `/manager/vendor-mgmt/vendors/${encodeURIComponent(vendorId)}/performance`,
} as const;

export const MANAGER_VENDOR_MGMT_NAV = [
  { href: MANAGER_VENDOR_MGMT_PATHS.vendors, label: "내 업체" },
  { href: MANAGER_VENDOR_MGMT_PATHS.credit, label: "크레딧·결제" },
] as const;

export type LegacyVendorMgmtScreen = "00" | "01" | "02" | "03";

export function legacyVendorMgmtRedirect(
  screen: LegacyVendorMgmtScreen,
  query: { id?: string; vendorId?: string },
) {
  const vendorId = query.vendorId ?? query.id;
  if (screen === "01" && vendorId) return MANAGER_VENDOR_MGMT_PATHS.vendor(vendorId);
  if (screen === "02" && vendorId) return MANAGER_VENDOR_MGMT_PATHS.performance(vendorId);
  if (screen === "03") return MANAGER_VENDOR_MGMT_PATHS.search;
  return MANAGER_VENDOR_MGMT_PATHS.vendors;
}

/** 한 릴리스 동안 남기는 화면 ID 호환 매핑. 새 링크에서는 PATHS를 사용한다. */
export const MANAGER_VENDOR_MGMT_ROUTES = {
  "M-VEND-00": "/manager/vendor-mgmt/00",
  "M-VEND-01": "/manager/vendor-mgmt/01",
  "M-VEND-02": "/manager/vendor-mgmt/02",
  "M-VEND-03": "/manager/vendor-mgmt/03",
  "M-VEND-E0": "/manager/vendor-mgmt/e0",
} as const;

export type ManagerVendorMgmtScreenId = keyof typeof MANAGER_VENDOR_MGMT_ROUTES;
export type ManagerVendorMgmtRoute =
  (typeof MANAGER_VENDOR_MGMT_ROUTES)[ManagerVendorMgmtScreenId];

export function routeFor(id: ManagerVendorMgmtScreenId): ManagerVendorMgmtRoute {
  return MANAGER_VENDOR_MGMT_ROUTES[id];
}
