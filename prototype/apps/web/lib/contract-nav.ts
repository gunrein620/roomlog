/**
 * 룸로그 셸 — 임차인 계약서(T-DOC) 화면ID → 라우트 매핑
 *
 * 컨벤션(하자 nav.ts와 동일): App Router, 화면ID 끝자리를 소문자로 세그먼트화.
 *   T-DOC-00 → /tenant/contract/00 ... T-DOC-04 → /tenant/contract/04, T-DOC-E0 → /tenant/contract/e0
 *
 * 출처(단일 소스): roomlog_screens_contract.md §(3) 전이 테이블 (세트 A · 임차인)
 *
 * 주의: nav.ts(하자 전용·공유)는 건드리지 않는다. 계약 라우트는 이 파일에서만 관리.
 * in-screen/system 전이(같은 페이지 상태 변화·크로스 딥링크)는 여기 대상이 아님.
 */

export const CONTRACT_ROUTES = {
  "T-DOC-00": "/tenant/contract/00",
  "T-DOC-01": "/tenant/contract/01",
  "T-DOC-02": "/tenant/contract/02",
  "T-DOC-03": "/tenant/contract/03",
  "T-DOC-04": "/tenant/contract/04",
  "T-DOC-E0": "/tenant/contract/e0",
} as const;

export type ContractScreenId = keyof typeof CONTRACT_ROUTES;
export type ContractRoute = (typeof CONTRACT_ROUTES)[ContractScreenId];

/** 화면ID로 라우트 문자열을 조회. CONTRACT_ROUTES에 없는 ID를 넘기면 컴파일 타임에 막힘. */
export function contractRouteFor(id: ContractScreenId): ContractRoute {
  return CONTRACT_ROUTES[id];
}
