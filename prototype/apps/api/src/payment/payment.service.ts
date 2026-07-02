import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  Bill,
  BillDashboardSummary,
  CollectionSummary,
  Deposit,
  DunningDraft,
  DunningGuard,
  MaintenanceFee,
  ManagerBillRow,
  OverdueCase,
  OverdueStage,
  PaymentBadge,
  PaymentReport,
} from "@roomlog/types";
import { CreatePaymentReportDto, PaymentRepository } from "./payment.repository";

const TENANT_NAMES_BY_UNIT: Record<string, string> = {
  "302": "302호 임차인",
};

@Injectable()
export class PaymentService {
  constructor(private readonly repository: PaymentRepository) {}

  listBills(): Bill[] {
    return this.repository.listBills();
  }

  getBill(id: string): Bill {
    const bill = this.repository.getBill(id);
    if (!bill) {
      throw new NotFoundException(`Bill not found: ${id}`);
    }

    return bill;
  }

  getMaintenance(billId: string): MaintenanceFee {
    const maintenance = this.repository.getMaintenance(billId);
    if (!maintenance) {
      throw new NotFoundException(`Maintenance fee not found: ${billId}`);
    }

    return maintenance;
  }

  createReport(billId: string, dto: CreatePaymentReportDto): PaymentReport {
    const report = this.repository.createReport(billId, dto);
    if (!report) {
      throw new NotFoundException(`Bill not found: ${billId}`);
    }

    return report;
  }

  getManagerDashboard(): {
    summary: BillDashboardSummary;
    bills: ManagerBillRow[];
  } {
    const bills = this.repository.listBills();
    const rows = bills.map((bill) => this.toManagerRow(bill));
    const confirmNeededBillIds = new Set(
      this.repository
        .listReports()
        .filter((report) => report.status === "confirming")
        .map((report) => report.billId),
    );
    const unhandledDeposits = this.repository
      .listDeposits()
      .filter(
        (deposit) =>
          deposit.matchStatus === "orphan" || deposit.matchStatus === "mismatch",
      );
    const overdue = this.getOverdueCases().filter(
      (overdueCase) => !overdueCase.guard.blocked,
    ).length;

    return {
      summary: {
        total: bills.length,
        confirmNeeded: confirmNeededBillIds.size + unhandledDeposits.length,
        pending: bills.filter((bill) => bill.status === "sent").length,
        overdue,
      },
      bills: rows,
    };
  }

  getCollectionSummary(): CollectionSummary {
    const bills = this.repository.listBills();
    const billingMonth = this.getLatestBillingMonth(bills);
    const monthlyBills = bills.filter((bill) => bill.billingMonth === billingMonth);
    const monthlyBillIds = new Set(monthlyBills.map((bill) => bill.id));
    const monthlyUnitIds = new Set(monthlyBills.map((bill) => bill.unitId));
    const collectedAmount = monthlyBills.reduce(
      (sum, bill) => sum + bill.paidAmount,
      0,
    );
    const totalAmount = monthlyBills.reduce(
      (sum, bill) => sum + bill.totalAmount,
      0,
    );
    const confirmingAmount = this.repository
      .listReports()
      .filter(
        (report) =>
          monthlyBillIds.has(report.billId) && report.status === "confirming",
      )
      .reduce((sum, report) => sum + report.amount, 0);
    const orphanAmount = this.repository
      .listDeposits()
      .filter(
        (deposit) =>
          deposit.matchStatus === "orphan" &&
          !!deposit.guessedUnitId &&
          monthlyUnitIds.has(deposit.guessedUnitId),
      )
      .reduce((sum, deposit) => sum + deposit.amount, 0);

    return {
      billingMonth,
      collectionRate: totalAmount === 0 ? 0 : collectedAmount / totalAmount,
      collectedAmount,
      unpaidAmount: totalAmount - collectedAmount,
      vacancyLoss: 0,
      confirmingAmount,
      orphanAmount,
      recentDeposits: this.getManagerDeposits().slice(0, 5),
    };
  }

  getManagerDeposits(): Deposit[] {
    return this.repository
      .listDeposits()
      .sort(
        (a, b) =>
          new Date(b.depositedAt).getTime() - new Date(a.depositedAt).getTime(),
      );
  }

  /**
   * M-BILL-03 입금 매칭 워크플로우 — 세 큐 분리(자기신고 ≠ 실제입금 ≠ orphan).
   * paymentReports: 납부 신고 큐(확인 중 자기신고를 청구 행으로) / deposits: 실제 입금 매칭 후보
   * orphanDeposits: 미연결·입금자명 불일치 / mismatchDeposits: 연결됐으나 불일치.
   */
  getManagerDepositQueues(): {
    paymentReports: ManagerBillRow[];
    deposits: Deposit[];
    orphanDeposits: Deposit[];
    mismatchDeposits: Deposit[];
  } {
    const confirmingBillIds = new Set(
      this.repository
        .listReports()
        .filter((report) => report.status === "confirming")
        .map((report) => report.billId),
    );
    const paymentReports = this.repository
      .listBills()
      .filter((bill) => confirmingBillIds.has(bill.id))
      .map((bill) => this.toManagerRow(bill));
    const sorted = this.getManagerDeposits();

    return {
      paymentReports,
      deposits: sorted.filter(
        (deposit) =>
          deposit.matchStatus === "unmatched" ||
          deposit.matchStatus === "matched",
      ),
      orphanDeposits: sorted.filter(
        (deposit) => deposit.matchStatus === "orphan",
      ),
      mismatchDeposits: sorted.filter(
        (deposit) => deposit.matchStatus === "mismatch",
      ),
    };
  }

