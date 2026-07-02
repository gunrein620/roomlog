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
  settlementStatus: "estimate",
  prepProgress: 0.6,
  settlementId: "st_0001",
  createdAt: "2026-06-30T09:00:00+09:00",
  updatedAt: "2026-07-01T09:00:00+09:00",
};

// '내 기록' 타임라인 — 중립·안심 톤 먼저, 훼손 추정(wearVerdict)은 보조·비적대.
export const DEMO_MOVEOUT_RECORDS: MoveoutRecordItem[] = [
  {
    id: "rec_0001",
    summaryId: "mo_0001",
    source: "movein_photo",
    title: "입주 전 사진 6장",
    description: "거실·주방·욕실 상태를 입주 시점에 기록해 두었어요.",
    occurredAt: "2025-08-01T10:00:00+09:00",
    moveinComparisonAvailable: true,
  },
  {
    id: "rec_0002",
    summaryId: "mo_0001",
    source: "contract",
    title: "계약서 · 원상복구/청소 조항",
    description: "퇴실 시 기본 청소비 부담, 자연 노후는 임차인 책임 아님.",
    occurredAt: "2025-07-20T14:00:00+09:00",
    moveinComparisonAvailable: false,
  },
  {
    id: "rec_0003",
    summaryId: "mo_0001",
    source: "defect",
    title: "에어컨 물샘 신고",
    description: "거실 에어컨 배수관 누수로 신고했고 수리가 진행됐어요.",
    occurredAt: "2026-06-29T20:00:00+09:00",
    moveinComparisonAvailable: false,
  },
  {
    id: "rec_0004",
    summaryId: "mo_0001",
    source: "repair",
    title: "에어컨 배수관 보수",
    description: "○○냉난방이 배수관 보수를 진행했어요(견적 8만원).",
    occurredAt: "2026-06-30T10:00:00+09:00",
    moveinComparisonAvailable: false,
  },
  {
    id: "rec_0005",
    summaryId: "mo_0001",
    source: "payment",
    title: "월세·관리비 납부 이력",
    description: "대부분 정상 납부. 이번 달 관리비 일부가 미납으로 남아 있어요.",
    occurredAt: "2026-06-25T09:00:00+09:00",
    moveinComparisonAvailable: false,
  },
  {
    id: "rec_0006",
    summaryId: "mo_0001",
    source: "movein_photo",
    title: "벽면 못자국 흔적",
    description: "거실 벽에 못자국이 보여요.",
    occurredAt: "2026-07-01T09:00:00+09:00",
    wearVerdict: "damage_possible",
    wearNote: "노후/마모일 수도 있어요. 확인이 필요한 항목이며, 이의·정정을 요청할 수 있어요.",
    moveinComparisonAvailable: true,
  },
];

// 퇴실 체크리스트 — 호실 옵션 인벤토리(M-DOC-03) 기반. 노후/마모 vs 훼손 구분.
export const DEMO_MOVEOUT_CHECKLIST: MoveoutChecklistItem[] = [
  { id: "ck_0001", summaryId: "mo_0001", label: "에어컨", present: true, condition: "aging" },
  { id: "ck_0002", summaryId: "mo_0001", label: "냉장고", present: true, condition: "normal" },
  { id: "ck_0003", summaryId: "mo_0001", label: "세탁기", present: true, condition: "normal" },
  { id: "ck_0004", summaryId: "mo_0001", label: "벽지/도배", present: true, condition: "aging" },
  {
    id: "ck_0005",
    summaryId: "mo_0001",
    label: "싱크대",
    present: true,
    condition: "damage_check",
    note: "하부 마감 확인 필요",
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
      label: "관리비 미납",
      estimatedMin: 50_000,
      estimatedMax: 50_000,
      needsConfirmation: false,
      evidenceNote: "납부 내역: 2026-06 관리비 미납분",
      source: "payment",
    },
    {
      id: "de_0002",
      kind: "repair",
      label: "에어컨 배수관 수리비 후보",
      estimatedMin: 0,
      estimatedMax: 80_000,
      needsConfirmation: true,
      evidenceNote: "하자·수리 이력: 배수관 보수 견적 8만원(책임 미확정)",
      source: "repair",
    },
    {
      id: "de_0003",
      kind: "restoration",
      label: "벽면 못자국 원상복구",
      estimatedMin: 0,
      estimatedMax: 30_000,
      needsConfirmation: true,
      evidenceNote: "입주전 사진 비교 근거 확인 필요(공백 시 차감 확정 아님)",
      source: "movein_photo",
    },
    {
      id: "de_0004",
      kind: "cleaning",
      label: "기본 청소비",
      estimatedMin: 100_000,
      estimatedMax: 100_000,
      needsConfirmation: false,
      evidenceNote: "계약서 청소 조항(정액)",
      source: "contract",
    },
  ],
  refundMin: 9_740_000, // 보증금 − 차감 최대 합
  refundMax: 9_850_000, // 보증금 − 차감 최소 합
  status: "estimate",
  disclaimer: "참고자료이며 최종 정산은 관리자 확인 후 확정됩니다.",
  createdAt: "2026-07-01T09:05:00+09:00",
};

// 이의·정정 요청 — 양방향 상태머신 + 무응답 SLA·에스컬레이션 출구.
export const DEMO_MOVEOUT_DISPUTES: Dispute[] = [
  {
    id: "dp_0001",
    summaryId: "mo_0001",
    targetItemId: "de_0002",
    targetLabel: "에어컨 배수관 수리비 후보",
    reason: "입주 시부터 있던 노후로 알고 있어요. 사용 중 발생한 훼손이 아닙니다.",
    status: "reviewing",
    slaDeadline: "2026-07-04T18:00:00+09:00",
    slaBreached: false,
    history: [
      { status: "received", at: "2026-07-01T09:10:00+09:00" },
      { status: "reviewing", at: "2026-07-01T11:00:00+09:00", note: "관리자 검토 시작" },
    ],
    createdAt: "2026-07-01T09:10:00+09:00",
    updatedAt: "2026-07-01T11:00:00+09:00",
  },
];

/** 현재 데모 퇴실 요약 id (셸 슬라이스는 단일 흐름) */
export const DEMO_MOVEOUT_ID = DEMO_MOVEOUT.id;
