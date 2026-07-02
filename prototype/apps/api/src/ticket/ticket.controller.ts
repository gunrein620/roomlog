import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type {
  DefectAnalysis,
  ManagerQueueSummary,
  OnsiteApprovalStatus,
  RepairJob,
  RepairStage,
  Ticket,
  TicketDisposition,
  TicketStatus,
  Urgency,
  VendorQuoteType,
} from "@roomlog/types";
import type { CreateTicketDto, TicketListOptions } from "./ticket.repository";
import { TicketService } from "./ticket.service";

interface UpdateTicketStatusDto {
  status?: TicketStatus;
}

interface UpdateTicketDispositionDto {
  disposition?: TicketDisposition;
  reason?: string;
}

interface UpdateRepairQuoteRequestDto {
  quoteType?: VendorQuoteType;
  quoteAmount?: number;
  quoteItems?: RepairJob["quoteItems"];
  quoteNote?: string;
}

interface UpdateRepairStageRequestDto {
  stage?: RepairStage;
  onsiteQuoteAmount?: number;
  onsiteApproval?: OnsiteApprovalStatus;
  completionNote?: string;
  finalAmount?: number;
}

const TICKET_STATUSES: TicketStatus[] = [
  "received",
  "reviewing",
  "info_requested",
  "processing",
  "resolved",
  "reopened",
];
const TICKET_DISPOSITIONS: TicketDisposition[] = ["open", "on_hold", "rejected"];
const REPAIR_STAGES: RepairStage[] = [
  "vendor_assigned",
  "quoted",
  "scheduled",
  "in_progress",
  "completed",
  "paid",
];
const VENDOR_QUOTE_TYPES: VendorQuoteType[] = ["numeric", "visit", "decline"];
const ONSITE_APPROVAL_STATUSES: OnsiteApprovalStatus[] = [
  "pending",
  "approved",
  "rejected",
];
const URGENCIES: Urgency[] = [1, 2, 3, 4];

