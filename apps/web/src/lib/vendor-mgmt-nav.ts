/**
 * 룸로그 셸 — 관리인 업체관리(M-VEND) 화면ID → 라우트 매핑.
 *
 * 컨벤션: App Router, 화면ID 끝자리를 소문자로 세그먼트화.
 *   M-VEND-00 → /manager/vendor-mgmt/00 ... M-VEND-03 → /manager/vendor-mgmt/03,
 *   M-VEND-E0 → /manager/vendor-mgmt/e0
 */

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
