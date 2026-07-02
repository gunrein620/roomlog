import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import type {
  AdjustDeductionDto,
  AdjustWearVerdictDto,
  CompleteReviewDto,
  Dispute,
  ManagerSettlementReview,
  MoveoutChecklistItem,
  MoveoutDashboardSummary,
  MoveoutManagerRow,
  MoveoutRecordItem,
  MoveoutSummary,
  ReportAuditEntry,
  RespondDisputeDto,
  SettlementEstimate,
} from "@roomlog/types";
import { MoveoutService } from "./moveout.service";
import type { CreateDisputeDto } from "./moveout.repository";

@Controller("moveouts")
export class MoveoutController {
  constructor(private readonly moveoutService: MoveoutService) {}

  @Get()
  listMoveouts(): MoveoutSummary[] {
    return this.moveoutService.listMoveouts();
  }

  @Get("manager/dashboard")
  getManagerDashboard(): MoveoutDashboardSummary {
    return this.moveoutService.getDashboardSummary();
  }

  @Get("manager/rows")
  listManagerRows(): MoveoutManagerRow[] {
    return this.moveoutService.listManagerRows();
  }

  @Get(":id")
  getMoveout(@Param("id") id: string): MoveoutSummary {
    return this.moveoutService.getMoveout(id);
  }

  @Get(":id/records")
  getRecords(@Param("id") id: string): MoveoutRecordItem[] {
    return this.moveoutService.getRecords(id);
  }

  @Get(":id/checklist")
  getChecklist(@Param("id") id: string): MoveoutChecklistItem[] {
    return this.moveoutService.getChecklist(id);
  }

  @Get(":id/settlement")
  getSettlement(@Param("id") id: string): SettlementEstimate {
    return this.moveoutService.getSettlement(id);
  }

  @Get(":id/manager/settlement")
  getManagerSettlementReview(@Param("id") id: string): ManagerSettlementReview {
    return this.moveoutService.getManagerSettlementReview(id);
  }

  @Post(":id/manager/report/adjust-wear")
  adjustWearVerdict(@Param("id") id: string, @Body() dto: AdjustWearVerdictDto): ReportAuditEntry {
    return this.moveoutService.adjustWearVerdict(id, dto);
  }

  @Get(":id/manager/report/audit")
  getReportAudit(@Param("id") id: string): ReportAuditEntry[] {
    return this.moveoutService.getReportAudit(id);
  }

  @Post(":id/manager/settlement/adjust")
  adjustDeduction(@Param("id") id: string, @Body() dto: AdjustDeductionDto): SettlementEstimate {
    return this.moveoutService.adjustDeduction(id, dto);
  }

  @Post(":id/manager/settlement/complete")
  completeReview(@Param("id") id: string, @Body() dto: CompleteReviewDto): ManagerSettlementReview {
    return this.moveoutService.completeReview(id, dto);
  }

  @Post(":id/manager/disputes/respond")
  respondDispute(@Param("id") id: string, @Body() dto: RespondDisputeDto): Dispute {
    return this.moveoutService.respondDispute(id, dto);
  }

  @Get(":id/disputes")
  getDisputes(@Param("id") id: string): Dispute[] {
    return this.moveoutService.getDisputes(id);
  }

  @Post(":id/disputes")
  createDispute(@Param("id") id: string, @Body() dto: CreateDisputeDto): Dispute {
    return this.moveoutService.createDispute(id, dto);
  }
}
