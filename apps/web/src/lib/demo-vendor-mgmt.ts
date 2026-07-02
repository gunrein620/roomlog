import type {
  VendorAiComment,
  VendorDuplicateCandidate,
  VendorJobRecord,
  VendorPerf,
  VendorPerfEvent,
  VendorProfile,
} from "@roomlog/types";
import { VENDOR_PERF_MIN_N } from "@roomlog/types";

// 업체관리(M-VEND) 데모 시드 — api(인메모리 리포)와 동일한 값으로 맞춘다(단일 소스).
// 화면이 api 없이도 렌더되도록 프론트 폴백으로도 쓰인다.
// 원칙 반영: D22 자동 누적 read·D26 소표본 별점 숨김/AI 비활성·커버리지·업체 미러·개인정보(연락처 전용·호실 마스킹).

/** 업체 미러 안내(D26) — 성과 화면 공통 문구. */
export const VENDOR_MIRROR_NOTICE =
  "이 업체는 V-JOB에서 본인 성과를 보고 이의할 수 있어요.";

/**
 * 업체 주소록 — 완료 수리에서 자동 누적된 read 뷰(D22).
 * 빠른배관/○○냉난방은 ticket 시드 vendorName과 일치(자동 누적 경로 재현).
 */
export const DEMO_VENDORS: VendorProfile[] = [
  // 충분 표본 — 별점 노출·AI 활성 대상(active, auto)
  {
    id: "vnd_0001",
    name: "빠른배관",
    trades: ["plumbing", "waterproofing"],
    status: "active",
    source: "auto",
    dealCount: 8,
    lastUsedAt: "2026-07-02T13:00:00+09:00",
    isNew: false,
    phone: "010-2345-6789",
    contactPerson: "김성수",
    address: "서울 성동구 성수동2가",
    memo: "야간·주말 출동 가능. 누수 대응 빠름.",
    createdAt: "2026-03-11T09:00:00+09:00",
    updatedAt: "2026-07-02T13:10:00+09:00",
  },
  // 소표본 — 별점 숨김·'거래 N건'만·AI 비활성 대상(active, auto)
  {
    id: "vnd_0002",
    name: "○○냉난방",
    trades: ["hvac", "appliance"],
    status: "active",
    source: "auto",
    dealCount: 3,
    lastUsedAt: "2026-06-30T10:00:00+09:00",
    isNew: false,
    phone: "010-8765-4321",
    contactPerson: "박냉방",
    memo: "에어컨 세척·냉매 충전.",
    createdAt: "2026-05-02T14:00:00+09:00",
    updatedAt: "2026-06-30T10:05:00+09:00",
  },
  // 신규 — 동일 행 높이 + '신규' 배지(격리 폐기·순환 노출). 자동 누적 1건.
  {
    id: "vnd_0003",
    name: "성수전기",
    trades: ["electrical"],
    status: "active",
    source: "auto",
    dealCount: 1,
    lastUsedAt: "2026-07-01T15:00:00+09:00",
    isNew: true,
    phone: "010-1111-2222",
    createdAt: "2026-07-01T15:20:00+09:00",
    updatedAt: "2026-07-01T15:20:00+09:00",
  },
  // 신규 — 수동 등록(보조 경로). 거래 0건.
  {
    id: "vnd_0004",
    name: "24시열쇠",
    trades: ["locksmith"],
    status: "active",
    source: "manual",
    dealCount: 0,
    isNew: true,
    phone: "010-3333-4444",
    contactPerson: "이잠금",
    memo: "직접 추가(단골). 아직 배정 이력 없음.",
    createdAt: "2026-07-01T18:00:00+09:00",
    updatedAt: "2026-07-01T18:00:00+09:00",
  },
  // 폐업 — 상태(closed) 재현. 소표본이라 별점 숨김.
  {
    id: "vnd_0005",
    name: "옛날청소",
    trades: ["cleaning"],
    status: "closed",
    source: "auto",
    dealCount: 5,
    lastUsedAt: "2026-04-20T10:00:00+09:00",
    isNew: false,
    phone: "010-5555-6666",
    memo: "2026-05 폐업. 이력 보존용.",
    createdAt: "2026-01-15T09:00:00+09:00",
    updatedAt: "2026-05-10T09:00:00+09:00",
  },
];

/**
 * 거래 이력 — 완료 수리(M-VEND-01/02).
 * ticketId(→M-DASH-04)·vendorJobId(→V-JOB-00) 분리. 호실 마스킹 옵션 혼재.
 */
export const DEMO_VENDOR_JOBS: VendorJobRecord[] = [
  {
    id: "vjr_0001",
    vendorId: "vnd_0001",
    ticketId: "tk_0004",
    vendorJobId: "vj_0004",
    completedAt: "2026-07-02T14:00:00+09:00",
    unitId: "502",
    unitMasked: false,
    quoteAmount: 120000,
    responseHours: 2,
    rated: true,
    satisfaction: 5,
    ratedAt: "2026-07-02T15:00:00+09:00",
  },
  {
    id: "vjr_0002",
    vendorId: "vnd_0001",
    ticketId: "tk_0002",
    vendorJobId: "vj_0002",
    completedAt: "2026-06-27T12:00:00+09:00",
    unitId: "804",
    unitMasked: true, // 마스킹 옵션 예시(외부 공유 차단)
    quoteAmount: 350000,
    responseHours: 3,
    rated: true,
    satisfaction: 4,
    ratedAt: "2026-06-27T13:00:00+09:00",
  },
  {
    id: "vjr_0003",
    vendorId: "vnd_0001",
    ticketId: "tk_0031",
    vendorJobId: "vj_0031",
    completedAt: "2026-06-10T11:00:00+09:00",
    unitId: "1103",
    unitMasked: false,
    quoteAmount: 65000,
    responseHours: 4,
    rated: false, // 미평가(커버리지 하락 원천)
  },
  {
    id: "vjr_0004",
    vendorId: "vnd_0002",
    ticketId: "tk_0001",
    vendorJobId: "vj_0001",
    completedAt: "2026-06-30T11:00:00+09:00",
    unitId: "302",
    unitMasked: false,
    quoteAmount: 80000,
    responseHours: 5,
    rated: true,
    satisfaction: 4,
    ratedAt: "2026-06-30T12:00:00+09:00",
  },
  {
    id: "vjr_0005",
    vendorId: "vnd_0003",
    ticketId: "tk_0028",
    vendorJobId: "vj_0028",
    completedAt: "2026-07-01T15:00:00+09:00",
    unitId: "701",
    unitMasked: false,
    quoteAmount: 45000,
    responseHours: 6,
    rated: false, // 신규·미평가 → 커버리지 0
  },
];

