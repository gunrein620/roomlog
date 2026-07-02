import type { ScreenId } from "./nav";

/**
 * 화면별 전이 목록 — nav-manifest.md의 route 41행 + system 3행(데모)을 소스로 명시.
 * 각 링크의 label = 원 CTA 라벨(와이어 기준), to = 목적지 화면ID.
 * kind: "route"(스펙 route 전이) | "demo"(system 자동전이를 데모용 링크로 노출).
 *
 * 제외(배선 대상 아님): T-DEF-06 취소/환불 안내·T-DEF-11 재요청 제출 시트(와이어 미시각화),
 * in-screen 토글·WF 시나리오 데모 컨트롤.
 */
export type Transition = { label: string; to: ScreenId; kind: "route" | "demo" };

export const TRANSITIONS: Record<string, Transition[]> = {
  "00": [
    { label: "+ 새 하자 신고", to: "T-DEF-01", kind: "route" },
    { label: "진행 중 신고 카드", to: "T-DEF-11", kind: "route" },
    { label: "🔔 알림 벨", to: "T-DEF-11", kind: "route" },
  ],
  "01": [
    { label: "‹ 뒤로", to: "T-DEF-00", kind: "route" },
    { label: "다음: 사진 첨부", to: "T-DEF-02", kind: "route" },
  ],
  "02": [
    { label: "‹ 뒤로 (신규 진입)", to: "T-DEF-01", kind: "route" },
    { label: "‹ 뒤로 (추가정보·재촬영 진입)", to: "T-DEF-11", kind: "route" },
    { label: "분석 요청", to: "T-DEF-03", kind: "route" },
    { label: "추가 정보 제출", to: "T-DEF-11", kind: "route" },
  ],
  "03": [
    { label: "취소", to: "T-DEF-02", kind: "route" },
    { label: "분석 완료", to: "T-DEF-04", kind: "demo" },
    { label: "분석 실패", to: "T-DEF-E0", kind: "demo" },
  ],
  "04": [
    { label: "‹ 뒤로", to: "T-DEF-00", kind: "route" },
    { label: "수리 진행하기", to: "T-DEF-05", kind: "route" },
    { label: "이의 있음 · 관리자 검토 요청", to: "T-DEF-09", kind: "route" },
    { label: "관리자에게 전달", to: "T-DEF-09", kind: "route" },
    { label: "관리자 검토 요청", to: "T-DEF-09", kind: "route" },
    { label: "재촬영 후 재분석", to: "T-DEF-02", kind: "route" },
  ],
  "05": [
    { label: "‹ 뒤로", to: "T-DEF-04", kind: "route" },
    { label: "동의하고 업체 연결", to: "T-DEF-06", kind: "route" },
  ],
  "06": [
    { label: "‹ 뒤로", to: "T-DEF-05", kind: "route" },
    { label: "견적 수락 및 일정 확정", to: "T-DEF-08", kind: "route" },
    { label: "관리자에게 전달", to: "T-DEF-09", kind: "route" },
  ],
  "07": [
    { label: "‹ 뒤로", to: "T-DEF-08", kind: "route" },
    { label: "결제하기", to: "T-DEF-10", kind: "route" },
  ],
  "08": [
    { label: "‹ 뒤로", to: "T-DEF-11", kind: "route" },
    { label: "결제 단계로", to: "T-DEF-07", kind: "route" },
    { label: "업체와 채팅", to: "T-DEF-11", kind: "route" },
  ],
  "09": [
    { label: "‹ 뒤로", to: "T-DEF-11", kind: "route" },
    { label: "관리자와 채팅", to: "T-DEF-11", kind: "route" },
    { label: "추가 정보 제출", to: "T-DEF-02", kind: "route" },
    { label: "수리 진행하기 (확정·동의 미완)", to: "T-DEF-05", kind: "route" },
    { label: "수리 진행하기 (동의 완료·업체 확보)", to: "T-DEF-06", kind: "route" },
    { label: "관리자 처리 완료", to: "T-DEF-10", kind: "demo" },
  ],
  "10": [
    { label: "완료 확인", to: "T-DEF-00", kind: "route" },
    { label: "재요청", to: "T-DEF-11", kind: "route" },
    { label: "전·후 사진 / 기록 보기", to: "T-DEF-11", kind: "route" },
  ],
  "11": [
    { label: "‹ 뒤로", to: "T-DEF-00", kind: "route" },
    { label: "처리 현황 자세히", to: "T-DEF-09", kind: "route" },
    { label: "수리 진행 자세히", to: "T-DEF-08", kind: "route" },
    { label: "추가 정보 제출", to: "T-DEF-02", kind: "route" },
  ],
  "e0": [
    { label: "다시 시도", to: "T-DEF-03", kind: "route" },
    { label: "사진 다시 첨부", to: "T-DEF-02", kind: "route" },
    { label: "뒤로", to: "T-DEF-00", kind: "route" },
  ],
};
