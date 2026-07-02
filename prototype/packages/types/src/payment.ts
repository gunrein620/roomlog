// 납부·청구 도메인 공유 모델 (임차인 납부 T-PAY · 관리인 청구 M-BILL이 공유하는 단일 도메인)
// 근거: roomlog_screens_payment.md — 청구 상태머신 ↔ 임차인 배지 매핑(D1) + 신뢰 루프
// 원칙: 자동 발송 금지 · 확인 전 집계 제외(자기신고 ≠ 실제입금 ≠ orphan) · 연체 존엄(단계 라벨 임차인 비노출)

/** 청구(관리인) 상태머신 enum — 수납/연체 트랙. 임차인엔 배지로 매핑(D1). */
export type BillStatus =
  | "draft" // 작성 (임차인 미표시)
  | "sent" // 발송완료 → 수납대기 (임차인: 납부예정)
  | "confirming" // 납부 신고 수신(확인 중) — 수금 집계 제외
  | "partially_paid" // 일부 납부 (잔액 = 총액 − 확정수납액)
  | "paid" // 납부완료
  | "overdue" // 연체 (확인중·orphan 없을 때만 진입)
  | "corrected" // 정정됨
  | "canceled"; // 취소됨

/** 임차인 표시 배지 — 상태머신을 단순 배지로 매핑(연체 존엄: 관리인 단계 라벨 비노출) */
export type PaymentBadge =
  | "none" // 미표시 (작성·발송대기)
  | "due" // 납부예정
  | "confirming" // 확인 중 (집계 제외)
  | "partial" // 일부 납부
  | "paid" // 완료 (+영수증)
  | "overdue"; // 연체 (해결지향)

/** 납부 신고(자기신고) 처리 상태 — 실제 입금 확정과 별개 */
export type PaymentReportStatus =
  | "confirming" // 접수·확인 중(ETA)
  | "matched" // 실제 입금 매칭 확정
  | "mismatch"; // 불일치 → 확인 요청

/** 청구 항목 한 줄 */
export interface BillLineItem {
  label: string;
  amount: number; // 원
}

/** 입금 계좌 안내 (복사 대상) */
export interface PaymentAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string; // 예금주
}

/** 청구서 — 한 호실·한 달의 청구. 관리인 M-BILL 발송 → 임차인 T-PAY 표시. */
export interface Bill {
  id: string;
  unitId: string; // 호실
  billingMonth: string; // 청구월 YYYY-MM
  status: BillStatus;
  items: BillLineItem[]; // 항목 분해
  totalAmount: number; // 합계(원)
  paidAmount: number; // 확정 수납액 (확인 전 신고·orphan 제외)
  dueDate: string; // 납부 기한 ISO
  account: PaymentAccount; // 계좌 안내
  correctionHistory?: string[]; // 정정 이력(있으면)
  maintenanceFeeId?: string; // 관리비 사용 내역(관리자 입력 시에만 연결)
  depositConfirmationRequested?: boolean; // 관리인 '입금 확인 요청' 수신 → 00 응답 배너(별개 슬롯)
  createdAt: string;
  updatedAt: string;
}

/** 납부 신고(자기신고) — T-PAY-02. 확정 입금이 아니라 '확인 중' 큐로 유입. */
export interface PaymentReport {
  id: string;
  billId: string;
  unitId: string;
  amount: number; // 신고 금액(일부 납부 가능)
  depositorName?: string; // 입금자명(본인과 다르면 기입 — orphan 매칭 보조)
  status: PaymentReportStatus;
  etaHours: number; // 확인 중 ETA(시간)
  reportedAt: string;
}

/** 관리비 사용 내역 항목 — 항목별 투명 공개 */
export interface MaintenanceFeeItem {
  label: string;
  amount: number; // 원
  receiptAvailable: boolean; // 영수증 유무
}

/** 관리비 사용 내역 — T-PAY-04. available=false면 00에서 진입 비활성. */
export interface MaintenanceFee {
  id: string;
  unitId: string;
  billingMonth: string;
  items: MaintenanceFeeItem[];
  totalAmount: number;
  available: boolean; // 관리자 미입력 시 false
}

// ───────────────────────────────────────────────────────────────────────────
// 관리인 뷰(M-BILL) — 데스크탑 청구·수금·연체 표면
// 원칙: 연체 단계 라벨은 관리인 triage 전용(임차인 비노출) · 확인중·orphan 집계 제외
//       · 독촉/자동연체 전역 가드('낸 사람이 독촉당하지 않는다') · 자동 발송 금지
// ───────────────────────────────────────────────────────────────────────────

