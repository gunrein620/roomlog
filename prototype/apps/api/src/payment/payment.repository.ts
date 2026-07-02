import { Injectable } from "@nestjs/common";
import type { Bill, Deposit, MaintenanceFee, PaymentReport } from "@roomlog/types";

export interface CreatePaymentReportDto {
  amount: number; // 신고 금액(일부 납부 가능)
  depositorName?: string; // 입금자명(본인과 다르면)
}

export abstract class PaymentRepository {
  abstract listBills(): Bill[];
  abstract getBill(id: string): Bill | undefined;
  abstract getMaintenance(billId: string): MaintenanceFee | undefined;
  abstract listReports(): PaymentReport[];
  abstract listDeposits(): Deposit[];
  abstract createReport(
    billId: string,
    dto: CreatePaymentReportDto,
  ): PaymentReport | undefined;
}

const ACCOUNT = {
  bankName: "국민은행",
  accountNumber: "123456-78-901234",
  accountHolder: "룸로그관리",
} as const;

const TENANT_NAMES_BY_UNIT: Record<string, string> = {
  "302": "302호 임차인",
};

// 데모 시드 — 프론트 lib/demo-payment.ts와 동일한 값으로 맞춘다.
const DEMO_MAINTENANCE: MaintenanceFee = {
  id: "mf_2607",
  unitId: "302",
  billingMonth: "2026-07",
  items: [
    { label: "공용 전기", amount: 18000, receiptAvailable: true },
    { label: "공용 청소", amount: 12000, receiptAvailable: true },
    { label: "승강기 유지", amount: 8000, receiptAvailable: false },
    { label: "공용 수도", amount: 12000, receiptAvailable: true },
  ],
  totalAmount: 50000,
  available: true,
};

const DEMO_BILLS: Bill[] = [
  {
    id: "bl_2607",
    unitId: "302",
    billingMonth: "2026-07",
    status: "sent",
    items: [
      { label: "월세", amount: 500000 },
      { label: "관리비", amount: 50000 },
    ],
    totalAmount: 550000,
    paidAmount: 0,
    dueDate: "2026-07-25T23:59:59+09:00",
    account: ACCOUNT,
    maintenanceFeeId: "mf_2607",
    createdAt: "2026-07-01T09:00:00+09:00",
    updatedAt: "2026-07-01T09:00:00+09:00",
  },
  {
    id: "bl_2606",
    unitId: "302",
    billingMonth: "2026-06",
    status: "paid",
    items: [
      { label: "월세", amount: 500000 },
      { label: "관리비", amount: 50000 },
    ],
    totalAmount: 550000,
    paidAmount: 550000,
    dueDate: "2026-06-25T23:59:59+09:00",
    account: ACCOUNT,
    createdAt: "2026-06-01T09:00:00+09:00",
    updatedAt: "2026-06-24T14:00:00+09:00",
  },
  {
    id: "bl_2605",
    unitId: "302",
    billingMonth: "2026-05",
    status: "paid",
    items: [
      { label: "월세", amount: 500000 },
      { label: "관리비", amount: 50000 },
    ],
    totalAmount: 550000,
    paidAmount: 550000,
    dueDate: "2026-05-25T23:59:59+09:00",
    account: ACCOUNT,
    createdAt: "2026-05-01T09:00:00+09:00",
    updatedAt: "2026-05-23T11:00:00+09:00",
  },
  {
    id: "bl_2604",
    unitId: "302",
    billingMonth: "2026-04",
    status: "sent",
    items: [
      { label: "월세", amount: 500000 },
      { label: "관리비", amount: 50000 },
    ],
    totalAmount: 550000,
    paidAmount: 0,
    dueDate: "2026-04-25T23:59:59+09:00",
    account: ACCOUNT,
    createdAt: "2026-04-01T09:00:00+09:00",
    updatedAt: "2026-04-01T09:00:00+09:00",
  },
];

const DEMO_REPORTS: PaymentReport[] = [
  {
    id: "pr_confirming_2607",
    billId: "bl_2607",
    unitId: "302",
    amount: 550000,
    depositorName: TENANT_NAMES_BY_UNIT["302"],
    status: "confirming",
    etaHours: 24,
    reportedAt: "2026-07-02T10:00:00+09:00",
  },
];

const DEMO_DEPOSITS: Deposit[] = [
  {
    id: "dp_orphan_2607",
    depositorName: "302호 가족",
    amount: 550000,
    depositedAt: "2026-07-02T10:08:00+09:00",
    matchStatus: "orphan",
    guessedUnitId: "302",
  },
];

@Injectable()
export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly bills = new Map<string, Bill>();
  private readonly maintenanceByBillId = new Map<string, MaintenanceFee>();
  private readonly reportsByBillId = new Map<string, PaymentReport[]>();
  private readonly deposits = new Map<string, Deposit>();

  constructor() {
    for (const bill of DEMO_BILLS) {
      this.bills.set(bill.id, bill);
    }
    for (const report of DEMO_REPORTS) {
      const existing = this.reportsByBillId.get(report.billId) ?? [];
      this.reportsByBillId.set(report.billId, [...existing, report]);
    }
    for (const deposit of DEMO_DEPOSITS) {
      this.deposits.set(deposit.id, deposit);
    }
    // 관리비는 청구서에 연결된 billId로 조회한다(진입 활성 판정용).
    this.maintenanceByBillId.set("bl_2607", DEMO_MAINTENANCE);
  }

  listBills(): Bill[] {
    return Array.from(this.bills.values());
  }

  getBill(id: string): Bill | undefined {
    return this.bills.get(id);
  }

  getMaintenance(billId: string): MaintenanceFee | undefined {
    return this.maintenanceByBillId.get(billId);
  }

  listReports(): PaymentReport[] {
    return Array.from(this.reportsByBillId.values()).flat();
  }

  listDeposits(): Deposit[] {
    return Array.from(this.deposits.values());
  }

  createReport(
    billId: string,
    dto: CreatePaymentReportDto,
  ): PaymentReport | undefined {
    const bill = this.bills.get(billId);
    if (!bill) {
      return undefined;
    }

    const now = new Date().toISOString();
    const report: PaymentReport = {
      id: this.createReportId(),
      billId,
      unitId: bill.unitId,
      amount: dto.amount,
      depositorName: dto.depositorName,
      status: "confirming", // 자기신고 큐(확인 중) — 확정 입금 아님
      etaHours: 24,
      reportedAt: now,
    };

    const existing = this.reportsByBillId.get(billId) ?? [];
    this.reportsByBillId.set(billId, [...existing, report]);

    // 신고 접수 → 청구 상태 '확인 중'(집계 제외). paidAmount는 확정 전이라 갱신 안 함.
    this.bills.set(billId, { ...bill, status: "confirming", updatedAt: now });

    return report;
  }

  private createReportId(): string {
    return `pr_${Date.now().toString(36)}`;
  }
}
