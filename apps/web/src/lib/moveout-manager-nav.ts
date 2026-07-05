/**
 * 룸로그 셸 — 관리인 퇴실·정산 검토(M-OUT) 화면ID → 라우트 매핑.
 *
 * 출처: roomlog_screens_moveout.md 세트 B(관리인 M-OUT).
 */

export const MANAGER_MOVEOUT_ROUTES = {
  "M-OUT-00": "/manager/moveout/00",
  "M-OUT-01": "/manager/moveout/01",
  "M-OUT-02": "/manager/moveout/02",
  "M-OUT-03": "/manager/moveout/03",
  "M-OUT-E0": "/manager/moveout/e0",
} as const;

export type ManagerMoveoutScreenId = keyof typeof MANAGER_MOVEOUT_ROUTES;
export type ManagerMoveoutRoute = (typeof MANAGER_MOVEOUT_ROUTES)[ManagerMoveoutScreenId];

export const MANAGER_MOVEOUT_START = MANAGER_MOVEOUT_ROUTES["M-OUT-00"];

export function managerMoveoutRouteFor(id: ManagerMoveoutScreenId): ManagerMoveoutRoute {
  return MANAGER_MOVEOUT_ROUTES[id];
}

/** 관리인 퇴실 하위 탭 전환 시 현재 moveout id를 query로 유지한다. */
export function withManagerMoveoutId(route: string, moveoutId?: string) {
  const id = moveoutId?.trim();

  if (!id) {
    return route;
  }

  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}id=${encodeURIComponent(id)}`;
}
