import type {
  Cost,
  CostReviewQueueSummary,
  DisclosureSetting,
  MonthlyCostSummary,
  Receipt,
  ReceiptOcr,
} from "@roomlog/types";

// 비용 슬라이스 데모 시드 — api(인메모리 리포)와 동일한 값으로 맞춘다(단일 소스).
// 화면이 api 없이도 렌더되도록 프론트 폴백으로도 쓰인다.
// 원칙 반영: 상태머신(draft/confirmed/amended/void)·미검증 확정·opt-out 공개·append-only 정정.

export const DEMO_COSTS: Cost[] = [
  // 검토 큐 — OCR 저신뢰 (draft, 집계 제외)
  {
    id: "cost_0001",
    date: "2026-07-01T00:00:00+09:00",
    item: "복도 형광등 교체",
    amount: 48000,
    type: "common",
    scope: "building",
    status: "draft",
    verified: false,
    reviewReason: "ocr_low_confidence",
    receiptId: "rcpt_0001",
    createdAt: "2026-07-01T18:20:00+09:00",
    updatedAt: "2026-07-01T18:20:00+09:00",
  },
  // 검토 큐 — 분류 불확실 (draft)
  {
    id: "cost_0002",
    date: "2026-06-30T00:00:00+09:00",
    item: "철물점 잡자재",
    amount: 23500,
    type: "other",
    scope: "building",
    status: "draft",
    verified: false,
    reviewReason: "classification_unclear",
    receiptId: "rcpt_0002",
    createdAt: "2026-06-30T14:05:00+09:00",
    updatedAt: "2026-06-30T14:05:00+09:00",
  },
  // 검토 큐 — 호실 미매칭 (draft)
  {
    id: "cost_0003",
    date: "2026-06-29T00:00:00+09:00",
    item: "누수 긴급 출장",
    amount: 60000,
    type: "repair",
    scope: "unit",
    status: "draft",
    verified: false,
    reviewReason: "unit_unmatched",
    repairPayment: "already_paid",
    receiptId: "rcpt_0003",
    createdAt: "2026-06-29T20:40:00+09:00",
    updatedAt: "2026-06-29T20:40:00+09:00",
  },
  // 확정 — 수리비, 이미 지불(기록만)
  {
    id: "cost_0004",
    date: "2026-06-28T00:00:00+09:00",
    item: "502호 배수관 세척·트랩 교체",
    amount: 120000,
    type: "repair",
    scope: "unit",
    unitId: "502",
    status: "confirmed",
    verified: true,
    repairPayment: "already_paid",
    receiptId: "rcpt_0004",
    createdAt: "2026-06-28T16:00:00+09:00",
    updatedAt: "2026-06-28T16:30:00+09:00",
  },
  // 확정 — 수리비, 미지불(→M-DASH-05 결제 승인)
  {
    id: "cost_0005",
    date: "2026-06-27T00:00:00+09:00",
    item: "804호 욕실 천장 방수",
    amount: 350000,
    type: "repair",
    scope: "unit",
    unitId: "804",
    status: "confirmed",
    verified: true,
    repairPayment: "unpaid",
    paymentRef: "rj_0004",
    receiptId: "rcpt_0005",
    createdAt: "2026-06-27T11:00:00+09:00",
    updatedAt: "2026-06-27T11:10:00+09:00",
  },
  // 확정 — 관리비(호실), 공개 opt-out 기본 public
  {
    id: "cost_0006",
    date: "2026-06-25T00:00:00+09:00",
    item: "302호 관리비 정산분",
    amount: 82000,
    type: "maintenance",
    scope: "unit",
    unitId: "302",
    status: "confirmed",
    verified: true,
    disclosure: "public",
    receiptId: "rcpt_0006",
    createdAt: "2026-06-25T09:30:00+09:00",
    updatedAt: "2026-06-25T09:35:00+09:00",
  },
  // 확정 — 관리비(공용), 비공개 지정(예외) — hiddenCount 근거
  {
    id: "cost_0007",
    date: "2026-06-24T00:00:00+09:00",
    item: "건물 정화조 청소",
    amount: 180000,
    type: "maintenance",
    scope: "building",
    status: "confirmed",
    verified: true,
    disclosure: "private",
    receiptId: "rcpt_0007",
    createdAt: "2026-06-24T13:00:00+09:00",
    updatedAt: "2026-07-01T10:00:00+09:00",
  },
  // 확정 — 미검증 라벨로 확정(정직 꼬리표, 집계 포함)
  {
    id: "cost_0008",
    date: "2026-06-23T00:00:00+09:00",
    item: "공용 청소용품",
    amount: 15400,
    type: "common",
    scope: "building",
    status: "confirmed",
    verified: false,
    receiptId: "rcpt_0008",
    createdAt: "2026-06-23T17:20:00+09:00",
    updatedAt: "2026-06-23T17:25:00+09:00",
  },
  // 정정 — append-only 새 버전(cost_0004의 금액 정정)
  {
    id: "cost_0009",
    date: "2026-06-28T00:00:00+09:00",
    item: "502호 배수관 세척·트랩 교체(정정)",
    amount: 130000,
    type: "repair",
    scope: "unit",
    unitId: "502",
    status: "amended",
    verified: true,
    repairPayment: "already_paid",
    receiptId: "rcpt_0004",
    supersedesId: "cost_0004",
    createdAt: "2026-07-01T15:00:00+09:00",
    updatedAt: "2026-07-01T15:00:00+09:00",
  },
  // 무효 — void(집계 차감·감사로그)
  {
    id: "cost_0010",
    date: "2026-06-20T00:00:00+09:00",
    item: "중복 등록된 출장비",
    amount: 30000,
    type: "repair",
    scope: "unit",
    unitId: "502",
    status: "void",
    verified: true,
    repairPayment: "already_paid",
    voidReason: "동일 영수증 중복 등록 — 소급 차감",
    receiptId: "rcpt_0004",
    createdAt: "2026-06-20T10:00:00+09:00",
    updatedAt: "2026-07-01T15:05:00+09:00",
  },
];

