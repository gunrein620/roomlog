import type {
  Bill,
  BillLineItem,
  BillLineItemKind,
  BillLineItemStatus,
  BillStatus,
  PaymentAccount,
  PaymentReport,
  PaymentReportStatus,
  TenantBillSummary,
  TenantBillingOverview,
  TenantPaymentHistory,
  TenantPaymentHistoryEvent,
  TenantPaymentHistoryEventStatus,
  TenantPaymentHistoryEventType,
} from "@roomlog/types";

// 팀 백엔드(Prisma/store) 응답 → @roomlog/types 납부 모델 매퍼.
// web은 api 내부 타입을 import하지 않고 계약서 §4의 필요한 필드만 느슨히 타입화한다.

export interface TeamBillLineItem {
  label: string;
  kind?: string;
  amount: number;
  paidAmount?: number;
  status?: string;
}

export interface TeamBill {
  id: string;
  unitId: string;
  billingMonth: string;
  status: string;
  items?: TeamBillLineItem[];
  totalAmount: number;
  paidAmount?: number;
  dueDate: string;
  account?: PaymentAccount;
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
  correctionHistory?: string[];
  maintenanceFeeId?: string;
  depositConfirmationRequested?: boolean;
  createdAt: string;
  updatedAt: string;
  stage?: unknown;
}

export interface TeamReport {
  id: string;
  billId: string;
  unitId: string;
  amount: number;
  depositorName?: string;
  status: string;
  etaHours?: number;
  reportedAt: string;
}

export interface TeamTenantBillSummary {
  bill: TeamBill;
  payableFrom: string;
  isUpcoming: boolean;
  canPay: boolean;
  remainingAmount: number;
}

export interface TeamTenantBillingOverview {
  current: TeamTenantBillSummary | null;
  upcoming: TeamTenantBillSummary | null;
  previousUnpaid: TeamTenantBillSummary[];
  asOf: string;
}

export interface TeamTenantPaymentHistoryEvent {
  id: string;
  type: string;
  activityDate: string;
  amount: number;
  status: string;
  receiptAvailable: boolean;
}

export interface TeamTenantPaymentHistoryRecord {
  billId: string;
  billingMonth: string;
  activityDate: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  payments: TeamTenantPaymentHistoryEvent[];
}

export interface TeamTenantPaymentHistory {
  range: { from: string; to: string };
  bounds: { min: string; max: string; maxDays: number };
  records: TeamTenantPaymentHistoryRecord[];
}

const BILL_STATUS: Record<string, BillStatus> = {
  DRAFT: "draft",
  SENT: "sent",
  CONFIRMING: "confirming",
  PARTIALLY_PAID: "partially_paid",
  PAID: "paid",
  OVERDUE: "overdue",
  CORRECTED: "corrected",
  CANCELED: "canceled",
};

const REPORT_STATUS: Record<string, PaymentReportStatus> = {
  CONFIRMING: "confirming",
  MATCHED: "matched",
  MISMATCH: "mismatch",
};

const ITEM_KIND: Record<string, BillLineItemKind> = {
  RENT: "rent",
  MAINTENANCE: "maintenance",
  OTHER: "other",
};

const ITEM_STATUS: Record<string, BillLineItemStatus> = {
  UNPAID: "unpaid",
  PARTIAL: "partial",
  PAID: "paid",
};

const HISTORY_EVENT_TYPE: Record<string, TenantPaymentHistoryEventType> = {
  TOSS: "toss",
  DEPOSIT: "deposit",
  REPORT: "report",
  BILL_DUE: "bill_due",
};

const HISTORY_EVENT_STATUS: Record<string, TenantPaymentHistoryEventStatus> = {
  CONFIRMED: "confirmed",
  CONFIRMING: "confirming",
  DUE: "due",
};

