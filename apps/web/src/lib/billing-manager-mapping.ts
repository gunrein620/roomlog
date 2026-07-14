import type {
  Bill,
  BillDashboardSummary,
  BillStatus,
  CollectionSummary,
  Deposit,
  DepositMatchStatus,
  DunningDraft,
  DunningGuard,
  ManagerBillCreationData,
  ManagerBillCreationOption,
  ManagerBillCreationUnavailableOption,
  ManagerBillCreationUnavailableReason,
  ManagerBillRow,
  ManagerBillingDashboardData,
  ManagerBillingRecentDeposit,
  ManagerBillingScope,
  ManagerCollectionAnalytics,
  ManagerCollectionBuildingRow,
  ManagerCollectionPoint,
  ManagerOverdueWorkspace,
  OverdueCase,
  OverdueStage,
  PaymentBadge,
} from "@roomlog/types";

// 팀 백엔드의 매니저 청구 Team* 응답 → @roomlog/types(payment.ts) 매퍼.
// web은 api 내부 타입을 import하지 않고, 계약서의 느슨한 Team* shape만 여기서 선언한다.

export interface TeamBill {
  id: string;
  roomId?: string;
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
  billedAmount?: number;
  collectedAmount?: number;
  unpaidAmount?: number;
  collectionRate?: number;
  overdueUnits?: number;
}

export interface TeamBillingScope {
  buildings?: Array<{
    buildingName?: string;
    address?: string;
    roomCount?: number;
  }>;
  selectedBuilding?: string;
}

export interface TeamBillRow {
  id?: string;
  billId?: string;
  reportId?: string;
  paymentReportId?: string;
  report?: { id?: string };
  roomId?: string;
  buildingName?: string;
  unitId: string;
  tenantName: string;
  billingMonth: string;
  totalAmount: number;
  paidAmount: number;
  unpaidAmount?: number;
  daysOverdue?: number;
  status: string;
  dueDate: string;
  badge?: string;
  guard?: Partial<DunningGuard>;
}

export interface TeamDeposit {
  id: string;
  depositorName: string;
  amount: number;
  depositedAt: string;
  matchStatus: string;
  matchedBillId?: string;
  guessedUnitId?: string;
  buildingName?: string;
  unitId?: string;
  needsBuildingReview?: boolean;
}

export interface TeamCollection {
  scope?: TeamBillingScope;
  billingMonth: string;
  brief?: {
    billedAmount?: number;
    collectedAmount?: number;
    unpaidAmount?: number;
    collectionRate?: number;
    previousCollectionRate?: number;
    rateDelta?: number;
    confirmingAmount?: number;
  };
  trend?: TeamCollectionPoint[];
  buildings?: TeamCollectionBuildingRow[];
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
  roomId?: string;
  buildingName?: string;
  unitId: string;
  tenantName: string;
  billingMonth?: string;
  totalAmount?: number;
  paidAmount?: number;
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
  scope?: TeamBillingScope;
  billingMonth?: string;
  summary: TeamDashSummary;
  recentDeposits?: TeamDeposit[];
  overduePreview?: TeamOverdue[];
  bills: TeamBillRow[];
}

export interface TeamCollectionPoint {
  billingMonth?: string;
  billedAmount?: number;
  collectedAmount?: number;
  unpaidAmount?: number;
  collectionRate?: number;
}

export interface TeamCollectionBuildingRow extends TeamCollectionPoint {
  buildingName?: string;
  address?: string;
  roomCount?: number;
  previousCollectionRate?: number;
  rateDelta?: number;
  bills?: TeamBillRow[];
}

export interface TeamOverdueResponse {
  scope?: TeamBillingScope;
  asOf?: string;
  summary?: {
    activeUnpaidAmount?: number;
    activeCount?: number;
    severeCount?: number;
    waitingCount?: number;
  };
  activeCases?: TeamOverdue[];
  waitingCases?: TeamOverdue[];
}

