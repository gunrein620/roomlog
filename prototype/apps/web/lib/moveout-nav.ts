/**
 * 룸로그 셸 — 임차인 퇴실(T-OUT) 화면ID → 라우트 매핑
 *
 * 출처(단일 소스): roomlog_screens_moveout.md §(3) 전이 테이블 (세트 A · 임차인 퇴실)
 *
 * 주의: 이 파일에 없는 화면ID로 라우팅하지 말 것. in-screen/system/cross 전이는
 * 여기 대상이 아님(같은 페이지 내 상태 변화·채팅 등 외부).
 */

export const MOVEOUT_ROUTES = {
  "T-OUT-00": "/tenant/moveout/00",
  "T-OUT-01": "/tenant/moveout/01",
  "T-OUT-02": "/tenant/moveout/02",
  "T-OUT-03": "/tenant/moveout/03",
  "T-OUT-04": "/tenant/moveout/04",
} as const;

export type MoveoutScreenId = keyof typeof MOVEOUT_ROUTES;
export type MoveoutRoute = (typeof MOVEOUT_ROUTES)[MoveoutScreenId];

/** 화면ID로 라우트 문자열을 조회. 없는 ID를 넘기면 컴파일 타임에 막힘. */
export function moveoutRouteFor(id: MoveoutScreenId): MoveoutRoute {
  return MOVEOUT_ROUTES[id];
}
