/**
 * 룸로그 셸 — 임차인 입주기록(T-IN) 화면ID → 라우트 매핑
 *
 * 컨벤션: App Router, 화면ID 끝자리를 소문자로 세그먼트화.
 *   T-IN-00 → /tenant/movein/00 ... T-IN-04 → /tenant/movein/04, T-IN-E0 → /tenant/movein/e0
 *
 * 출처(단일 소스): roomlog_screens_movein.md §(3) 전이 테이블
 */

export const ROUTES = {
  "T-IN-00": "/tenant/movein/00",
  "T-IN-01": "/tenant/movein/01",
  "T-IN-02": "/tenant/movein/02",
  "T-IN-03": "/tenant/movein/03",
  "T-IN-04": "/tenant/movein/04",
  "T-IN-E0": "/tenant/movein/e0",
} as const;

export type ScreenId = keyof typeof ROUTES;
export type Route = (typeof ROUTES)[ScreenId];

/** 화면ID로 라우트 문자열을 조회. ROUTES에 없는 ID를 넘기면 컴파일 타임에 막힘. */
export function routeFor(id: ScreenId): Route {
  return ROUTES[id];
}