function normalizeEnum(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeUnitId(unitId: string): string {
  return unitId.replace(/\s*호\s*$/, "");
}

export function mapBillStatus(status: string): BillStatus {
  const mapped = BILL_STATUS[normalizeEnum(status)];
  if (!mapped) console.warn(`[payment-mapping] 미매핑 BillStatus: ${status} → sent`);
  return mapped ?? "sent";
}

export function mapReportStatus(status: string): PaymentReportStatus {
  const mapped = REPORT_STATUS[normalizeEnum(status)];
  if (!mapped) console.warn(`[payment-mapping] 미매핑 PaymentReportStatus: ${status} → confirming`);
  return mapped ?? "confirming";
}

function mapHistoryEventType(type: string): TenantPaymentHistoryEventType {
  const mapped = HISTORY_EVENT_TYPE[normalizeEnum(type)];
  if (!mapped) console.warn(`[payment-mapping] 미매핑 TenantPaymentHistoryEventType: ${type} → report`);
  return mapped ?? "report";
}

function mapHistoryEventStatus(status: string): TenantPaymentHistoryEventStatus {
  const mapped = HISTORY_EVENT_STATUS[normalizeEnum(status)];
  if (!mapped) {
    console.warn(`[payment-mapping] 미매핑 TenantPaymentHistoryEventStatus: ${status} → confirming`);
  }
  return mapped ?? "confirming";
}

function toItems(items: TeamBillLineItem[] | undefined): BillLineItem[] {
  return (items ?? []).map((item, index) => {
    const amount = Math.max(0, Number(item.amount) || 0);
    const paidAmount = Math.min(amount, Math.max(0, Number(item.paidAmount) || 0));
    const inferredKind = inferItemKind(item.label, index);
    const mappedKind = item.kind ? ITEM_KIND[normalizeEnum(item.kind)] : undefined;
    const kind = mappedKind === "other" && inferredKind !== "other"
      ? inferredKind
      : mappedKind ?? inferredKind;
    const status = item.status
      ? ITEM_STATUS[normalizeEnum(item.status)] ?? itemStatus(amount, paidAmount)
      : itemStatus(amount, paidAmount);

    return { label: item.label, kind, amount, paidAmount, status };
  });
}

function inferItemKind(label: string, index: number): BillLineItemKind {
  if (/월세|임대료|rent/i.test(label)) return "rent";
  if (/관리비|maintenance/i.test(label)) return "maintenance";
  return index === 0 ? "rent" : "other";
}

function itemStatus(amount: number, paidAmount: number): BillLineItemStatus {
  if (amount > 0 && paidAmount >= amount) return "paid";
  if (paidAmount > 0) return "partial";
  return "unpaid";
}

function toAccount(bill: TeamBill): PaymentAccount {
  return {
    bankName: bill.account?.bankName ?? bill.bankName ?? "",
    accountNumber: bill.account?.accountNumber ?? bill.accountNumber ?? "",
    accountHolder: bill.account?.accountHolder ?? bill.accountHolder ?? "",
  };
}

export function toBill(bill: TeamBill): Bill {
  const items = toItems(bill.items);
  return {
    id: bill.id,
    unitId: normalizeUnitId(bill.unitId),
    billingMonth: bill.billingMonth,
    status: mapBillStatus(bill.status),
    items,
    totalAmount: bill.totalAmount ?? items.reduce((sum, item) => sum + item.amount, 0),
    paidAmount: bill.paidAmount ?? 0,
    dueDate: bill.dueDate,
    account: toAccount(bill),
    correctionHistory: bill.correctionHistory?.length ? [...bill.correctionHistory] : undefined,
    maintenanceFeeId: bill.maintenanceFeeId,
    depositConfirmationRequested: bill.depositConfirmationRequested,
    createdAt: bill.createdAt,
    updatedAt: bill.updatedAt,
    // 연체 존엄: 백엔드가 stage를 실수로 보내도 Bill에는 절대 매핑하지 않는다.
  };
}

export function toReport(report: TeamReport): PaymentReport {
  return {
    id: report.id,
    billId: report.billId,
    unitId: normalizeUnitId(report.unitId),
    amount: report.amount,
    depositorName: report.depositorName,
    status: mapReportStatus(report.status),
    etaHours: report.etaHours ?? 24,
    reportedAt: report.reportedAt,
  };
}

function toTenantBillSummary(summary: TeamTenantBillSummary): TenantBillSummary {
  return {
    bill: toBill(summary.bill),
    payableFrom: summary.payableFrom,
    isUpcoming: summary.isUpcoming,
    canPay: summary.canPay,
    remainingAmount: summary.remainingAmount,
  };
}

export function toTenantBillingOverview(
  overview: TeamTenantBillingOverview,
): TenantBillingOverview {
  return {
    current: overview.current ? toTenantBillSummary(overview.current) : null,
    upcoming: overview.upcoming ? toTenantBillSummary(overview.upcoming) : null,
    previousUnpaid: overview.previousUnpaid.map(toTenantBillSummary),
    asOf: overview.asOf,
  };
}

function toTenantPaymentHistoryEvent(
  event: TeamTenantPaymentHistoryEvent,
): TenantPaymentHistoryEvent {
  return {
    id: event.id,
    type: mapHistoryEventType(event.type),
    activityDate: event.activityDate,
    amount: event.amount,
    status: mapHistoryEventStatus(event.status),
    receiptAvailable: event.receiptAvailable,
  };
}

export function toTenantPaymentHistory(
  history: TeamTenantPaymentHistory,
): TenantPaymentHistory {
  if (history.bounds.maxDays !== 366) {
    console.warn(
      `[payment-mapping] 미지원 TenantPaymentHistory maxDays: ${history.bounds.maxDays} → 366`,
    );
  }

  return {
    range: { ...history.range },
    bounds: { min: history.bounds.min, max: history.bounds.max, maxDays: 366 },
    records: history.records.map((record) => ({
      billId: record.billId,
      billingMonth: record.billingMonth,
      activityDate: record.activityDate,
      status: mapBillStatus(record.status),
      totalAmount: record.totalAmount,
      paidAmount: record.paidAmount,
      payments: record.payments.map(toTenantPaymentHistoryEvent),
    })),
  };
}