/**
 * 성과 auto-append 이벤트 로그 — vnd_0001 한 건(tk_0004)의 전체 파이프라인 재현.
 * 이벤트별 지표 원천 필드 고정(계약).
 */
export const DEMO_VENDOR_PERF_EVENTS: VendorPerfEvent[] = [
  {
    id: "vpe_0001",
    vendorId: "vnd_0001",
    type: "quote_requested",
    at: "2026-07-02T10:00:00+09:00",
    ticketId: "tk_0004",
  },
  {
    id: "vpe_0002",
    vendorId: "vnd_0001",
    type: "vendor_viewed",
    at: "2026-07-02T10:05:00+09:00",
    ticketId: "tk_0004",
  },
  {
    id: "vpe_0003",
    vendorId: "vnd_0001",
    type: "quote_submitted",
    at: "2026-07-02T12:00:00+09:00",
    ticketId: "tk_0004",
    jobId: "vj_0004",
    responseHours: 2,
    quoteAmount: 120000,
  },
  {
    id: "vpe_0004",
    vendorId: "vnd_0001",
    type: "assigned",
    at: "2026-07-02T12:30:00+09:00",
    ticketId: "tk_0004",
    jobId: "vj_0004",
  },
  {
    id: "vpe_0005",
    vendorId: "vnd_0001",
    type: "completed",
    at: "2026-07-02T14:00:00+09:00",
    jobId: "vj_0004",
  },
  {
    id: "vpe_0006",
    vendorId: "vnd_0001",
    type: "rated",
    at: "2026-07-02T15:00:00+09:00",
    jobId: "vj_0004",
    satisfaction: 5, // M-DASH-04 완료 시점 소유
  },
];

const AI_COMMENT_VND_0001: VendorAiComment = {
  summary: "누수·배관 건에서 평균 응답 2~3시간, 견적은 시장 평균 대비 소폭 낮음(근거 3건).",
  basisJobIds: ["vj_0004", "vj_0002", "vj_0031"],
  label: "참고용",
};

/**
 * 성과 집계(vendor_perf) — read-only.
 * vnd_0001: 충분 표본 → 별점 노출·AI 활성 / vnd_0002·vnd_0005: 소표본 → 별점 숨김·AI 비활성.
 */
export const DEMO_VENDOR_PERF: VendorPerf[] = [
  {
    vendorId: "vnd_0001",
    sampleN: 6,
    minN: VENDOR_PERF_MIN_N,
    completedCount: 8,
    ratedCount: 6,
    coverageRatio: 0.75,
    coverageLow: false,
    responseMedianHours: 3,
    quoteVsAvgPct: 96,
    satisfactionAvg: 4.3,
    ratingVisible: true, // sampleN(6) ≥ minN(5) + 복수 맥락
    aiCommentEnabled: true,
    aiComment: AI_COMMENT_VND_0001,
    mirrorNotice: VENDOR_MIRROR_NOTICE,
    updatedAt: "2026-07-02T15:05:00+09:00",
  },
  {
    vendorId: "vnd_0002",
    sampleN: 2,
    minN: VENDOR_PERF_MIN_N,
    completedCount: 3,
    ratedCount: 2,
    coverageRatio: 0.67,
    coverageLow: true, // 표본·커버리지 미달 → 평균 '참고 불가'
    responseMedianHours: 5,
    quoteVsAvgPct: 108,
    satisfactionAvg: undefined, // 소표본 → 별점 숨김
    ratingVisible: false, // sampleN(2) < minN(5)
    aiCommentEnabled: false, // min_n 미만 → AI 비활성
    mirrorNotice: VENDOR_MIRROR_NOTICE,
    updatedAt: "2026-06-30T12:05:00+09:00",
  },
  {
    vendorId: "vnd_0005",
    sampleN: 4,
    minN: VENDOR_PERF_MIN_N,
    completedCount: 5,
    ratedCount: 4,
    coverageRatio: 0.8,
    coverageLow: false,
    responseMedianHours: 6,
    quoteVsAvgPct: 101,
    satisfactionAvg: undefined, // 표본 4 < min_n → 별점 숨김
    ratingVisible: false,
    aiCommentEnabled: false,
    mirrorNotice: VENDOR_MIRROR_NOTICE,
    updatedAt: "2026-05-10T09:00:00+09:00",
  },
];

/** 중복 탐지 후보(M-VEND-03) — 같은 이름/연락처 병합 제안 데모. */
export const DEMO_VENDOR_DUPLICATE_CANDIDATES: VendorDuplicateCandidate[] = [
  { vendorId: "vnd_0001", name: "빠른배관", reason: "same_phone" },
];

/** 데모 진입 앵커 — 상세/성과 흐름 시작점(M-VEND-01/02). */
export const DEMO_VENDOR_ID = "vnd_0001";
