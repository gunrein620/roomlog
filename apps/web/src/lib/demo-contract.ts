import type { Contract, ContractExtraction, ContractPrivacy } from "@roomlog/types";

// 계약(T-DOC) 슬라이스 데모 시드 — api(인메모리 리포)와 동일한 값으로 맞춘다.
// 화면이 api 없이도 렌더되도록 프론트 폴백으로도 쓰인다.
export const DEMO_CONTRACT: Contract = {
  id: "ct_0001",
  unitId: "302",
  landlordName: "김임대",
  lifecycle: "active",
  review: "pending", // 검토 전 참고본 (확정 전)
  deletion: "none",
  valueSource: "unverified", // 확정 전이므로 미확인
  monthlyRent: 650000,
  maintenanceFee: 70000,
  paymentDay: 25,
  startDate: "2026-03-01T00:00:00+09:00",
  endDate: "2028-02-29T00:00:00+09:00",
  createdAt: "2026-06-28T09:00:00+09:00",
  updatedAt: "2026-06-28T09:10:00+09:00",
  extractionId: "cx_0001",
};

export const DEMO_EXTRACTION: ContractExtraction = {
  id: "cx_0001",
  contractId: "ct_0001",
  confirmed: false, // 관리자 확정 전 — 참고본
  highlights: [
    "월세 65만원 · 매월 25일 납부",
    "계약 기간 2026.03.01 ~ 2028.02.29 (2년)",
    "묵시적 자동연장 특약 있음 — 확인 필요",
  ],
  items: [
    { label: "보증금", value: "10,000,000원", group: "money", needsCheck: false, evidence: "제1조 보증금은 금 일천만원정(₩10,000,000)으로 한다." },
    { label: "월세", value: "650,000원", group: "money", needsCheck: false, evidence: "차임은 월 금 육십오만원정으로 하며" },
    { label: "관리비", value: "70,000원", group: "money", needsCheck: true, evidence: "관리비 별도(관리규약에 따름)" },
    { label: "납부일", value: "매월 25일", group: "money", needsCheck: false, evidence: "매월 25일까지 임대인 계좌로 납부한다." },
    { label: "임대인 계좌", value: "○○은행 ***-**-****21", group: "money", needsCheck: false, masked: true, evidence: "입금계좌: ○○은행 123-45-678921" },
    { label: "계약 기간", value: "2026.03.01 ~ 2028.02.29", group: "term", needsCheck: false, evidence: "임대차 기간은 2026년 3월 1일부터 24개월로 한다." },
    { label: "자동연장", value: "묵시적 갱신 특약", group: "term", needsCheck: true, evidence: "만료 1개월 전 통지 없을 시 동일 조건 자동연장" },
    { label: "상세 주소", value: "서울시 ○○구 ***로 **길 **", group: "term", needsCheck: false, masked: true, evidence: "목적물: 서울시 ○○구 △△로 12길 34, 302호" },
    { label: "원상복구", value: "퇴거 시 원상복구 의무", group: "responsibility", needsCheck: false, evidence: "임차인은 퇴거 시 목적물을 원상으로 회복하여 반환한다." },
    { label: "수선 책임", value: "소모품·경미한 수선 임차인 부담", group: "responsibility", needsCheck: true, evidence: "경미한 수선 및 소모품 교체는 임차인 부담으로 한다." },
  ],
  helpNotes: [
    {
      clause: "묵시적 자동연장",
      plain: "만료 1개월 전에 아무도 연락하지 않으면 같은 조건으로 계약이 자동으로 연장돼요. 이사 계획이 있으면 미리 알려두면 좋아요.",
      source: "만료 1개월 전 통지 없을 시 동일 조건 자동연장",
    },
    {
      clause: "원상복구 의무",
      plain: "퇴거할 때 처음 상태로 되돌려 놓아야 해요. 입주 전 사진을 남겨두면 나중에 도움이 돼요.",
      source: "임차인은 퇴거 시 목적물을 원상으로 회복하여 반환한다.",
    },
    {
      clause: "경미한 수선 부담",
      plain: "소모품 교체나 작은 수리는 임차인이 부담할 수 있어요. 큰 하자는 임대인 책임일 수 있으니 관리자에게 물어보세요.",
      source: "경미한 수선 및 소모품 교체는 임차인 부담으로 한다.",
    },
  ],
  createdAt: "2026-06-28T09:10:00+09:00",
};

export const DEMO_PRIVACY: ContractPrivacy = {
  contractId: "ct_0001",
  maskingEnabled: true,
  retention: [
    { label: "계약서 원본·추출값", reason: "정산·분쟁 대비", until: "계약 종료 후 5년" },
    { label: "임대인 계좌·연락처", reason: "정산 완료 시 즉시 파기", until: "정산 완료 시" },
    { label: "삭제 요청 이력", reason: "처리 감사로그", until: "3년" },
  ],
  forwardingConsent: false, // 업체 전달은 전달 시점 별도 동의 (업로드에서 분리)
  deletion: "none",
  deletionSlaHours: 72, // 삭제 요청 처리 SLA (무응답 시 알림)
  deletable: false, // 계약 유효 중 — 종료 후에만 활성
};
