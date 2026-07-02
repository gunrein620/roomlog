// 비용·영수증 도메인 공유 모델 (관리인 비용 표면 M-COST · web·api 공용)
// 근거: roomlog_screens_cost.md — 비용=지출(≠청구=수입), 부산물 입력(강요 X), OCR 경량 검토.
// 원칙:
//  - D22 부산물·경량: 입력 메인=결제·정산 첨부, 업로드=보조. 자동통과+미검증 확정 허용.
//  - D23 공개 비대칭 금지: 관리비 opt-out(기본 공개)·'숨김 N건' 고지·append-only.
//  - 상태머신: draft(집계제외) → confirmed(리포트/기록 반영) → amended(append-only 새버전) / void(집계차감·감사로그).
//    집계(M-HOME-02·M-DOC-03)는 confirmed만 포함. 삭제는 hard-delete 아닌 void.

/** 비용 유형 (D-table 2) — 수리비 / 관리비 / 청소·공용설비(공용) / 기타 */
export type CostType = "repair" | "maintenance" | "common" | "other";

/** 비용 상태머신 — 소급 집계 정합(codex P0). void=집계 차감, amended=append-only 새 버전. */
export type CostStatus = "draft" | "confirmed" | "amended" | "void";

/** 귀속 범위 — 호실(M-DOC-03) / 건물 기록(공용비는 호실 아님) */
export type CostAttributionScope = "unit" | "building";

/** 관리비 공개 상태 — opt-out 기본 public (D23). 관리비 외 유형에는 부여하지 않는다. */
export type DisclosureState = "public" | "private";

/** 수리비 2상태 — 이미 지불(기록만) / 미지불(→M-DASH-05 결제 승인). 수리비에만 부여. */
export type RepairPaymentState = "already_paid" | "unpaid";

/**
 * 검토 큐 사유 (D-table 1) — 사유별 분리로 '거짓 표면' 방지.
 * 미검증 확정은 큐 사유가 아니라 정직한 꼬리표(Cost.verified=false)로 표현한다.
 */
export type CostReviewReason =
  | "ocr_low_confidence" // OCR 저신뢰 — 필드 인식 불확실 → M-COST-02 해당 필드
  | "classification_unclear" // 분류 불확실 — 유형 미정 → M-COST-02 유형 선택
  | "unit_unmatched"; // 호실 미매칭 — 관련 호실 불명 → M-COST-02/03 귀속

/** 영수증 소스 — 촬영(폰)/파일/온라인/수동(증빙 없음 구분). */
export type ReceiptSource = "camera" | "file" | "online" | "manual";

/**
 * 비용 원장 단건 (M-COST-03). 지출 레코드 — 청구(M-BILL, 수입)와 별개.
 * confirmed만 리포트/기록 집계에 반영. 정정은 supersedesId로 append-only 연결.
 */
export interface Cost {
  id: string;
  date: string; // 발생일(영수증 일자) ISO
  item: string; // 항목명 (예: "배수관 보수")
  amount: number; // 원
  type: CostType;
  scope: CostAttributionScope;
  unitId?: string; // scope=unit 일 때 호실
  status: CostStatus;
  /**
   * OCR 미검증 상태로 확정 허용(D22). false면 '미검증 라벨' 꼬리표 — 나중 보정 가능.
   * 완벽검증 강박 해제: 미검증 확정도 confirmed 집계에 포함되되 정직하게 표기.
   */
  verified: boolean;
  /** 검토 큐 사유(미해결 시). confirmed 이후엔 보통 없음. */
  reviewReason?: CostReviewReason;
  /** 관리비 공개 상태(opt-out 기본 public). type=maintenance 외에는 undefined. */
  disclosure?: DisclosureState;
  /** 수리비 지불 상태. type=repair 외에는 undefined. */
  repairPayment?: RepairPaymentState;
  /** 연결된 결제건(M-DASH-05) — 수리비 미지불 흐름 시. */
  paymentRef?: string;
  /** 원본 영수증(있으면). 없으면 증빙 없음(수동 입력) 원장. */
  receiptId?: string;
  /** append-only 정정 — 이 레코드가 대체한 이전 버전 id. */
  supersedesId?: string;
  /** 무효 사유(status=void 시). hard-delete 금지·소급 재계산·감사로그. */
  voidReason?: string;
  createdAt: string;
  updatedAt: string;
}