export interface TeamBillCreationData {
  scope?: TeamBillingScope;
  billingMonth?: string;
  account?: {
    bankName?: string;
    accountNumber?: string;
    accountHolder?: string;
  };
  options?: Array<{
    roomId?: string;
    buildingName?: string;
    unitId?: string;
    tenantName?: string;
    contractId?: string;
    monthlyRent?: number;
    maintenanceFee?: number;
    dueDate?: string;
    duplicateBillId?: string;
  }>;
  unavailableOptions?: Array<{
    roomId?: string;
    buildingName?: string;
    unitId?: string;
    tenantName?: string;
    contractId?: string;
    reasons?: string[];
  }>;
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
    roomId: team.roomId ? stringOr(team.roomId) : undefined,
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
    roomId: row.roomId ? stringOr(row.roomId) : undefined,
    buildingName: row.buildingName ? stringOr(row.buildingName) : undefined,
    unitId: normalizeUnitId(row.unitId),
    tenantName: stringOr(row.tenantName, "임차인"),
    billingMonth: stringOr(row.billingMonth),
    totalAmount: numberOr(row.totalAmount),
    paidAmount: numberOr(row.paidAmount),
    unpaidAmount: numberOr(row.unpaidAmount, Math.max(0, numberOr(row.totalAmount) - numberOr(row.paidAmount))),
    daysOverdue: numberOr(row.daysOverdue),
    status: mapBillStatus(row.status),
    dueDate: stringOr(row.dueDate),
    badge: row.badge ? mapPaymentBadge(row.badge) : undefined,
    guard: mapGuard(row.guard),
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
    roomId: item.roomId ? stringOr(item.roomId) : undefined,
    buildingName: item.buildingName ? stringOr(item.buildingName) : undefined,
    unitId: normalizeUnitId(item.unitId),
    tenantName: stringOr(item.tenantName, "임차인"),
    billingMonth: item.billingMonth ? stringOr(item.billingMonth) : undefined,
    totalAmount: item.totalAmount === undefined ? undefined : numberOr(item.totalAmount),
    paidAmount: item.paidAmount === undefined ? undefined : numberOr(item.paidAmount),
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
  const summary = toDashSummary(data.summary);
  return {
    scope: toBillingScope(data.scope),
    billingMonth: stringOr(data.billingMonth),
    summary: {
      ...summary,
      billedAmount: numberOr(data.summary.billedAmount),
      collectedAmount: numberOr(data.summary.collectedAmount),
      unpaidAmount: numberOr(data.summary.unpaidAmount),
      collectionRate: numberOr(data.summary.collectionRate),
      overdueUnits: numberOr(data.summary.overdueUnits, summary.overdue),
    },
    recentDeposits: (data.recentDeposits ?? []).map(toManagerRecentDeposit),
    overduePreview: (data.overduePreview ?? []).map(toOverdueCase),
    bills: (data.bills ?? []).map(toManagerBillRow),
  } satisfies ManagerBillingDashboardData & { summary: BillDashboardSummary };
}

export function toManagerDepositsData(data: TeamDepositsResponse) {
  return {
    paymentReports: (data.paymentReports ?? []).map(toManagerPaymentReportRow),
    deposits: (data.deposits ?? []).map(toDeposit),
    orphanDeposits: (data.orphanDeposits ?? []).map(toDeposit),
    mismatchDeposits: (data.mismatchDeposits ?? []).map(toDeposit),
  };
}

export function toBillingScope(scope?: TeamBillingScope): ManagerBillingScope {
  return {
    buildings: (scope?.buildings ?? []).map((building) => ({
      buildingName: stringOr(building.buildingName),
      address: stringOr(building.address),
      roomCount: numberOr(building.roomCount),
    })),
    selectedBuilding: scope?.selectedBuilding
      ? stringOr(scope.selectedBuilding)
      : undefined,
  };
}

export function toManagerRecentDeposit(deposit: TeamDeposit): ManagerBillingRecentDeposit {
  return {
    ...toDeposit(deposit),
    buildingName: deposit.buildingName ? stringOr(deposit.buildingName) : undefined,
    unitId: deposit.unitId ? normalizeUnitId(deposit.unitId) : undefined,
    needsBuildingReview: Boolean(deposit.needsBuildingReview),
  };
}

function toCollectionPoint(point: TeamCollectionPoint): ManagerCollectionPoint {
  return {
    billingMonth: stringOr(point.billingMonth),
    billedAmount: numberOr(point.billedAmount),
    collectedAmount: numberOr(point.collectedAmount),
    unpaidAmount: numberOr(point.unpaidAmount),
    collectionRate: numberOr(point.collectionRate),
  };
}

function toCollectionBuildingRow(
  row: TeamCollectionBuildingRow,
): ManagerCollectionBuildingRow {
  return {
    ...toCollectionPoint(row),
    buildingName: stringOr(row.buildingName),
    address: stringOr(row.address),
    roomCount: numberOr(row.roomCount),
    previousCollectionRate:
      row.previousCollectionRate === undefined
        ? undefined
        : numberOr(row.previousCollectionRate),
    rateDelta: row.rateDelta === undefined ? undefined : numberOr(row.rateDelta),
    bills: (row.bills ?? []).map(toManagerBillRow),
  };
}

