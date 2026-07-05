import type {
  Bill,
  BillLineItem,
  BillStatus,
  MaintenanceFee,
  MaintenanceFeeItem,
  PaymentAccount,
  PaymentReport,
  PaymentReportStatus,
} from "@roomlog/types";

// 팀 백엔드(Prisma/store) 응답 → @roomlog/types 납부 모델 매퍼.
// web은 api 내부 타입을 import하지 않고 계약서 §4의 필요한 필드만 느슨히 타입화한다.

export interface TeamBillLineItem {
  label: string;
  amount: number;
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

export interface TeamMaintenanceItem {
  label: string;
  amount: number;
  receiptAvailable?: boolean;
}

export interface TeamMaintenance {
  id: string;
  unitId: string;
  billingMonth: string;
  items?: TeamMaintenanceItem[];
  totalAmount: number;
  available?: boolean;
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

function toItems(items: TeamBillLineItem[] | undefined): BillLineItem[] {
  return (items ?? []).map((item) => ({
    label: item.label,
    amount: item.amount,
  }));
}

function toMaintenanceItems(items: TeamMaintenanceItem[] | undefined): MaintenanceFeeItem[] {
  return (items ?? []).map((item) => ({
    label: item.label,
    amount: item.amount,
    receiptAvailable: Boolean(item.receiptAvailable),
  }));
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

export function toMaintenance(maintenance: TeamMaintenance): MaintenanceFee {
  const items = toMaintenanceItems(maintenance.items);
  return {
    id: maintenance.id,
    unitId: normalizeUnitId(maintenance.unitId),
    billingMonth: maintenance.billingMonth,
    items,
    totalAmount: maintenance.totalAmount ?? items.reduce((sum, item) => sum + item.amount, 0),
    available: Boolean(maintenance.available),
  };
}
