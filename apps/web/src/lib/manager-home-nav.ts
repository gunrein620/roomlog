/**
 * 룸로그 셸 — 관리인 자산현황 홈/셸(M-HOME 데스크탑) + Voice 비서 홈(M-VOX 폰) 라우트.
 * 스펙: roomlog_screens_manager-home.md. 셸=라우팅 허브(중복 0), 기존 관리인 세트로 위임.
 */
export const MHOME_ROUTES = {
  "M-HOME-00": "/manager/home/00", // 자산현황 대시보드 (center)
  "M-HOME-01": "/manager/home/01", // 미처리 업무 허브
  "M-HOME-02": "/manager/home/02", // 임대 현황 리포트(지표·차트)
  "M-HOME-03": "/manager/home/03", // 전체 건물 관리
  "M-HOME-04": "/manager/home/04", // 건물 상세
  "M-HOME-05": "/manager/home/05", // 건물·호실 등록 / CSV
  "M-HOME-06": "/manager/home/06", // 설정
  "M-HOME-E0": "/manager/home/e0",
} as const;

export const MVOX_ROUTES = {
  "M-VOX-00": "/manager/vox/00", // Voice 비서 홈 (center)
  "M-VOX-01": "/manager/vox/01", // 오늘 업무 처리
  "M-VOX-02": "/manager/vox/02", // 자산 현황 요약
  "M-VOX-E0": "/manager/vox/e0",
} as const;

export type MHomeScreenId = keyof typeof MHOME_ROUTES;
export type MVoxScreenId = keyof typeof MVOX_ROUTES;

/** 기존 관리인 세트로의 크로스 라우팅 (셸 위임 대상). 미구현 세트는 나중에 라우트 생김. */
export const MANAGER_CROSS = {
  ticketDash: "/manager/ticket/dash/00", // M-DASH
  ticketCall: "/manager/ticket/call/00", // M-CALL
  billing: "/manager/billing", // M-BILL
  messaging: "/manager/messaging/00", // M-MSG (소통)
  realtimeAgent: "/manager/agent/realtime", // 관리인 실시간 AI 운영 에이전트
  cost: "/manager/cost", // M-COST (병렬 구축 중)
  contract: "/manager/contract/00", // M-DOC (미구현 — 추후)
  moveout: "/manager/moveout/00", // M-OUT (미구현 — 추후)
  report: "/manager/report/00", // M-RPT (미구현 — 추후)
} as const;
