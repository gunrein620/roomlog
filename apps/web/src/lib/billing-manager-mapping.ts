import type {
  Bill,
  BillDashboardSummary,
  BillStatus,
  CollectionSummary,
  Deposit,
  DepositMatchStatus,
  DunningDraft,
  DunningGuard,
  ManagerBillRow,
  OverdueCase,
  OverdueStage,
  PaymentBadge,
} from "@roomlog/types";

// 팀 백엔드의 매니저 청구 Team* 응답 → @roomlog/types(payment.ts) 매퍼.
// web은 api 내부 타입을 import하지 않고, 계약서의 느슨한 Team* shape만 여기서 선언한다.

export interface TeamBill {
  id: string;
  unitId: string;
  billingMonth: string;
  status: string;
  items?: { label: string; amount: number }[];
  totalAmount: number;
  paidAmount: number;
  dueDate: string;
  account?: {
    bankName?: string;
    accountNumber?: string;
    accountHolder?: string;
  };
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
  correctionHistory?: string[];
  maintenanceFeeId?: string;
  depositConfirmationRequested?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamDashSummary {
  total: number;
  confirmNeeded: number;
  pending: number;
  overdue: number;
}

export interface TeamBillRow {
  id?: string;
  billId?: string;
  reportId?: string;
  paymentReportId?: string;
  report?: { id?: string };
  unitId: string;
  tenantName: string;
  billingMonth: string;
  totalAmount: number;
  paidAmount: number;
  status: string;
  dueDate: string;
  badge?: string;
}

export interface TeamDeposit {
  id: string;
  depositorName: string;
  amount: number;
  depositedAt: string;
  matchStatus: string;
  matchedBillId?: string;
  guessedUnitId?: string;
}

export interface TeamCollection {
  billingMonth: string;
  collectionRate: number;
  collectedAmount: number;
  unpaidAmount: number;
  vacancyLoss: number;
  confirmingAmount: number;
  orphanAmount: number;
  recentDeposits?: TeamDeposit[];
}

export interface TeamOverdue {
  billId: string;
  unitId: string;
  tenantName: string;
  unpaidAmount: number;
  daysOverdue: number;
  stage: string;
  dueDate: string;
  guard?: Partial<DunningGuard>;
}

export interface TeamDunning {
  billId: string;
  unitId: string;
  tenantName: string;
  unpaidAmount: number;
  draftText: string;
  channel: string;
  guard?: Partial<DunningGuard>;
}

export interface TeamDashboardResponse {
  summary: TeamDashSummary;
  bills: TeamBillRow[];
}

export interface TeamDepositsResponse {
  paymentReports?: TeamBillRow[];
  deposits?: TeamDeposit[];
  orphanDeposits?: TeamDeposit[];
  mismatchDeposits?: TeamDeposit[];
}

export type ManagerPaymentReportRow = ManagerBillRow & { reportId?: string };

const BILL_STATUS: Record<string, BillStatus> = {
  DRAFT: "draft",
  SENT: "sent",
  CONFIRMING: "confirming",
  PARTIALLY_PAID: "partially_paid",
  PAID: "paid",
  OVERDUE: "overdue",
  CORRECTED: "corrected",
  CANCELED: "canceled",
  CANCELLED: "canceled",
};

const PAYMENT_BADGE: Record<string, PaymentBadge> = {
  NONE: "none",
  DUE: "due",
  CONFIRMING: "confirming",
  PARTIAL: "partial",
  PARTIALLY_PAID: "partial",
  PAID: "paid",
  OVERDUE: "overdue",
};

const DEPOSIT_STATUS: Record<string, DepositMatchStatus> = {
  UNMATCHED: "unmatched",
  MATCHED: "matched",
  ORPHAN: "orphan",
  MISMATCH: "mismatch",
};

const OVERDUE_STAGE: Record<string, OverdueStage> = {
  MINOR: "minor",
  WARNING: "warning",
  SEVERE: "severe",
};

function numberOr(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function stringOr(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  return String(value);
}

function enumKey(value: unknown): string {
  return stringOr(value).trim().toUpperCase();
}

function warn(kind: string, value: unknown, fallback: string) {
  console.warn(`[billing-manager-mapping] 미매핑 ${kind}: ${String(value)} → ${fallback}`);
}

export function normalizeUnitId(unitId: unknown): string {
  return stringOr(unitId).replace(/\s*호\s*$/, "");
}

export function mapBillStatus(status: unknown): BillStatus {
  const key = enumKey(status);
  const mapped = BILL_STATUS[key];
  if (!mapped) warn("BillStatus", status, "draft");
  return mapped ?? "draft";
}

export function mapPaymentBadge(badge: unknown): PaymentBadge {
  const key = enumKey(badge);
  const mapped = PAYMENT_BADGE[key];
  if (!mapped) warn("PaymentBadge", badge, "none");
  return mapped ?? "none";
}

export function mapDepositStatus(status: unknown): DepositMatchStatus {
  const key = enumKey(status);
  const mapped = DEPOSIT_STATUS[key];
  if (!mapped) warn("DepositMatchStatus", status, "unmatched");
  return mapped ?? "unmatched";
}

export function mapOverdueStage(stage: unknown): OverdueStage {
  const key = enumKey(stage);
  const mapped = OVERDUE_STAGE[key];
  if (!mapped) warn("OverdueStage", stage, "minor");
  return mapped ?? "minor";
}

function mapGuard(guard?: Partial<DunningGuard>): DunningGuard {
  const hasConfirming = Boolean(guard?.hasConfirming);
  const hasOrphan = Boolean(guard?.hasOrphan);
  return {
    blocked: Boolean(guard?.blocked ?? (hasConfirming || hasOrphan)),
    hasConfirming,
    hasOrphan,
  };
}

export function toBill(team: TeamBill): Bill {
  return {
    id: stringOr(team.id),
    unitId: normalizeUnitId(team.unitId),
    billingMonth: stringOr(team.billingMonth),
    status: mapBillStatus(team.status),
    items: Array.isArray(team.items)
      ? team.items.map((item) => ({
          label: stringOr(item.label, "항목"),
          amount: numberOr(item.amount),
        }))
      : [],
    totalAmount: numberOr(team.totalAmount),
    paidAmount: numberOr(team.paidAmount),
    dueDate: stringOr(team.dueDate),
    account: {
      bankName: stringOr(team.account?.bankName ?? team.bankName),
      accountNumber: stringOr(team.account?.accountNumber ?? team.accountNumber),
      accountHolder: stringOr(team.account?.accountHolder ?? team.accountHolder),
    },
    correctionHistory: Array.isArray(team.correctionHistory)
      ? team.correctionHistory.map((item) => stringOr(item))
      : undefined,
    maintenanceFeeId: team.maintenanceFeeId,
    depositConfirmationRequested: Boolean(team.depositConfirmationRequested),
    createdAt: stringOr(team.createdAt),
    updatedAt: stringOr(team.updatedAt),
  };
}

export function toDashSummary(summary: TeamDashSummary): BillDashboardSummary {
  return {
    total: numberOr(summary.total),
    confirmNeeded: numberOr(summary.confirmNeeded),
    pending: numberOr(summary.pending),
    overdue: numberOr(summary.overdue),
  };
}

export function toManagerBillRow(row: TeamBillRow): ManagerBillRow {
  return {
    billId: stringOr(row.billId ?? row.id),
    unitId: normalizeUnitId(row.unitId),
    tenantName: stringOr(row.tenantName, "임차인"),
    billingMonth: stringOr(row.billingMonth),
    totalAmount: numberOr(row.totalAmount),
    paidAmount: numberOr(row.paidAmount),
    status: mapBillStatus(row.status),
    dueDate: stringOr(row.dueDate),
    badge: row.badge ? mapPaymentBadge(row.badge) : undefined,
  };
}

export function toManagerPaymentReportRow(row: TeamBillRow): ManagerPaymentReportRow {
  const reportId = row.reportId ?? row.paymentReportId ?? row.report?.id;
  return {
    ...toManagerBillRow(row),
    ...(reportId ? { reportId } : {}),
  };
}

export function toDeposit(deposit: TeamDeposit): Deposit {
  return {
    id: stringOr(deposit.id),
    depositorName: stringOr(deposit.depositorName, "미확인"),
    amount: numberOr(deposit.amount),
    depositedAt: stringOr(deposit.depositedAt),
    matchStatus: mapDepositStatus(deposit.matchStatus),
    matchedBillId: deposit.matchedBillId,
    guessedUnitId: deposit.guessedUnitId ? normalizeUnitId(deposit.guessedUnitId) : undefined,
  };
}

export function toCollectionSummary(collection: TeamCollection): CollectionSummary {
  return {
    billingMonth: stringOr(collection.billingMonth),
    collectionRate: numberOr(collection.collectionRate),
    collectedAmount: numberOr(collection.collectedAmount),
    unpaidAmount: numberOr(collection.unpaidAmount),
    vacancyLoss: numberOr(collection.vacancyLoss),
    confirmingAmount: numberOr(collection.confirmingAmount),
    orphanAmount: numberOr(collection.orphanAmount),
    recentDeposits: (collection.recentDeposits ?? []).map(toDeposit),
  };
}

export function toOverdueCase(item: TeamOverdue): OverdueCase {
  return {
    billId: stringOr(item.billId),
    unitId: normalizeUnitId(item.unitId),
    tenantName: stringOr(item.tenantName, "임차인"),
    unpaidAmount: numberOr(item.unpaidAmount),
    daysOverdue: numberOr(item.daysOverdue),
    stage: mapOverdueStage(item.stage),
    dueDate: stringOr(item.dueDate),
    guard: mapGuard(item.guard),
  };
}

export function toDunningDraft(draft: TeamDunning): DunningDraft {
  return {
    billId: stringOr(draft.billId),
    unitId: normalizeUnitId(draft.unitId),
    tenantName: stringOr(draft.tenantName, "임차인"),
    unpaidAmount: numberOr(draft.unpaidAmount),
    draftText: stringOr(draft.draftText),
    channel: stringOr(draft.channel, "룸로그 알림"),
    guard: mapGuard(draft.guard),
  };
}

export function toManagerDashboard(data: TeamDashboardResponse) {
  return {
    summary: toDashSummary(data.summary),
    bills: (data.bills ?? []).map(toManagerBillRow),
  };
}

export function toManagerDepositsData(data: TeamDepositsResponse) {
  return {
    paymentReports: (data.paymentReports ?? []).map(toManagerPaymentReportRow),
    deposits: (data.deposits ?? []).map(toDeposit),
    orphanDeposits: (data.orphanDeposits ?? []).map(toDeposit),
    mismatchDeposits: (data.mismatchDeposits ?? []).map(toDeposit),
  };
}
