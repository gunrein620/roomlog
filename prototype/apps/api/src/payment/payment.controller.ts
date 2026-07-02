import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import type {
  Bill,
  BillDashboardSummary,
  CollectionSummary,
  Deposit,
  DunningDraft,
  MaintenanceFee,
  ManagerBillRow,
  OverdueCase,
  PaymentReport,
} from "@roomlog/types";
import { PaymentService } from "./payment.service";
import type { CreatePaymentReportDto } from "./payment.repository";

@Controller("bills")
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  listBills(): Bill[] {
    return this.paymentService.listBills();
  }

  @Get("manager/dashboard")
  getManagerDashboard(): {
    summary: BillDashboardSummary;
    bills: ManagerBillRow[];
  } {
    return this.paymentService.getManagerDashboard();
  }

  @Get("manager/collection")
  getManagerCollection(): CollectionSummary {
    return this.paymentService.getCollectionSummary();
  }

  @Get("manager/deposits")
  getManagerDeposits(): {
    paymentReports: ManagerBillRow[];
    deposits: Deposit[];
    orphanDeposits: Deposit[];
    mismatchDeposits: Deposit[];
  } {
    return this.paymentService.getManagerDepositQueues();
  }

  @Get("manager/overdue")
  getManagerOverdue(): {
    activeCases: OverdueCase[];
    waitingCases: OverdueCase[];
  } {
    return this.paymentService.getManagerOverdueData();
  }

  @Get("manager/dunning/:billId")
  getManagerDunning(@Param("billId") billId: string): DunningDraft {
    return this.paymentService.getDunningDraft(billId);
  }

  @Get(":id")
  getBill(@Param("id") id: string): Bill {
    return this.paymentService.getBill(id);
  }

  @Get(":id/maintenance")
  getMaintenance(@Param("id") id: string): MaintenanceFee {
    return this.paymentService.getMaintenance(id);
  }

  @Post(":id/reports")
  createReport(
    @Param("id") id: string,
    @Body() dto: CreatePaymentReportDto,
  ): PaymentReport {
    return this.paymentService.createReport(id, dto);
  }
}
