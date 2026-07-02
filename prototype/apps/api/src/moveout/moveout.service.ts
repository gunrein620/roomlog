import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AdjustDeductionDto,
  AdjustWearVerdictDto,
  CompleteReviewDto,
  MoveoutChecklistItem,
  Dispute,
  ManagerSettlementReview,
  MoveoutRecordItem,
  MoveoutDashboardSummary,
  MoveoutManagerRow,
  MoveoutSummary,
  ReportAuditEntry,
  RespondDisputeDto,
  SettlementEstimate,
} from "@roomlog/types";
import { CreateDisputeDto, MoveoutRepository } from "./moveout.repository";

@Injectable()
export class MoveoutService {
  constructor(private readonly repository: MoveoutRepository) {}

  listMoveouts(): MoveoutSummary[] {
    return this.repository.listMoveouts();
  }

  getMoveout(id: string): MoveoutSummary {
    const moveout = this.repository.getMoveout(id);
    if (!moveout) {
      throw new NotFoundException(`Moveout not found: ${id}`);
    }

    return moveout;
  }

  getRecords(summaryId: string): MoveoutRecordItem[] {
    return this.repository.getRecords(summaryId);
  }

  getChecklist(summaryId: string): MoveoutChecklistItem[] {
    return this.repository.getChecklist(summaryId);
  }

  getSettlement(summaryId: string): SettlementEstimate {
    const settlement = this.repository.getSettlement(summaryId);
    if (!settlement) {
      throw new NotFoundException(`Moveout settlement not found: ${summaryId}`);
    }

    return settlement;
  }

  getDisputes(summaryId: string): Dispute[] {
    return this.repository.getDisputes(summaryId);
  }

  createDispute(summaryId: string, dto: CreateDisputeDto): Dispute {
    return this.repository.createDispute(summaryId, dto);
  }

  getDashboardSummary(): MoveoutDashboardSummary {
    return this.repository.getDashboardSummary();
  }

  listManagerRows(): MoveoutManagerRow[] {
    return this.repository.listManagerRows();
  }

  getManagerSettlementReview(summaryId: string): ManagerSettlementReview {
    const review = this.repository.getManagerSettlementReview(summaryId);
    if (!review) {
      throw new NotFoundException(`Moveout settlement review not found: ${summaryId}`);
    }

    return review;
  }

  adjustWearVerdict(summaryId: string, dto: AdjustWearVerdictDto): ReportAuditEntry {
    if (!dto.evidenceNote?.trim() || !dto.notifyTenant) {
      throw new BadRequestException("evidenceNote and tenant notification are required.");
    }

    const auditEntry = this.repository.adjustWearVerdict(summaryId, dto);
    if (!auditEntry) {
      throw new NotFoundException(`Moveout record not found: ${summaryId}/${dto.recordItemId}`);
    }

    return auditEntry;
  }

  getReportAudit(summaryId: string): ReportAuditEntry[] {
    return this.repository.getReportAudit(summaryId);
  }

  adjustDeduction(summaryId: string, dto: AdjustDeductionDto): SettlementEstimate {
    const current = this.getSettlement(summaryId);
    if (!current.deductions.some((deduction) => deduction.id === dto.deductionId)) {
      throw new NotFoundException(`Deduction not found: ${summaryId}/${dto.deductionId}`);
    }

    const settlement = this.repository.adjustDeduction(summaryId, dto);
    if (!settlement) {
      throw new NotFoundException(`Moveout settlement not found: ${summaryId}`);
    }

    return settlement;
  }

  completeReview(summaryId: string, dto: CompleteReviewDto): ManagerSettlementReview {
    const review = this.getManagerSettlementReview(summaryId);
    if (!dto.acknowledgeEvidence) {
      throw new BadRequestException("Evidence acknowledgement is required.");
    }

    if (!review.gate.canComplete && !(dto.overrideSla && review.gate.slaBreached)) {
      throw new BadRequestException({
        canComplete: false,
        blockingReasons: review.gate.blockingReasons,
        slaBreached: review.gate.slaBreached,
        overrideAvailable: review.gate.overrideAvailable,
      });
    }

    const completed = this.repository.completeReview(summaryId);
    if (!completed) {
      throw new NotFoundException(`Moveout settlement review not found: ${summaryId}`);
    }

    return completed;
  }

  respondDispute(summaryId: string, dto: RespondDisputeDto): Dispute {
    const dispute = this.repository.respondDispute(summaryId, dto);
    if (!dispute) {
      throw new NotFoundException(`Dispute not found: ${summaryId}/${dto.disputeId}`);
    }

    return dispute;
  }
}