/** 실제 입금(은행/CSV) 매칭 상태 — 자기신고(PaymentReport)와 별개 트랙 */
export type DepositMatchStatus =
  | "unmatched" // 아직 청구서에 미연결(실제 입금 매칭 후보)
  | "matched" // 청구서에 매칭 확정
  | "orphan" // 입금자명 불일치 + 어느 청구에도 미연결(부모 송금 등) — 전역 가드 트리거
  | "mismatch"; // 연결 후보 있으나 입금자명/금액 불일치 → 확인 요청

/** 실제 입금 한 건 — M-BILL-03 매칭·orphan 큐. 확정 전엔 수금 집계 제외. */
export interface Deposit {
  id: string;
  depositorName: string; // 입금자명(은행 표기)
  amount: number; // 입금액(원)
  depositedAt: string; // 입금 일시 ISO
  matchStatus: DepositMatchStatus;
  matchedBillId?: string; // matched/mismatch일 때 연결된 청구 id
  guessedUnitId?: string; // orphan 추정 호실(수동 연결 보조)
}

/** 연체 단계 — 관리인 triage 전용 라벨. 임차인에는 절대 비노출(연체 존엄). */
export type OverdueStage =
  | "minor" // 경미
  | "warning" // 주의
  | "severe"; // 심각

/**
 * 독촉/자동연체 전역 가드 — 확인중 또는 미해소 orphan 존재 시 보류.
 * '낸 사람 독촉 차단'. blocked면 자동연체·독촉 배치에서 제외.
 */
export interface DunningGuard {
  blocked: boolean; // true면 자동연체·독촉 배치 보류
  hasConfirming: boolean; // 연결된 확인중(자기신고/매칭 미해소) 존재(per-건 가드 A4)
  hasOrphan: boolean; // 해당 호실/기간 미해소 orphan 입금 존재(전역 가드 A5)
}

/** 청구 목록 행(관리인 뷰) — 대시보드/연체 표에 임차인명 포함. Bill의 표시용 파생. */
export interface ManagerBillRow {
  billId: string;
  unitId: string;
  tenantName: string;
  billingMonth: string;
  totalAmount: number;
  paidAmount: number; // 확정 수납액(확인중·orphan 제외)
  status: BillStatus;
  dueDate: string;
  badge?: PaymentBadge; // 임차인 배지 매핑(참고용)
}

/** 청구 관리 대시보드 요약 — M-BILL-00 헤더 카운트 */
export interface BillDashboardSummary {
  total: number;
  confirmNeeded: number; // 확인 필요(불일치·orphan·신고 대기)
  pending: number; // 대기(발송완료·수납대기)
  overdue: number; // 연체(가드 통과분만)
}

/**
 * 수금 현황 요약 — M-BILL-02 재무.
 * 확인중·orphan 금액은 '확정 수납'에서 제외하고 별도 표기(신뢰 루프).
 */
export interface CollectionSummary {
  billingMonth: string;
  collectionRate: number; // 수금률 0..1 (확정 기준)
  collectedAmount: number; // 확정 수납액
  unpaidAmount: number; // 미납액(확인중·orphan 제외)
  vacancyLoss: number; // 공실 손실
  confirmingAmount: number; // 확인 중(집계 제외·별도 표기)
  orphanAmount: number; // orphan 입금(집계 제외·별도 표기)
  recentDeposits: Deposit[]; // 최근 입금
}

/**
 * 연체 세대 한 건 — M-BILL-04.
 * guard.blocked면 연체 목록에서 자동 제외하고 '확인 대기'로 별도 표시.
 */
export interface OverdueCase {
  billId: string;
  unitId: string;
  tenantName: string;
  unpaidAmount: number; // 미납 잔액(총액 − 확정수납액)
  daysOverdue: number; // 연체일 = 원 납부기한 기준
  stage: OverdueStage; // 관리인 전용 라벨
  dueDate: string;
  guard: DunningGuard; // blocked면 자동 제외
}

/**
 * 독촉문 초안 — M-BILL-05. 자동 발송 금지: AI 초안 → 관리인 수정·승인 후 발송.
 * guard.blocked면 발송 차단(확인중·orphan 존재 → M-BILL-03 확인 유도).
 */
export interface DunningDraft {
  billId: string;
  unitId: string;
  tenantName: string;
  unpaidAmount: number;
  draftText: string; // AI 초안(편집 대상)
  channel: string; // 발송 채널(단일)
  guard: DunningGuard; // blocked면 발송 차단
}
