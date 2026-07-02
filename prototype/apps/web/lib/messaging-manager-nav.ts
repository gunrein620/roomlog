/**
 * 룸로그 셸 — 관리인 커뮤니케이션(M-MSG) 화면ID → 라우트 매핑.
 *
 * 컨벤션: App Router, 화면ID 끝자리를 소문자로 세그먼트화.
 *   M-MSG-00 → /manager/messaging/00 ... M-MSG-04 → /manager/messaging/04,
 *   M-MSG-E0 → /manager/messaging/e0
 */

export const MANAGER_MESSAGING_ROUTES = {
  "M-MSG-00": "/manager/messaging/00",
  "M-MSG-01": "/manager/messaging/01",
  "M-MSG-02": "/manager/messaging/02",
  "M-MSG-03": "/manager/messaging/03",
  "M-MSG-04": "/manager/messaging/04",
  "M-MSG-E0": "/manager/messaging/e0",
} as const;

export type ManagerMessagingScreenId = keyof typeof MANAGER_MESSAGING_ROUTES;
export type ManagerMessagingRoute =
  (typeof MANAGER_MESSAGING_ROUTES)[ManagerMessagingScreenId];

export function routeFor(id: ManagerMessagingScreenId): ManagerMessagingRoute {
  return MANAGER_MESSAGING_ROUTES[id];
}
