import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  DefectAnalysis,
  ManagerQueueSummary,
  RepairJob,
  RepairStage,
  Ticket,
  TicketDisposition,
  TicketStatus,
} from "@roomlog/types";
import type {
  CreateTicketDto,
  TicketListOptions,
  UpdateRepairQuoteDto,
  UpdateRepairStageDto,
} from "./ticket.repository";
import { TicketRepository } from "./ticket.repository";

const ALLOWED_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  received: ["reviewing", "info_requested", "processing"],
  reviewing: ["info_requested", "processing", "resolved"],
  info_requested: ["reviewing", "processing"],
  processing: ["info_requested", "resolved"],
  resolved: ["reopened"],
  reopened: ["reviewing", "processing"],
};

const ALLOWED_REPAIR_STAGE_TRANSITIONS: Record<RepairStage, RepairStage[]> = {
  vendor_assigned: ["quoted"],
  quoted: ["scheduled"],
  scheduled: ["in_progress"],
  in_progress: ["completed"],
  completed: ["paid"],
  paid: [],
};

@Injectable()
export class TicketService {
  constructor(private readonly repository: TicketRepository) {}

  listTickets(options?: TicketListOptions): Ticket[] {
    return this.repository.listTickets(options);
  }

  listVendorRepairJobs(vendorName?: string): RepairJob[] {
    return this.repository.listVendorRepairJobs(vendorName);
  }

  getTicket(id: string): Ticket {
    const ticket = this.repository.getTicket(id);
    if (!ticket) {
      throw new NotFoundException(`Ticket not found: ${id}`);
    }

    return ticket;
  }

  getAnalysis(ticketId: string): DefectAnalysis {
    const analysis = this.repository.getAnalysis(ticketId);
    if (!analysis) {
      throw new NotFoundException(`Ticket analysis not found: ${ticketId}`);
    }

    return analysis;
  }

  getRepair(ticketId: string): RepairJob {
    const repair = this.repository.getRepair(ticketId);
    if (!repair) {
      throw new NotFoundException(`Ticket repair not found: ${ticketId}`);
    }

    return repair;
  }

  createTicket(dto: CreateTicketDto): Ticket {
    return this.repository.createTicket(dto);
  }

  getManagerQueueSummary(): ManagerQueueSummary {
    return this.repository.getManagerQueueSummary();
  }

  updateTicketStatus(id: string, status: TicketStatus): Ticket {
    const ticket = this.getTicket(id);
    if (!this.canTransition(ticket.status, status)) {
      throw new BadRequestException(
        `Invalid ticket status transition: ${ticket.status} -> ${status}`,
      );
    }

    const updatedTicket = this.repository.updateTicketStatus(id, status);
    if (!updatedTicket) {
      throw new NotFoundException(`Ticket not found: ${id}`);
    }

    return updatedTicket;
  }

  updateTicketDisposition(
    id: string,
    disposition: TicketDisposition,
    reason?: string,
  ): Ticket {
    const normalizedReason = reason?.trim() || undefined;
    if (disposition === "rejected" && !normalizedReason) {
      throw new BadRequestException("Rejected tickets require a disposition reason.");
    }

    const updatedTicket = this.repository.updateTicketDisposition(
      id,
      disposition,
      disposition === "open" ? undefined : normalizedReason,
    );
    if (!updatedTicket) {
      throw new NotFoundException(`Ticket not found: ${id}`);
    }

    return updatedTicket;
  }

  updateRepairQuote(id: string, dto: UpdateRepairQuoteDto): RepairJob {
    const repair = this.getRepair(id);
    if (!this.canTransitionRepairStage(repair.stage, "quoted")) {
      throw new BadRequestException(
        `Invalid repair stage transition: ${repair.stage} -> quoted`,
      );
    }

    this.validateRepairQuote(dto);
    const updatedRepair = this.repository.updateRepairQuote(id, {
      ...dto,
      quoteNote: dto.quoteNote?.trim() || undefined,
    });
    if (!updatedRepair) {
      throw new NotFoundException(`Ticket repair not found: ${id}`);
    }

    return updatedRepair;
  }

  updateRepairStage(id: string, dto: UpdateRepairStageDto): RepairJob {
    const repair = this.getRepair(id);
    if (dto.stage && !this.canTransitionRepairStage(repair.stage, dto.stage)) {
      throw new BadRequestException(
        `Invalid repair stage transition: ${repair.stage} -> ${dto.stage}`,
      );
    }

    this.validateRepairStageUpdate(repair, dto);
    const updatedRepair = this.repository.updateRepairStage(id, {
      ...dto,
      completionNote: dto.completionNote?.trim() || undefined,
    });
    if (!updatedRepair) {
      throw new NotFoundException(`Ticket repair not found: ${id}`);
    }

    return updatedRepair;
  }

  private canTransition(current: TicketStatus, next: TicketStatus): boolean {
    return current === next || ALLOWED_STATUS_TRANSITIONS[current].includes(next);
  }

  private canTransitionRepairStage(current: RepairStage, next: RepairStage): boolean {
    return current === next || ALLOWED_REPAIR_STAGE_TRANSITIONS[current].includes(next);
  }

  private validateRepairQuote(dto: UpdateRepairQuoteDto): void {
    if (dto.quoteType === "numeric" && !this.isValidMoney(dto.quoteAmount)) {
      throw new BadRequestException("numeric quote requires quoteAmount.");
    }

    if (dto.quoteType === "decline" && !dto.quoteNote?.trim()) {
      throw new BadRequestException("decline quote requires quoteNote.");
    }

    if (dto.quoteAmount !== undefined && !this.isValidMoney(dto.quoteAmount)) {
      throw new BadRequestException("quoteAmount must be a non-negative number.");
    }

    if (dto.quoteItems) {
      for (const item of dto.quoteItems) {
        if (!item.label?.trim() || !this.isValidMoney(item.amount)) {
          throw new BadRequestException("quoteItems must include label and non-negative amount.");
        }
      }
    }
  }

  private validateRepairStageUpdate(repair: RepairJob, dto: UpdateRepairStageDto): void {
    if (
      dto.onsiteQuoteAmount !== undefined &&
      !this.isValidMoney(dto.onsiteQuoteAmount)
    ) {
      throw new BadRequestException("onsiteQuoteAmount must be a non-negative number.");
    }

    if (dto.finalAmount !== undefined && !this.isValidMoney(dto.finalAmount)) {
      throw new BadRequestException("finalAmount must be a non-negative number.");
    }

    if (dto.stage === "in_progress") {
      const approval = dto.onsiteApproval ?? repair.onsiteApproval;
      if (repair.quoteType === "visit" && approval !== "approved") {
        throw new BadRequestException("visit quotes require approved onsiteApproval before start.");
      }
    }
  }

  private isValidMoney(value: number | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  }
}
