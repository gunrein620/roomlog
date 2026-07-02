/**
 * 룸로그 셸 — 관리인 비용·영수증(M-COST) 화면ID → 라우트 매핑.
 *
 * 스펙: roomlog_screens_cost.md. 비용은 관리인이 쓴 지출이고, 청구(M-BILL)는
 * 받을 돈이다. M-COST는 별도 입력 강요가 아니라 결제·정산 부산물의 원장/큐 뷰다.
 */

export const MANAGER_COST_ROUTES = {
  "M-COST-00": "/manager/cost/00",
  "M-COST-01": "/manager/cost/01",
  "M-COST-02": "/manager/cost/02",
  "M-COST-03": "/manager/cost/03",
  "M-COST-04": "/manager/cost/04",
  "M-COST-E0": "/manager/cost/e0",
} as const;

export type ManagerCostScreenId = keyof typeof MANAGER_COST_ROUTES;
export type ManagerCostRoute = (typeof MANAGER_COST_ROUTES)[ManagerCostScreenId];

export const MANAGER_COST_START = MANAGER_COST_ROUTES["M-COST-00"];

export function routeFor(id: ManagerCostScreenId): ManagerCostRoute {
  return MANAGER_COST_ROUTES[id];
}
