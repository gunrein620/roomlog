// 업체관리 도메인 공유 모델 (관리인 업체관리 표면 M-VEND · web·api 공용)
// 근거: roomlog_screens_vendor-mgmt.md — 업체 주소록 = '자동 누적 read 뷰' + 성과 기록(read-only).
// 타입 이름은 모두 Vendor* 접두어 — 기존 ticket.ts VendorQuoteType 등과 충돌 금지.
// 원칙:
//  - D22 자동 누적 read: 본체=완료 수리에서 자동 누적된 업체를 보는 read 뷰. 수동 등록은 보조.
//    만족도 입력 = M-DASH-04 완료 시점 소유(여기는 read-only 집계).
//  - D26 양면 존엄 대칭: 소표본(min_n 미만) 별점 수치 숨김·'거래 N건'만 / AI 코멘트 min_n 비활성 /
//    별점 정정 24h 창 / 업체 본인 성과 미러(V-JOB)·이의 권리 / 커버리지(rated_n/completed_n) 표기.
//  - 공정성 가드: 목록 별점 제거·신규 격리 폐기(동일 행+배지)·성과순 정렬 제거.
//  - 개인정보: 연락처·주소=관리인 전용·임차인 비노출 / 거래 이력 호실 마스킹 옵션·외부 공유 차단.
//  - 성과 산식 단일 API(vendor_perf) + auto-append 이벤트 계약(지표 원천 고정).

/** 담당 분야 enum (M-VEND-03 다중 선택). 수리 분야 + 종합/기타. */
export type VendorTrade =
  | "plumbing" // 배관·누수
  | "electrical" // 전기
  | "hvac" // 냉난방·에어컨
  | "appliance" // 가전
  | "locksmith" // 도어락·잠금
  | "waterproofing" // 방수
  | "cleaning" // 청소
  | "general" // 종합
  | "other"; // 기타

export const VENDOR_TRADE_OPTIONS = [
  { value: "plumbing", label: "배관·누수" },
  { value: "electrical", label: "전기" },
  { value: "hvac", label: "냉난방·에어컨" },
  { value: "appliance", label: "가전" },
  { value: "locksmith", label: "도어락·잠금" },
  { value: "waterproofing", label: "방수" },
  { value: "cleaning", label: "청소" },
  { value: "general", label: "종합" },
  { value: "other", label: "기타" }
] as const satisfies readonly { value: VendorTrade; label: string }[];

/** 업체 상태 (M-VEND-01/03). 폐업=closed(비활성과 구분). */
export type VendorStatus = "active" | "inactive" | "closed";

/** 등록 경로 (D22) — 완료 수리 자동 누적 / 수동 등록. 배지·안내 구분용. */
export type VendorRegistrationSource = "auto" | "manual";

/**
 * 성과 auto-append 이벤트 계약 (codex P0) — 지표 원천 고정.
 * 각 이벤트가 쓰는 필드는 VendorPerfEvent 참고(이벤트별 필드 정의).
 *  - quote_requested : 관리인이 견적 요청(응답 속도 시작점)
 *  - vendor_viewed   : 후보 표에서 업체 열람(노출 로그)
 *  - quote_submitted : 업체 견적 회신(responseHours·quoteAmount 원천)
 *  - assigned        : 배정(완료 파이프라인 진입)
 *  - completed       : 수리 완료(completedCount 원천)
 *  - rated           : 만족도 부여(M-DASH-04 소유·ratedCount·satisfaction 원천)
 */
export type VendorPerfEventType =
  | "quote_requested"
  | "vendor_viewed"
  | "quote_submitted"
  | "assigned"
  | "completed"
  | "rated";

/** 성과 산식 기본 min_n — 이 미만이면 별점 수치 숨김·AI 코멘트 비활성(D26 소표본 위장 금지). */
export const VENDOR_PERF_MIN_N = 5;

/** 별점 정정 창(시간) — append-only이되 본인 24h 정정(오터치·업체 혼동 영구 박제 방지, D26). */
export const VENDOR_RATING_AMEND_WINDOW_HOURS = 24;

/**
 * 업체 프로필 (M-VEND-00 목록 · M-VEND-01 상세 · M-VEND-03 편집).
 * 주소록 본체 = 완료 수리 자동 누적 read(D22). 연락처·주소는 관리인 전용(임차인 비노출).
 */
