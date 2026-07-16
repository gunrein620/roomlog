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

export type BillLineItemKind = "rent" | "maintenance" | "other";

export type BillLineItemStatus = "unpaid" | "partial" | "paid";

/** 청구 항목 한 줄 */
export interface BillLineItem {
  label: string;
  kind?: BillLineItemKind;
  amount: number; // 원
  paidAmount?: number;
  status?: BillLineItemStatus;
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
  roomId?: string;
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

export interface BillPaymentOrder {
  billId: string;
  orderId: string;
  orderName: string;
  amount: number;
  itemKinds: BillLineItemKind[];
  customerKey: string;
  clientKey?: string;
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

/** 관리인 청구 상세 — 청구 원본과 현재 독촉 가드를 한 응답으로 고정한다. */
export interface ManagerBillDetail extends Bill {
  guard: DunningGuard;
}

/** 청구 목록 행(관리인 뷰) — 대시보드/연체 표에 임차인명 포함. Bill의 표시용 파생. */
export interface ManagerBillRow {
  billId: string;
  roomId?: string;
  buildingName?: string;
  unitId: string;
  tenantName: string;
  billingMonth: string;
  totalAmount: number;
  paidAmount: number; // 확정 수납액(확인중·orphan 제외)
  unpaidAmount?: number;
  daysOverdue?: number;
  status: BillStatus;
  dueDate: string;
  badge?: PaymentBadge; // 임차인 배지 매핑(참고용)
  guard?: DunningGuard;
}

export interface ManagerBillingScopeOption {
  buildingName: string;
  address: string;
  roomCount: number;
}

export interface ManagerBillingScope {
  buildings: ManagerBillingScopeOption[];
  selectedBuilding?: string;
}

export interface ManagerBillingDashboardSummary {
  billedAmount: number;
  collectedAmount: number;
  unpaidAmount: number;
  collectionRate: number;
  overdueUnits: number;
  confirmNeeded: number;
}

export interface ManagerBillingRecentDeposit extends Deposit {
  buildingName?: string;
  unitId?: string;
  needsBuildingReview: boolean;
}

export interface ManagerBillingDashboardData {
  scope: ManagerBillingScope;
  billingMonth: string;
  summary: ManagerBillingDashboardSummary;
  recentDeposits: ManagerBillingRecentDeposit[];
  overduePreview: OverdueCase[];
  bills: ManagerBillRow[];
}

export interface ManagerCollectionBrief {
  billedAmount: number;
  collectedAmount: number;
  unpaidAmount: number;
  collectionRate: number;
  billedUnits: number;
  fullyPaidUnits: number;
  partiallyPaidUnits: number;
  threeMonthAverageRate: number;
  sixMonthAverageRate: number;
  previousCollectionRate?: number;
  rateDelta?: number;
  confirmingAmount: number;
}

export interface ManagerCollectionPoint {
  billingMonth: string;
  billedAmount: number;
  collectedAmount: number;
  unpaidAmount: number;
  collectionRate: number;
  billedUnits: number;
  fullyPaidUnits: number;
  partiallyPaidUnits: number;
}

export interface ManagerCollectionHistoryRange {
  availableFromMonth: string;
  availableToMonth: string;
  appliedFromMonth: string;
  appliedToMonth: string;
}

export interface ManagerCollectionTimingPoint {
  day: number;
  currentCumulativeAmount: number;
  previousCumulativeAmount: number;
}

export interface ManagerCollectionTiming {
  currentMonth: string;
  previousMonth: string;
  onTimeCollectionRate: number;
  averageCollectionDay?: number;
  points: ManagerCollectionTimingPoint[];
}

export interface ManagerCollectionBuildingRow extends ManagerCollectionPoint {
  buildingName: string;
  address: string;
  roomCount: number;
  previousCollectionRate?: number;
  rateDelta?: number;
  bills: ManagerBillRow[];
}

export interface ManagerCollectionAnalytics {
  scope: ManagerBillingScope;
  billingMonth: string;
  brief: ManagerCollectionBrief;
  trend: ManagerCollectionPoint[];
  history: ManagerCollectionHistoryRange;
  timing: ManagerCollectionTiming;
  buildings: ManagerCollectionBuildingRow[];
}

export type ManagerTransactionDirection = "deposit" | "withdrawal";
export type ManagerTransactionLedgerSource = "database" | "demo";

export interface ManagerTransactionLedgerBill {
  buildingName?: string;
  unitId: string;
  tenantName: string;
  billingMonth: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  status: BillStatus;
  items: BillLineItem[];
}

export interface ManagerTransactionLedgerCost {
  type: "repair" | "maintenance" | "common" | "other";
  scope: "unit" | "building";
  verified: boolean;
  evidenceAvailable: boolean;
  status: "confirmed" | "amended";
}

export interface ManagerTransactionLedgerRow {
  id: string;
  direction: ManagerTransactionDirection;
  occurredAt: string;
  amount: number;
  statusLabel: string;
  buildingName?: string;
  unitId?: string;
  candidateUnitId?: string;
  partyName?: string;
  itemLabel: string;
  depositorName?: string;
  linkedBillRelation?: "matched" | "candidate";
  linkedBill?: ManagerTransactionLedgerBill;
  cost?: ManagerTransactionLedgerCost;
}

export interface ManagerTransactionLedgerData {
  source: ManagerTransactionLedgerSource;
  rows: ManagerTransactionLedgerRow[];
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
  roomId?: string;
  buildingName?: string;
  unitId: string;
  tenantName: string;
  billingMonth?: string;
  totalAmount?: number;
  paidAmount?: number;
  unpaidAmount: number; // 미납 잔액(총액 − 확정수납액)
  daysOverdue: number; // 연체일 = 원 납부기한 기준
  stage: OverdueStage; // 관리인 전용 라벨
  dueDate: string;
  guard: DunningGuard; // blocked면 자동 제외
}

export interface ManagerOverdueWorkspace {
  scope: ManagerBillingScope;
  asOf: string;
  summary: {
    activeUnpaidAmount: number;
    activeCount: number;
    severeCount: number;
    waitingCount: number;
  };
  activeCases: OverdueCase[];
  waitingCases: OverdueCase[];
}

export interface ManagerBillCreationOption {
  roomId: string;
  buildingName: string;
  unitId: string;
  tenantName: string;
  contractId: string;
  monthlyRent: number;
  maintenanceFee: number;
  dueDate: string;
  duplicateBillId?: string;
}

export type ManagerBillCreationUnavailableReason =
  | "NO_CONTRACT"
  | "CONTRACT_NOT_ACTIVE"
  | "CONTRACT_NOT_CONFIRMED"
  | "CONTRACT_VALUES_NOT_CONFIRMED"
  | "MONTHLY_RENT_MISSING"
  | "MAINTENANCE_FEE_MISSING"
  | "BILL_AMOUNT_INVALID"
  | "PAYMENT_DAY_MISSING"
  | "PAYMENT_DAY_INVALID";

export interface ManagerBillCreationUnavailableOption {
  roomId: string;
  buildingName: string;
  unitId: string;
  tenantName: string;
  contractId?: string;
  reasons: ManagerBillCreationUnavailableReason[];
}

export interface ManagerBillCreationData {
  scope: ManagerBillingScope;
  billingMonth: string;
  account: PaymentAccount;
  options: ManagerBillCreationOption[];
  unavailableOptions: ManagerBillCreationUnavailableOption[];
  readOnly?: boolean;
}

export interface CreateManagerBillRowInput {
  roomId: string;
  contractId: string;
  monthlyRent: number;
  maintenanceFee: number;
  dueDate: string;
}

export interface CreateManagerBillsInput {
  buildingName: string;
  billingMonth: string;
  account: PaymentAccount;
  rows: CreateManagerBillRowInput[];
}

export interface CreateManagerBillsResult {
  createdCount: number;
  billIds: string[];
  billingMonth: string;
  buildingName: string;
}

/**
 * 독촉문 초안 — M-BILL-05. 자동 발송 금지: AI 초안 → 관리인 수정·승인 후 발송.
 * guard.blocked면 발송 차단(확인중·orphan 존재 → M-BILL-03 확인 유도).
 */
export interface DunningDraft {
  billId: string;
  buildingName?: string;
  unitId: string;
  tenantName: string;
  billingMonth?: string;
  unpaidAmount: number;
  dueDate?: string;
  daysOverdue?: number;
  draftText: string; // AI 초안(편집 대상)
  channel: string; // 발송 채널(단일)
  guard: DunningGuard; // blocked면 발송 차단
}

export type TenantPaymentPeriodPreset = 1 | 3 | 6;

export interface TenantBillSummary {
  bill: Bill;
  payableFrom: string;
  isUpcoming: boolean;
  canPay: boolean;
  remainingAmount: number;
}

export interface TenantBillingOverview {
  current: TenantBillSummary | null;
  upcoming: TenantBillSummary | null;
  previousUnpaid: TenantBillSummary[];
  asOf: string;
}

export type TenantPaymentHistoryEventType = "toss" | "deposit" | "report" | "bill_due";
export type TenantPaymentHistoryEventStatus = "confirmed" | "confirming" | "due";

export interface TenantPaymentHistoryEvent {
  id: string;
  type: TenantPaymentHistoryEventType;
  activityDate: string;
  amount: number;
  status: TenantPaymentHistoryEventStatus;
  receiptAvailable: boolean;
}

export interface TenantPaymentHistoryRecord {
  billId: string;
  billingMonth: string;
  activityDate: string;
  status: BillStatus;
  totalAmount: number;
  paidAmount: number;
  payments: TenantPaymentHistoryEvent[];
}

export interface TenantPaymentHistory {
  range: { from: string; to: string };
  bounds: { min: string; max: string; maxDays: 366 };
  records: TenantPaymentHistoryRecord[];
}

function seoulDateParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return { year: value("year"), month: value("month"), day: value("day") };
}

export function billingMonthInSeoul(now: Date = new Date()): string {
  const { year, month } = seoulDateParts(now);
  return `${year}-${month}`;
}

export function billingDateInSeoul(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("date must be ISO-compatible");
  const { year, month, day } = seoulDateParts(date);
  return `${year}-${month}-${day}`;
}

export function billingTodayInSeoul(now: Date = new Date()): string {
  return billingDateInSeoul(now);
}

export function billPayableFrom(dueDate: string): string {
  const dueDay = billingDateInSeoul(dueDate);
  const [year, month, day] = dueDay.split("-").map(Number);
  const targetMonth = new Date(Date.UTC(year, month - 2, 1));
  const targetYear = targetMonth.getUTCFullYear();
  const targetMonthIndex = targetMonth.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  const date = `${targetYear}-${String(targetMonthIndex + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
  return `${date}T00:00:00+09:00`;
}

export function isBillPaymentOpen(dueDate: string, now: Date = new Date()): boolean {
  return now.getTime() >= new Date(billPayableFrom(dueDate)).getTime();
}

export function paymentHistoryPresetRange(
  preset: TenantPaymentPeriodPreset,
  now: Date = new Date(),
) {
  const today = billingTodayInSeoul(now);
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  const start = new Date(Date.UTC(year, month - preset, 1));
  const from = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return { from, to: today };
}

export function paymentHistoryInclusiveDays(from: string, to: string): number {
  const pattern = /^\d{4}-\d{2}-\d{2}$/u;
  if (!pattern.test(from) || !pattern.test(to)) throw new Error("range must use YYYY-MM-DD");
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("range is invalid");
  const validFrom = new Date(start).toISOString().slice(0, 10) === from;
  const validTo = new Date(end).toISOString().slice(0, 10) === to;
  if (!validFrom || !validTo || start > end) {
    throw new Error("range is invalid");
  }
  return Math.floor((end - start) / 86_400_000) + 1;
}
