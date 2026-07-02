/**
 * 룸로그 셸 — 임차인 통합 홈·온보딩(T-HOME) 라우트 매핑 + 4세트 크로스 링크.
 * 스펙: roomlog_screens_tenant-home.md. T-HOME은 기존 6도메인을 묶는 착지점(중복 0, 라우팅).
 */
export const HOME_ROUTES = {
  "T-HOME-00": "/tenant/home/00", // 통합 홈 (center)
  "T-HOME-07": "/tenant/home/07", // 시작·인증 (cold 진입)
  "T-HOME-01": "/tenant/home/01", // 초대 수락·연락처 OTP
  "T-HOME-02": "/tenant/home/02", // 가입·약관 동의
  "T-HOME-03": "/tenant/home/03", // 호실 연결 + 기록 귀속 (2게이트)
  "T-HOME-04": "/tenant/home/04", // 알림 센터
  "T-HOME-05": "/tenant/home/05", // 설정
  "T-HOME-06": "/tenant/home/06", // 권한·데이터 요청
  "T-HOME-E0": "/tenant/home/e0", // 오류
} as const;

export type HomeScreenId = keyof typeof HOME_ROUTES;
export function homeRouteFor(id: HomeScreenId): string {
  return HOME_ROUTES[id];
}

/** 4세트(+메시징) 크로스 라우팅 — 홈·알림에서 각 도메인 진입점 */
export const CROSS_ROUTES = {
  defectHome: "/tenant/defect/00",
  defectStatus: "/tenant/defect/11", // 내 신고 현황 (오늘 할 일)
  payment: "/tenant/payment/00",
  contract: "/tenant/contract/00",
  moveout: "/tenant/moveout/00",
  movein: "/tenant/movein/00",
  messaging: "/tenant/messaging/00", // 헤더 말풍선
} as const;