@Controller("tickets")
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Get()
  listTickets(
    @Query("status") status?: string,
    @Query("urgency") urgency?: string,
    @Query("disposition") disposition?: string,
    @Query("sort") sort?: string,
    @Query("order") order?: string,
  ): Ticket[] {
    return this.ticketService.listTickets({
      status: status ? this.parseTicketStatus(status) : undefined,
      urgency: urgency ? this.parseUrgency(urgency) : undefined,
      disposition: disposition ? this.parseTicketDisposition(disposition) : undefined,
      sort: sort ? this.parseSort(sort) : undefined,
      order: order ? this.parseOrder(order) : undefined,
    });
  }

  @Get("summary")
  getManagerQueueSummary(): ManagerQueueSummary {
    return this.ticketService.getManagerQueueSummary();
  }

  @Get("vendor/jobs")
  listVendorRepairJobs(@Query("vendor") vendor?: string): RepairJob[] {
    return this.ticketService.listVendorRepairJobs(vendor);
  }

  @Get(":id")
  getTicket(@Param("id") id: string): Ticket {
    return this.ticketService.getTicket(id);
  }

  @Get(":id/analysis")
  getAnalysis(@Param("id") id: string): DefectAnalysis {
    return this.ticketService.getAnalysis(id);
  }

  @Get(":id/repair")
  getRepair(@Param("id") id: string): RepairJob {
    return this.ticketService.getRepair(id);
  }

  @Patch(":id/repair/quote")
  updateRepairQuote(
    @Param("id") id: string,
    @Body() dto: UpdateRepairQuoteRequestDto,
  ): RepairJob {
    if (!dto.quoteType) {
      throw new BadRequestException("quoteType is required.");
    }

    return this.ticketService.updateRepairQuote(id, {
      quoteType: this.parseVendorQuoteType(dto.quoteType),
      quoteAmount: dto.quoteAmount,
      quoteItems: dto.quoteItems,
      quoteNote: dto.quoteNote,
    });
  }

  @Patch(":id/repair/stage")
  updateRepairStage(
    @Param("id") id: string,
    @Body() dto: UpdateRepairStageRequestDto,
  ): RepairJob {
    if (
      dto.stage === undefined &&
      dto.onsiteQuoteAmount === undefined &&
      dto.onsiteApproval === undefined &&
      dto.completionNote === undefined &&
      dto.finalAmount === undefined
    ) {
      throw new BadRequestException("repair stage update body is required.");
    }

    return this.ticketService.updateRepairStage(id, {
      stage: dto.stage ? this.parseRepairStage(dto.stage) : undefined,
      onsiteQuoteAmount: dto.onsiteQuoteAmount,
      onsiteApproval: dto.onsiteApproval
        ? this.parseOnsiteApprovalStatus(dto.onsiteApproval)
        : undefined,
      completionNote: dto.completionNote,
      finalAmount: dto.finalAmount,
    });
  }

  @Post()
  createTicket(@Body() dto: CreateTicketDto): Ticket {
    return this.ticketService.createTicket(dto);
  }

  @Patch(":id/status")
  updateTicketStatus(@Param("id") id: string, @Body() dto: UpdateTicketStatusDto): Ticket {
    if (!dto.status) {
      throw new BadRequestException("status is required.");
    }

    return this.ticketService.updateTicketStatus(id, this.parseTicketStatus(dto.status));
  }

  @Patch(":id/disposition")
  updateTicketDisposition(
    @Param("id") id: string,
    @Body() dto: UpdateTicketDispositionDto,
  ): Ticket {
    if (!dto.disposition) {
      throw new BadRequestException("disposition is required.");
    }

    return this.ticketService.updateTicketDisposition(
      id,
      this.parseTicketDisposition(dto.disposition),
      dto.reason,
    );
  }

  private parseTicketStatus(value: string): TicketStatus {
    if (TICKET_STATUSES.includes(value as TicketStatus)) {
      return value as TicketStatus;
    }

    throw new BadRequestException(`Invalid ticket status: ${value}`);
  }

  private parseTicketDisposition(value: string): TicketDisposition {
    if (TICKET_DISPOSITIONS.includes(value as TicketDisposition)) {
      return value as TicketDisposition;
    }

    throw new BadRequestException(`Invalid ticket disposition: ${value}`);
  }

  private parseRepairStage(value: string): RepairStage {
    if (REPAIR_STAGES.includes(value as RepairStage)) {
      return value as RepairStage;
    }

    throw new BadRequestException(`Invalid repair stage: ${value}`);
  }

  private parseVendorQuoteType(value: string): VendorQuoteType {
    if (VENDOR_QUOTE_TYPES.includes(value as VendorQuoteType)) {
      return value as VendorQuoteType;
    }

    throw new BadRequestException(`Invalid vendor quote type: ${value}`);
  }

  private parseOnsiteApprovalStatus(value: string): OnsiteApprovalStatus {
    if (ONSITE_APPROVAL_STATUSES.includes(value as OnsiteApprovalStatus)) {
      return value as OnsiteApprovalStatus;
    }

    throw new BadRequestException(`Invalid onsite approval status: ${value}`);
  }

  private parseUrgency(value: string): Urgency {
    const urgency = Number(value);
    if (URGENCIES.includes(urgency as Urgency)) {
      return urgency as Urgency;
    }

    throw new BadRequestException(`Invalid ticket urgency: ${value}`);
  }

  private parseSort(value: string): TicketListOptions["sort"] {
    if (value === "urgency") {
      return value;
    }

    throw new BadRequestException(`Invalid ticket sort: ${value}`);
  }

  private parseOrder(value: string): TicketListOptions["order"] {
    if (value === "asc" || value === "desc") {
      return value;
    }

    throw new BadRequestException(`Invalid ticket order: ${value}`);
  }
}
