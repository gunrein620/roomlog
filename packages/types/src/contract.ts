// 계약 도메인 공유 모델 (임차인 T-DOC 계약서 · 관리인 M-DOC가 공유하는 단일 레코드)
// 근거: roomlog_screens_contract.md — 양방향 등록·단일 레코드·확정자=관리자.
// 원칙: '확정'은 M-DOC-01 경유에만(정직 표기). AI 추출 불확실 = 확인 필요(확정 금지).
// 상태는 다차원(생애주기 × 검토 × 보관 — 동시 성립). 임차인 배지는 우선순위 1개 노출.

/** 생애주기 차원 — 검토·보관과 별개(동시 성립) */
export type ContractLifecycle =
  | "unregistered" // 미등록 (호실만)
  | "analyzing" // 분석 중 (업로드 직후 OCR)
  | "active" // 계약 유효
  | "expiring_soon" // 만료 예정 (D-n)
  | "expired"; // 만료

/** 검토 차원 — 확정자=관리자. 확정 전은 '검토 전 참고본'(정직 표기) */
export type ContractReview =
  | "pending" // 검토 대기 (검토 전 참고본)
  | "info_requested" // 보완 요청 (재촬영·누락)
  | "confirmed"; // 확정됨 (M-DOC-01 경유에만)

/** 보관/삭제 차원 — 삭제는 3상태(거짓 안전장치 금지, v2 P0) */
export type DeletionState =
  | "none" // 요청 없음
  | "requested" // 삭제 요청 접수 (SLA 대기)
  | "completed" // 삭제 완료
  | "limited" // 제한 보관 (보관 예외 — 항목·사유)
  | "denied"; // 삭제 불가 (법정 보관)

/** 계약값 출처 3티어 (D15): 확정 > 관리자 수동 > 미확인 */
export type ContractValueSource = "confirmed" | "manual" | "unverified";

/** OCR 추출 항목 그룹 — 돈/기간/책임 3그룹 접기 */
export type ExtractionGroup = "money" | "term" | "responsibility";

/** 양면 단일 레코드 — 임차인(T-DOC) / 관리인(M-DOC) 공유. 홈 요약은 마스킹 */
export interface Contract {
  id: string;
  unitId: string; // 호실
  landlordName: string; // 임대인명
  // 다차원 상태 (동시 성립 — 배지는 우선순위 1개)
  lifecycle: ContractLifecycle;
  review: ContractReview;
  deletion: DeletionState;
  valueSource: ContractValueSource; // 3티어 출처
  // 핵심 요약 3줄 (홈 · 마스킹 대상)
  monthlyRent?: number; // 월세 (원)
  maintenanceFee?: number; // 관리비 (원)
  paymentDay?: number; // 납부일 (매월 n일)
  optionInventory?: string[]; // 호실 옵션 인벤토리(M-DOC-03)
  // 기간 (만료 D-day 계산)
  startDate?: string; // ISO
  endDate?: string; // ISO
  createdAt: string;
  updatedAt: string;
  extractionId?: string;
}

/** 추출 항목 하나 — 값·확인필요·근거(원문 하이라이트). 민감정보 기본 마스킹 */
export interface ExtractionItem {
  label: string; // 예: "보증금"
  value: string; // 표시값 (마스킹 시 가림)
  group: ExtractionGroup;
  needsCheck: boolean; // 확인 필요 (OCR 불확실)
  evidence?: string; // 근거 보기 — 원문 발췌
  masked?: boolean; // 민감정보 기본 마스킹(상세주소·계좌·연락처)
}

/** 비적대 프레임 조항 안내 (T-DOC-03 참고 · 확정/책임 판단 아님) */
export interface ContractHelpNote {
  clause: string; // 특약·원상복구·청소비·자동연장 등
  plain: string; // 쉬운 설명 (중립 톤)
  source?: string; // 원문 발췌
}

/** 계약서 OCR 추출 — 확정 전 참고본. 확정은 관리자(M-DOC-01) */
export interface ContractExtraction {
  id: string;
  contractId: string;
  confirmed: boolean; // 관리자 확정 여부 (정직 표기)
  highlights: string[]; // "확인하면 좋을 3가지" 요약 (과밀 방지)
  clauseSummary?: string; // 대시보드용 특약성 조항 한 줄 요약
  items: ExtractionItem[]; // 10항목 (3그룹)
  helpNotes: ContractHelpNote[]; // 알아두면 좋은 조항 (T-DOC-03)
  createdAt: string;
}

/** 보관 항목 — 무엇이·왜·언제까지 남는지 (정직 고지, T-DOC-04) */
export interface RetentionItem {
  label: string; // 보관 항목
  reason: string; // 보관 사유 (정산·분쟁 예외 등)
  until: string; // 보관 기한 표기
}

/** 개인정보·마스킹·보관·삭제 (T-DOC-04 ↔ M-DOC-05) */
export interface ContractPrivacy {
  contractId: string;
  maskingEnabled: boolean; // 상세주소·계좌·연락처 마스킹
  retention: RetentionItem[]; // 보관 항목·기간·사유
  forwardingConsent: boolean; // 업체 전달 동의 현황 (전달 시점 분리 동의)
  deletion: DeletionState; // 삭제 3상태
  deletionSlaHours?: number; // 삭제 처리 SLA (무응답 출구)
  deletable: boolean; // 계약 종료 후에만 삭제 요청 활성
}