export const DEMO_RECEIPTS: Receipt[] = [
  {
    id: "rcpt_0001",
    source: "camera",
    imageUrl: "/demo/receipt-fluorescent.jpg",
    hasEvidence: true,
    uploadedAt: "2026-07-01T18:18:00+09:00",
  },
  {
    id: "rcpt_0002",
    source: "file",
    imageUrl: "/demo/receipt-hardware.pdf",
    hasEvidence: true,
    uploadedAt: "2026-06-30T14:00:00+09:00",
  },
  {
    id: "rcpt_0003",
    source: "camera",
    imageUrl: "/demo/receipt-leak.jpg",
    hasEvidence: true,
    uploadedAt: "2026-06-29T20:35:00+09:00",
  },
  {
    id: "rcpt_0004",
    source: "online",
    imageUrl: "/demo/receipt-plumbing.png",
    hasEvidence: true,
    uploadedAt: "2026-06-28T15:50:00+09:00",
  },
  {
    id: "rcpt_0008",
    source: "manual",
    hasEvidence: false, // 증빙 없음(수동 입력) 구분
    uploadedAt: "2026-06-23T17:20:00+09:00",
  },
];

export const DEMO_RECEIPT_OCR: ReceiptOcr[] = [
  {
    id: "ocr_0001",
    receiptId: "rcpt_0001",
    costId: "cost_0001",
    fields: {
      item: { value: "복도 형광등 교체", confidence: 0.62, needsReview: true },
      date: { value: "2026-07-01", confidence: 0.94, needsReview: false },
      amount: { value: 48000, confidence: 0.55, needsReview: true },
    },
    suggestedType: "common",
    typeConfidence: 0.88,
    lineItems: [{ label: "복도 형광등 교체", amount: 48000, suggestedType: "common" }],
    createdAt: "2026-07-01T18:20:00+09:00",
  },
  {
    id: "ocr_0002",
    receiptId: "rcpt_0002",
    costId: "cost_0002",
    fields: {
      item: { value: "철물점 잡자재", confidence: 0.9, needsReview: false },
      date: { value: "2026-06-30", confidence: 0.96, needsReview: false },
      amount: { value: 23500, confidence: 0.93, needsReview: false },
    },
    suggestedType: "other",
    typeConfidence: 0.41, // 분류 불확실
    // 다중 항목 — 기본은 1건 뭉뚱그리기, 분할 후보 제공
    lineItems: [
      { label: "경첩·나사 세트", amount: 8500, suggestedType: "other" },
      { label: "실리콘·방수 테이프", amount: 15000, suggestedType: "repair" },
    ],
    createdAt: "2026-06-30T14:05:00+09:00",
  },
];

export const DEMO_COST_QUEUE_SUMMARY: CostReviewQueueSummary = {
  ocrLowConfidence: 1,
  classificationUnclear: 1,
  unitUnmatched: 1,
  unverifiedConfirmed: 1, // 확정 미검증만 = cost_0008 (draft는 total에 별도 집계)
  total: 3,
};

// 이번 달(2026-07) 지출 합계 — confirmed만·void 차감·amended는 새 버전만 집계.
// 포함: cost_0005(350000)+cost_0006(82000)+cost_0007(180000)+cost_0008(15400)+cost_0009(130000)
export const DEMO_MONTHLY_SUMMARY: MonthlyCostSummary = {
  month: "2026-07",
  totalAmount: 757400,
  byType: {
    repair: 480000, // cost_0005 + cost_0009
    maintenance: 262000, // cost_0006 + cost_0007
    common: 15400, // cost_0008
    other: 0,
  },
  confirmedCount: 5,
};

export const DEMO_DISCLOSURE_SETTING: DisclosureSetting = {
  month: "2026-06",
  scope: "building",
  entries: [
    { costId: "cost_0006", item: "302호 관리비 정산분", amount: 82000, disclosure: "public" },
    {
      costId: "cost_0007",
      item: "건물 정화조 청소",
      amount: 180000,
      disclosure: "private",
      privateReason: "계약상 단가 비공개 항목",
    },
  ],
  hiddenCount: 1, // 비대칭 금지 — 숨김 1건 임차인 고지
  updatedAt: "2026-07-01T10:00:00+09:00",
};

// 데모 진입 앵커 — 큐 처리 흐름 시작점(M-COST-02).
export const DEMO_COST_ID = "cost_0004";
export const DEMO_RECEIPT_OCR_ID = "ocr_0001";
