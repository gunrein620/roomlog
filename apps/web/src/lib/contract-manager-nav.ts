/**
 * 룸로그 셸 — 관리인 계약(M-DOC) 화면ID → 라우트 매핑.
 *
 * 컨벤션: App Router, 화면ID 끝자리를 세그먼트화.
 *   M-DOC-00 → /manager/contract/00 ... M-DOC-05 → /manager/contract/05,
 *   M-DOC-E0 → /manager/contract/e0
 */

export const MANAGER_CONTRACT_ROUTES = {
  "M-DOC-00": "/manager/contract/00",
  "M-DOC-01": "/manager/contract/01",
  "M-DOC-02": "/manager/contract/02",
  "M-DOC-03": "/manager/contract/03",
  "M-DOC-04": "/manager/contract/04",
  "M-DOC-05": "/manager/contract/05",
  "M-DOC-E0": "/manager/contract/e0",
} as const;

export type ManagerContractScreenId = keyof typeof MANAGER_CONTRACT_ROUTES;
export type ManagerContractRoute =
  (typeof MANAGER_CONTRACT_ROUTES)[ManagerContractScreenId];

export function routeFor(id: ManagerContractScreenId): ManagerContractRoute {
  return MANAGER_CONTRACT_ROUTES[id];
}
