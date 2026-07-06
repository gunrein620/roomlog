/**
 * 룸로그 셸 — 임차인 커뮤니케이션(T-MSG) 화면ID → 라우트 매핑
 *
 * 컨벤션: App Router, 화면ID 끝자리를 소문자로 세그먼트화.
 *   T-MSG-00 → /tenant/messaging/00 ... T-MSG-02 → /tenant/messaging/02,
 *   T-MSG-E0 → /tenant/messaging/e0
 *
 * 출처(단일 소스): roomlog_screens_messaging.md §(3) 내비게이션 그래프.
 */

export const MESSAGING_ROUTES = {
  "T-MSG-00": "/tenant/messaging/00",
  "T-MSG-01": "/tenant/messaging/01",
  "T-MSG-02": "/tenant/messaging/02",
  "T-MSG-E0": "/tenant/messaging/e0",
} as const;

export type MessagingScreenId = keyof typeof MESSAGING_ROUTES;
export type MessagingRoute = (typeof MESSAGING_ROUTES)[MessagingScreenId];

/** 화면ID로 라우트 문자열을 조회. 없는 ID를 넘기면 컴파일 타임에 막힘. */
export function routeFor(id: MessagingScreenId): MessagingRoute {
  return MESSAGING_ROUTES[id];
}
