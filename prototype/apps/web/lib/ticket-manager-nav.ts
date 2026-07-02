/**
 * 룸로그 셸 — 관리인 티켓 처리(M-DASH·M-CALL) 화면ID → 라우트 매핑
 *
 * 적응형 2세트(반응형 아님): M-DASH=데스크탑 ManagerShell 대시보드(7노드),
 * M-CALL=모바일 PhoneFrame Voice 통화비서(6노드). 같은 백엔드·데이터, 다른 IA.
 * 컨벤션: App Router, 화면ID 끝자리를 소문자로 세그먼트화(E0 → e0).
 *
 * 출처(단일 소스): roomlog_screens_manager-ticket.md §(3) 내비게이션 그래프.
 */

export const MANAGER_TICKET_ROUTES = {
  "M-DASH-00": "/manager/ticket/dash/00",
  "M-DASH-01": "/manager/ticket/dash/01",
  "M-DASH-02": "/manager/ticket/dash/02",
  "M-DASH-03": "/manager/ticket/dash/03",
  "M-DASH-04": "/manager/ticket/dash/04",
  "M-DASH-05": "/manager/ticket/dash/05",
  "M-DASH-E0": "/manager/ticket/dash/e0",
  "M-CALL-00": "/manager/ticket/call/00",
  "M-CALL-01": "/manager/ticket/call/01",
  "M-CALL-02": "/manager/ticket/call/02",
  "M-CALL-03": "/manager/ticket/call/03",
  "M-CALL-04": "/manager/ticket/call/04",
  "M-CALL-E0": "/manager/ticket/call/e0",
} as const;

export type ManagerTicketScreenId = keyof typeof MANAGER_TICKET_ROUTES;
export type ManagerTicketRoute = (typeof MANAGER_TICKET_ROUTES)[ManagerTicketScreenId];

/** 세트 중심(center) 진입점 — 데스크탑 대시보드. */
export const MANAGER_TICKET_START = MANAGER_TICKET_ROUTES["M-DASH-00"];

/** 화면ID로 라우트 문자열을 조회. 없는 ID를 넘기면 컴파일 타임에 막힘. */
export function routeFor(id: ManagerTicketScreenId): ManagerTicketRoute {
  return MANAGER_TICKET_ROUTES[id];
}
