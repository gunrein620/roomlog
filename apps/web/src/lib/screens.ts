// T-DEF 임차인 하자 흐름 — 화면 목록 (라우트 세그먼트 = id).
// 스펙 단일 소스: roomlog_screens_tenant-defect.md / 와이어: T-DEF 하자.dc.html
export type Screen = { id: string; code: string; label: string };

export const TDEF_SCREENS: Screen[] = [
  { id: "00", code: "T-DEF-00", label: "내 하자 홈" },
  { id: "01", code: "T-DEF-01", label: "하자 신고 작성" },
  { id: "02", code: "T-DEF-02", label: "사진 첨부" },
  { id: "03", code: "T-DEF-03", label: "AI 분석 중" },
  { id: "04", code: "T-DEF-04", label: "분석 결과" },
  { id: "e0", code: "T-DEF-E0", label: "분석 오류" },
  { id: "05", code: "T-DEF-05", label: "업체 전달 동의" },
  { id: "06", code: "T-DEF-06", label: "업체 견적" },
  { id: "07", code: "T-DEF-07", label: "수리비 결제" },
  { id: "08", code: "T-DEF-08", label: "수리 진행" },
  { id: "09", code: "T-DEF-09", label: "관리자 처리 현황" },
  { id: "10", code: "T-DEF-10", label: "처리 완료" },
  { id: "11", code: "T-DEF-11", label: "내 신고 현황" },
];

export function screenById(id: string): Screen | undefined {
  return TDEF_SCREENS.find((s) => s.id === id);
}