export function toManagerCollection(data: TeamCollection): ManagerCollectionAnalytics {
  const brief = data.brief;
  return {
    scope: toBillingScope(data.scope),
    billingMonth: stringOr(data.billingMonth),
    brief: {
      billedAmount: numberOr(brief?.billedAmount),
      collectedAmount: numberOr(brief?.collectedAmount, data.collectedAmount),
      unpaidAmount: numberOr(brief?.unpaidAmount, data.unpaidAmount),
      collectionRate: numberOr(brief?.collectionRate, data.collectionRate),
      previousCollectionRate:
        brief?.previousCollectionRate === undefined
          ? undefined
          : numberOr(brief.previousCollectionRate),
      rateDelta: brief?.rateDelta === undefined ? undefined : numberOr(brief.rateDelta),
      confirmingAmount: numberOr(brief?.confirmingAmount, data.confirmingAmount),
    },
    trend: (data.trend ?? []).map(toCollectionPoint),
    buildings: (data.buildings ?? []).map(toCollectionBuildingRow),
  };
}

export function toManagerOverdue(data: TeamOverdueResponse): ManagerOverdueWorkspace {
  const activeCases = (data.activeCases ?? []).map(toOverdueCase);
  const waitingCases = (data.waitingCases ?? []).map(toOverdueCase);
  return {
    scope: toBillingScope(data.scope),
    asOf: stringOr(data.asOf),
    summary: {
      activeUnpaidAmount: numberOr(
        data.summary?.activeUnpaidAmount,
        activeCases.reduce((sum, item) => sum + item.unpaidAmount, 0),
      ),
      activeCount: numberOr(data.summary?.activeCount, activeCases.length),
      severeCount: numberOr(
        data.summary?.severeCount,
        activeCases.filter((item) => item.daysOverdue >= 31).length,
      ),
      waitingCount: numberOr(data.summary?.waitingCount, waitingCases.length),
    },
    activeCases,
    waitingCases,
  };
}

function toBillCreationOption(
  option: NonNullable<TeamBillCreationData["options"]>[number],
): ManagerBillCreationOption {
  return {
    roomId: stringOr(option.roomId),
    buildingName: stringOr(option.buildingName),
    unitId: normalizeUnitId(option.unitId),
    tenantName: stringOr(option.tenantName, "미연결 임차인"),
    contractId: stringOr(option.contractId),
    monthlyRent: numberOr(option.monthlyRent),
    maintenanceFee: numberOr(option.maintenanceFee),
    dueDate: stringOr(option.dueDate),
    duplicateBillId: option.duplicateBillId
      ? stringOr(option.duplicateBillId)
      : undefined,
  };
}

const BILL_CREATION_UNAVAILABLE_REASONS = new Set<ManagerBillCreationUnavailableReason>([
  "NO_CONTRACT",
  "CONTRACT_NOT_ACTIVE",
  "CONTRACT_NOT_CONFIRMED",
  "CONTRACT_VALUES_NOT_CONFIRMED",
  "MONTHLY_RENT_MISSING",
  "MAINTENANCE_FEE_MISSING",
  "BILL_AMOUNT_INVALID",
  "PAYMENT_DAY_MISSING",
  "PAYMENT_DAY_INVALID",
]);

function toBillCreationUnavailableOption(
  option: NonNullable<TeamBillCreationData["unavailableOptions"]>[number],
): ManagerBillCreationUnavailableOption {
  return {
    roomId: stringOr(option.roomId),
    buildingName: stringOr(option.buildingName),
    unitId: normalizeUnitId(option.unitId),
    tenantName: stringOr(option.tenantName, "미연결 임차인"),
    contractId: option.contractId ? stringOr(option.contractId) : undefined,
    reasons: (option.reasons ?? []).filter(
      (reason): reason is ManagerBillCreationUnavailableReason =>
        BILL_CREATION_UNAVAILABLE_REASONS.has(reason as ManagerBillCreationUnavailableReason),
    ),
  };
}

export function toManagerBillCreationData(
  data: TeamBillCreationData,
): ManagerBillCreationData {
  return {
    scope: toBillingScope(data.scope),
    billingMonth: stringOr(data.billingMonth),
    account: {
      bankName: stringOr(data.account?.bankName),
      accountNumber: stringOr(data.account?.accountNumber),
      accountHolder: stringOr(data.account?.accountHolder),
    },
    options: (data.options ?? []).map(toBillCreationOption),
    unavailableOptions: (data.unavailableOptions ?? []).map(toBillCreationUnavailableOption),
  };
}
