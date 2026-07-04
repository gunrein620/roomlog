import type {
  MoveoutSummary,
  MoveoutRecordItem,
  MoveoutChecklistItem,
  SettlementEstimate,
  Dispute,
} from "@roomlog/types";

// 퇴실(T-OUT) 슬라이스 데모 시드 — api(인메모리 리포)와 동일한 값으로 맞춘다.
// 화면이 api 없이도 렌더되도록 프론트 폴백으로도 쓰인다.
// 원칙: 예상 반환액 = 범위(단일 숫자 금지) · 훼손 추정 = 가능성만 · 이의 = 양방향 enum + SLA.
// 기준일(데모): 2026-07-01, 계약 종료 2026-07-31 → D-30.

export const DEMO_MOVEOUT: MoveoutSummary = {
  id: "mo_0001",
  unitId: "302",
  contractConfirmed: true, // 계약 확정 → D-day·예상 정산 노출 (미확정이면 안내로 차단)
  leaseEndDate: "2026-07-31T00:00:00+09:00",
  daysRemaining: 30,
  depositAmount: 10_000_000, // 보증금 1,000만원(참고)
  estimatedRefundMin: 9_740_000, // 예상 반환액 범위 — 단일 숫자 금지
  estimatedRefundMax: 9_850_000,
  settlementStatus: "reviewing",
  prepProgress: 0.72,
  settlementId: "st_0001",
  createdAt: "2026-07-01T09:00:00+09:00",
  updatedAt: "2026-07-02T09:00:00+09:00",
};

// '내 기록' 타임라인 — 중립·안심 톤 먼저, 훼손 추정(wearVerdict)은 보조·비적대.
export const DEMO_MOVEOUT_RECORDS: MoveoutRecordItem[] = [
  {
    id: "rec_0001",
    summaryId: "mo_0001",
    source: "movein_photo",
    title: "입주 전 욕실 사진",
    description: "입주 시점 욕실 타일과 수전 사진이 있어 현재 상태와 비교할 수 있습니다.",
    occurredAt: "2024-08-01T10:10:00+09:00",
    moveinComparisonAvailable: true,
  },
  {
    id: "rec_0002",
    summaryId: "mo_0001",
    source: "defect",
    title: "현관 센서등 깜빡임",
    description: "입주 중 접수된 공용 설비 문의이며 수리 완료 이력이 연결되어 있습니다.",
    occurredAt: "2026-02-11T14:20:00+09:00",
    wearVerdict: "aging_likely",
    wearNote: "소모품 노후 가능성이 높아 임차인 책임으로 단정하지 않습니다.",
    moveinComparisonAvailable: false,
  },
  {
    id: "rec_0003",
    summaryId: "mo_0001",
    source: "repair",
    title: "욕실 실리콘 보수",
    description: "보수 완료 후 사진이 첨부되어 있어 차감 후보 산정 근거로만 사용됩니다.",
    occurredAt: "2026-05-12T16:00:00+09:00",
    wearVerdict: "unclear",
    wearNote: "노후와 사용 중 훼손 가능성이 함께 있어 관리인 확인이 필요합니다.",
    moveinComparisonAvailable: true,
  },
  {
    id: "rec_0004",
    summaryId: "mo_0001",
    source: "payment",
    title: "7월 관리비 정산",
    description: "관리비 일부 미납 후보가 예상 정산안에 반영되었습니다.",
    occurredAt: "2026-07-01T09:00:00+09:00",
    moveinComparisonAvailable: false,
  },
  {
    id: "rec_0005",
    summaryId: "mo_0001",
    source: "contract",
    title: "원상복구 특약",
    description: "계약서 원상복구 조항은 참고 근거이며 최종 차감 확정이 아닙니다.",
    occurredAt: "2024-08-01T10:00:00+09:00",
    moveinComparisonAvailable: false,
  },
  {
    id: "rec_0006",
    summaryId: "mo_0001",
    source: "chat",
    title: "퇴실 일정 문의",
    description: "임차인이 퇴실 일정과 정산 예상 범위 안내를 요청했습니다.",
    occurredAt: "2026-06-30T13:30:00+09:00",
    moveinComparisonAvailable: false,
  },
];