export interface VendorProfile {
  id: string; // vendor_id — 고유·중복 탐지 대상
  name: string;
  trades: VendorTrade[]; // 담당 분야(다중)
  status: VendorStatus;
  source: VendorRegistrationSource; // 자동 누적 / 수동
  /** 거래(완료) 건수 — 목록 핵심 지표(별점 대신). */
  dealCount: number;
  /** 최근 사용일 ISO — 목록 정렬(최근 사용) 기준. 미사용이면 undefined. */
  lastUsedAt?: string;
  /** 신규 배지 — 동일 행 높이 + '신규'(별도 격리 섹션 폐기·순환 노출). */
  isNew: boolean;
  // 연락처 — 관리인 전용·임차인 비노출(개인정보). 자동 누적 초기엔 비어 있을 수 있음.
  phone?: string;
  contactPerson?: string; // 담당자
  address?: string;
  memo?: string;
  /** 중복 병합 시 흡수된 원본 vendor_id(감사). */
  mergedFromId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 거래 이력 단건 (M-VEND-01 이력 · M-VEND-02 완료 이력).
 * ticketId(→M-DASH-04)와 vendorJobId(→V-JOB-00)는 분리(집적 방지). 호실은 마스킹 옵션.
 */
export interface VendorJobRecord {
  id: string;
  vendorId: string;
  ticketId: string; // 관리 티켓 — M-DASH-04 역참조
  vendorJobId: string; // 업체 작업건 — V-JOB-00 역참조(분리)
  completedAt: string; // 완료 일자 ISO
  unitId?: string; // 원본 호실
  /** 호실 마스킹 옵션 — true면 UI에서 '***'로 표기(임대인/외부 공유 차단). */
  unitMasked: boolean;
  quoteAmount?: number; // 견적/비용(원)
  /** 응답 속도(시간) — quote_requested→quote_submitted 간격. 성과 원천. */
  responseHours?: number;
  /** 만족도 유무(rated 이벤트). false면 미평가(커버리지 하락 원천). */
  rated: boolean;
  /** 만족도 점수 1~5 — M-DASH-04 완료 시점 입력(여기는 read). rated=false면 undefined. */
  satisfaction?: number;
  /** 만족도 부여 시각(정정 창 판정 기준). rated=true 시 존재. */
  ratedAt?: string;
}

/**
 * 성과 auto-append 이벤트 (지표 원천 로그). 이벤트별 사용 필드:
 *  quote_requested → at (응답 속도 시작) · ticketId
 *  vendor_viewed   → at
 *  quote_submitted → at · responseHours · quoteAmount
 *  assigned        → at · jobId · ticketId
 *  completed       → at · jobId
 *  rated           → at · jobId · satisfaction (M-DASH-04 소유)
 */
export interface VendorPerfEvent {
  id: string;
  vendorId: string;
  type: VendorPerfEventType;
  at: string; // 이벤트 시각 ISO
  ticketId?: string;
  jobId?: string; // vendorJobId
  responseHours?: number; // quote_submitted
  quoteAmount?: number; // quote_submitted
  satisfaction?: number; // rated
}

/**
 * AI 성과 코멘트 (M-VEND-02) — min_n 이상에서만 활성.
 * 건별 근거 ID 요약만('참고용' 라벨만으론 편향 못 막음 — 근거 고정).
 */
export interface VendorAiComment {
  summary: string; // 건별 근거 기반 요약
  basisJobIds: string[]; // 근거가 된 거래건(vendorJobId) — 추적 가능
  label: "참고용";
}

/**
 * 성과 집계 (M-VEND-02, read-only 단일 API vendor_perf).
 * 입력 없음 — 만족도는 M-DASH-04 완료 시점 소유. 여기는 4지표+커버리지+가드만.
 * D26: 표본·커버리지 미달 시 별점 수치/평균/ AI 를 정직하게 숨긴다.
 */
export interface VendorPerf {
  vendorId: string;
  /** 총 표본(n=) — 별점 판정 표본(평가된 거래 수 기준). */
  sampleN: number;
  /** min_n 임계(기본 VENDOR_PERF_MIN_N). */
  minN: number;
  // 커버리지 — rated_n / completed_n
  completedCount: number; // 완료 건수(4지표 중 하나)
  ratedCount: number; // 평가된 건수
  coverageRatio: number; // ratedCount / completedCount (0~1)
  /** 커버리지 낮음 → 평균 '참고 불가'(만족도 평균 숨김 근거). */
  coverageLow: boolean;
  // 4지표 — min_n/커버리지 미달 시 undefined(숨김)
  responseMedianHours?: number; // 응답 속도 중앙값
  quoteVsAvgPct?: number; // 평균 견적 대비 %(M-COST-03 원장 매핑). 100=평균
  satisfactionAvg?: number; // 만족도 평균 — min_n 미만·커버리지 낮으면 undefined
  /**
   * 별점 노출 가드(D26) — min_n 이상 + 복수 맥락 충족 시에만 true.
   * false면 별점 수치 전부 숨기고 '거래 N건'만 표기.
   */
  ratingVisible: boolean;
  /** AI 코멘트 활성 여부 — min_n 이상에서만 true. */
  aiCommentEnabled: boolean;
  aiComment?: VendorAiComment; // aiCommentEnabled=true일 때만
  /** 업체 미러 안내(D26) — "이 업체는 V-JOB에서 본인 성과를 보고 이의할 수 있어요". */
  mirrorNotice: string;
  updatedAt: string;
}

/**
 * 중복 탐지 후보 (M-VEND-03) — 같은 연락처/이름 → 병합 제안.
 * vendor_id 고유 보장·집적 방지.
 */
export interface VendorDuplicateCandidate {
  vendorId: string;
  name: string;
  reason: "same_phone" | "same_name";
}
