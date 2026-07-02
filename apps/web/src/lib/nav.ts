/**
 * 룸로그 셸 — 임차인 하자(T-DEF) 화면ID → 라우트 매핑
 *
 * 컨벤션(TEAM_PLAN 확정): App Router, 화면ID 끝자리를 소문자로 세그먼트화.
 *   T-DEF-04 → /tenant/defect/04 ... T-DEF-11 → /tenant/defect/11, T-DEF-E0 → /tenant/defect/e0
 *
 * 출처(단일 소스): roomlog_screens_tenant-defect.md §(3) 전이 테이블
 * 대조표: ../nav-manifest.md (버튼 라벨 ↔ 목적지 전수 대조)
 *
 * 주의: 이 파일에 없는 화면ID로 라우팅하지 말 것. in-screen/system 전이는
 * 여기 대상이 아님(같은 페이지 내 상태 변화이거나 사용자 클릭 없는 자동 전이).
 */

export const ROUTES = {
  'T-DEF-00': '/tenant/defect/00',
  'T-DEF-01': '/tenant/defect/01',
  'T-DEF-02': '/tenant/defect/02',
  'T-DEF-03': '/tenant/defect/03',
  'T-DEF-04': '/tenant/defect/04',
  'T-DEF-05': '/tenant/defect/05',
  'T-DEF-06': '/tenant/defect/06',
  'T-DEF-07': '/tenant/defect/07',
  'T-DEF-08': '/tenant/defect/08',
  'T-DEF-09': '/tenant/defect/09',
  'T-DEF-10': '/tenant/defect/10',
  'T-DEF-11': '/tenant/defect/11',
  'T-DEF-E0': '/tenant/defect/e0',
} as const;

export type ScreenId = keyof typeof ROUTES;
export type Route = (typeof ROUTES)[ScreenId];

/** 화면ID로 라우트 문자열을 조회. ROUTES에 없는 ID를 넘기면 컴파일 타임에 막힘. */
export function routeFor(id: ScreenId): Route {
  return ROUTES[id];
}

/**
 * 하자 상세 흐름에서 현재 보고 있는 complaint id를 링크에 전파(?id=).
 * 이걸로 목록→상세→하위상세 내내 같은 하자를 유지(복수 하자 시 목록↔상세 일치).
 * id가 없으면(활성 흐름) 라우트를 그대로 반환.
 */
export function withId(route: string, id?: string): string {
  return id ? `${route}?id=${encodeURIComponent(id)}` : route;
}