  /**
   * M-BILL-04 연체 관리 — 가드 통과분(activeCases)과 보류분(waitingCases='확인 대기') 분리.
   * guard.blocked(확인중·orphan 존재) 건은 자동 연체에서 제외하고 별도 표시.
   */
  getManagerOverdueData(): {
    activeCases: OverdueCase[];
    waitingCases: OverdueCase[];
  } {
    const cases = this.getOverdueCases();

    return {
      activeCases: cases.filter((item) => !item.guard.blocked),
      waitingCases: cases.filter((item) => item.guard.blocked),
    };
  }

  getOverdueCases(): OverdueCase[] {
    const now = Date.now();

    return this.repository
      .listBills()
      .filter((bill) => bill.totalAmount > bill.paidAmount)
      .map((bill) => ({
        bill,
        daysOverdue: this.getDaysOverdue(bill, now),
      }))
      .filter(({ daysOverdue }) => daysOverdue > 0)
      .map(({ bill, daysOverdue }) => ({
        billId: bill.id,
        unitId: bill.unitId,
        tenantName: this.getTenantName(bill.unitId),
        unpaidAmount: bill.totalAmount - bill.paidAmount,
        daysOverdue,
        stage: this.toOverdueStage(daysOverdue),
        dueDate: bill.dueDate,
        guard: this.getDunningGuard(bill),
      }));
  }

  getDunningDraft(billId: string): DunningDraft {
    const bill = this.getBill(billId);
    const guard = this.getDunningGuard(bill);
    const tenantName = this.getTenantName(bill.unitId);
    const unpaidAmount = bill.totalAmount - bill.paidAmount;

    return {
      billId: bill.id,
      unitId: bill.unitId,
      tenantName,
      unpaidAmount,
      draftText: guard.blocked
        ? `${tenantName}님, 현재 입금 확인 중인 신고 또는 미확인 입금이 있어 독촉문 발송 전 확인이 필요합니다.`
        : `${tenantName}님, ${bill.billingMonth} 청구 미납액 ${unpaidAmount.toLocaleString("ko-KR")}원이 확인되어 안내드립니다. 납부 또는 확인이 필요하시면 관리인에게 회신해 주세요.`,
      channel: "sms",
      guard,
    };
  }

  private toManagerRow(bill: Bill): ManagerBillRow {
    return {
      billId: bill.id,
      unitId: bill.unitId,
      tenantName: this.getTenantName(bill.unitId),
      billingMonth: bill.billingMonth,
      totalAmount: bill.totalAmount,
      paidAmount: bill.paidAmount,
      status: bill.status,
      dueDate: bill.dueDate,
      badge: this.toPaymentBadge(bill),
    };
  }

  private toPaymentBadge(bill: Bill): PaymentBadge {
    switch (bill.status) {
      case "draft":
      case "canceled":
        return "none";
      case "sent":
        return "due";
      case "confirming":
        return "confirming";
      case "partially_paid":
        return "partial";
      case "paid":
        return "paid";
      case "overdue":
        return "overdue";
      case "corrected":
        return bill.paidAmount >= bill.totalAmount ? "paid" : "due";
    }
  }

  private getLatestBillingMonth(bills: Bill[]): string {
    return bills
      .map((bill) => bill.billingMonth)
      .sort((a, b) => b.localeCompare(a))[0];
  }

  private getDaysOverdue(bill: Bill, now: number): number {
    const dueTime = new Date(bill.dueDate).getTime();

    if (Number.isNaN(dueTime) || now <= dueTime) {
      return 0;
    }

    return Math.floor((now - dueTime) / 86_400_000);
  }

  private toOverdueStage(daysOverdue: number): OverdueStage {
    if (daysOverdue >= 30) {
      return "severe";
    }
    if (daysOverdue >= 7) {
      return "warning";
    }

    return "minor";
  }

  private getDunningGuard(bill: Bill): DunningGuard {
    const hasConfirming = this.repository
      .listReports()
      .some(
        (report) =>
          report.billId === bill.id && report.status === "confirming",
      );
    const hasOrphan = this.repository
      .listDeposits()
      .some(
        (deposit) =>
          deposit.matchStatus === "orphan" &&
          deposit.guessedUnitId === bill.unitId,
      );

    return {
      blocked: hasConfirming || hasOrphan,
      hasConfirming,
      hasOrphan,
    };
  }

  private getTenantName(unitId: string): string {
    return TENANT_NAMES_BY_UNIT[unitId] ?? `${unitId}호 임차인`;
  }
}
