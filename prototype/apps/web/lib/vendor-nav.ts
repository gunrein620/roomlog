/**
 * 룸로그 셸 — 수리업체(V-JOB) 화면ID → 라우트 매핑
 *
 * 컨벤션: App Router, 화면ID 끝자리를 소문자로 세그먼트화.
 *   V-JOB-00 → /vendor/00 ... V-JOB-06 → /vendor/06, V-JOB-E0 → /vendor/e0
 */

export const ROUTES = {
  "V-JOB-00": "/vendor/00",
  "V-JOB-01": "/vendor/01",
  "V-JOB-02": "/vendor/02",
  "V-JOB-03": "/vendor/03",
  "V-JOB-04": "/vendor/04",
  "V-JOB-05": "/vendor/05",
  "V-JOB-06": "/vendor/06",
  "V-JOB-E0": "/vendor/e0",
} as const;

export type VendorScreenId = keyof typeof ROUTES;
export type VendorRoute = (typeof ROUTES)[VendorScreenId];

export function routeFor(id: VendorScreenId): VendorRoute {
  return ROUTES[id];
}