// 퇴실 체크리스트 — 호실 옵션 인벤토리(M-DOC-03) 기반. 노후/마모 vs 훼손 구분.
export const DEMO_MOVEOUT_CHECKLIST: MoveoutChecklistItem[] = [
  { id: "ck_0001", summaryId: "mo_0001", label: "현관 카드키 2개", present: true, condition: "normal", note: "반납 예정" },
  { id: "ck_0002", summaryId: "mo_0001", label: "에어컨 리모컨", present: true, condition: "normal" },
  { id: "ck_0003", summaryId: "mo_0001", label: "욕실 환풍기", present: true, condition: "aging", note: "소음이 있으나 노후로 보입니다." },
  { id: "ck_0004", summaryId: "mo_0001", label: "붙박이장 손잡이", present: true, condition: "damage_check", note: "헐거움 확인 필요" },
  {
    id: "ck_0005",
    summaryId: "mo_0001",
    label: "우편함 열쇠",
    present: false,
    condition: "damage_check",
    note: "분실 여부 확인 중",
  },
];

// 예상 정산 안내 — 참고 전용. 예상 반환액 = 범위. 보증금 1,000만 − 차감 후보 합.
export const DEMO_MOVEOUT_SETTLEMENT: SettlementEstimate = {
  id: "st_0001",
  summaryId: "mo_0001",
  depositAmount: 10_000_000,
  deductions: [
    {
      id: "de_0001",
      kind: "unpaid",
      label: "7월 관리비 미납 후보",
      estimatedMin: 70_000,
      estimatedMax: 70_000,
      needsConfirmation: false,
      evidenceNote: "납부 내역 기준 7월 관리비 잔액 후보입니다.",
      source: "payment",
    },
    {
      id: "de_0002",
      kind: "repair",
      label: "욕실 실리콘 보수 후보",
      estimatedMin: 30_000,
      estimatedMax: 80_000,
      needsConfirmation: false,
      evidenceNote: "입주 전 사진과 2026년 보수 이력을 함께 비교합니다.",
      source: "repair",
    },
    {
      id: "de_0003",
      kind: "restoration",
      label: "붙박이장 손잡이 원상복구 후보",
      estimatedMin: 30_000,
      estimatedMax: 70_000,
      needsConfirmation: false,
      evidenceNote: "체크리스트 손잡이 헐거움과 계약서 원상복구 조항을 참고합니다.",
      source: "contract",
    },
    {
      id: "de_0004",
      kind: "cleaning",
      label: "퇴실 기본 청소 후보",
      estimatedMin: 20_000,
      estimatedMax: 40_000,
      needsConfirmation: false,
      evidenceNote: "퇴실 청소 조항 기준 예상 후보이며 실제 상태 확인 전 확정하지 않습니다.",
      source: "contract",
    },
  ],
  refundMin: 9_740_000, // 보증금 − 차감 최대 합
  refundMax: 9_850_000, // 보증금 − 차감 최소 합
  status: "reviewing",
  disclaimer: "참고자료이며 최종 정산은 관리자 확인 후 확정됩니다.",
  createdAt: "2026-07-01T09:00:00+09:00",
};

// 이의·정정 요청 — 양방향 상태머신 + 무응답 SLA·에스컬레이션 출구.
export const DEMO_MOVEOUT_DISPUTES: Dispute[] = [
  {
    id: "dp_0001",
    summaryId: "mo_0001",
    targetItemId: "de_0002",
    targetLabel: "욕실 실리콘 보수 후보",
    reason: "입주 전부터 있던 변색이라 차감 대상이 아니라고 봅니다.",
    status: "received",
    slaDeadline: "2026-07-01T09:00:00+09:00",
    slaBreached: true,
    history: [
      { status: "received", at: "2026-06-28T09:00:00+09:00", note: "입주 전부터 있던 변색입니다." },
    ],
    createdAt: "2026-06-28T09:00:00+09:00",
    updatedAt: "2026-06-28T09:00:00+09:00",
  },
];

/** 현재 데모 퇴실 요약 id (셸 슬라이스는 단일 흐름) */
export const DEMO_MOVEOUT_ID = DEMO_MOVEOUT.id;