/** OCR 추출 필드 — 신뢰도 동반(자동통과 판정). needsReview=true면 '확인 필요'. */
export interface OcrField<T = string> {
  value: T;
  confidence: number; // 0~1
  needsReview: boolean; // 저신뢰 → M-COST-02에서 펼쳐 손댐(자동통과 반대)
}

/** 다중 항목 분할 후보 (1영수증 → N비용). 기본은 미분할 1건 뭉뚱그리기. */
export interface ReceiptLineItem {
  label: string;
  amount: number;
  suggestedType?: CostType;
}

/** 영수증(원본). 증빙 없음(수동)·중복 검사 구분. */
export interface Receipt {
  id: string;
  source: ReceiptSource;
  imageUrl?: string;
  /** 증빙 있음 여부 — false=수동 입력(OCR 미경유) 원장 구분. */
  hasEvidence: boolean;
  uploadedAt: string;
  /** 중복 영수증 경고(같은 이미지/금액·날짜 재업로드) — 원본 id. */
  duplicateOfId?: string;
}

/** OCR 경량 검토 결과 (M-COST-02). 신뢰 필드 자동통과, 저신뢰만 손댐. */
export interface ReceiptOcr {
  id: string;
  receiptId: string;
  costId?: string; // 확정 시 생성된 비용 레코드
  fields: {
    item: OcrField;
    date: OcrField;
    amount: OcrField<number>;
    unitId?: OcrField;
  };
  /** AI 제안 유형(불확실 시 선택). */
  suggestedType?: CostType;
  typeConfidence?: number;
  /** 다중 항목 분할 후보 (기본=단일 1건). */
  lineItems: ReceiptLineItem[];
  createdAt: string;
}

/**
 * 검토 큐 요약 (M-COST-00) — 사유별 분리(D-table 1).
 * 죄책감 톤 지양: 미검증 누적은 정상임을 표기(unverifiedConfirmed).
 */
export interface CostReviewQueueSummary {
  ocrLowConfidence: number; // OCR 저신뢰
  classificationUnclear: number; // 분류 불확실
  unitUnmatched: number; // 호실 미매칭
  unverifiedConfirmed: number; // 미검증으로 확정된 누적(정상 — 나중 보정 가능)
  total: number; // 검토 대기(미확정) 합 = 앞 3개 합
}

/** 이번 달 지출 합계 (M-COST-00) — confirmed만·void 차감. 차트는 M-HOME-02 위임. */
export interface MonthlyCostSummary {
  month: string; // YYYY-MM
  totalAmount: number;
  byType: Record<CostType, number>;
  confirmedCount: number;
}

/** 관리비 공개 항목 (M-COST-04). private면 privateReason 필수. */
export interface DisclosureEntry {
  costId: string;
  item: string;
  amount: number;
  disclosure: DisclosureState;
  privateReason?: string; // disclosure=private 시 사유
}

/**
 * 관리비 공개 설정 (M-COST-04) — opt-out 예외 관리.
 * 비대칭 금지(D23): 비공개가 있어도 hiddenCount로 '숨김 N건' 사실은 노출. append-only.
 */
export interface DisclosureSetting {
  month: string; // YYYY-MM
  scope: CostAttributionScope; // 공개 범위 건물/호실
  unitId?: string;
  entries: DisclosureEntry[];
  /** 임차인 고지용 — '비공개 N건 존재'(비대칭 금지). entries의 private 수와 일치. */
  hiddenCount: number;
  updatedAt: string;
}
