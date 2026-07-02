import { Injectable } from "@nestjs/common";
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

export interface CreateTicketDto {
  title: string;
  description: string;
  unitId: string;
  urgency: Urgency;
  location?: string;
  occurredAt?: string;
}

export interface TicketListOptions {
  status?: TicketStatus;
  urgency?: Urgency;
  disposition?: TicketDisposition;
  sort?: "urgency";
  order?: "asc" | "desc";
}

export interface UpdateRepairQuoteDto {
  quoteType: VendorQuoteType;
  quoteAmount?: number;
  quoteItems?: RepairJob["quoteItems"];
  quoteNote?: string;
}

export interface UpdateRepairStageDto {
  stage?: RepairStage;
  onsiteQuoteAmount?: number;
  onsiteApproval?: OnsiteApprovalStatus;
  completionNote?: string;
  finalAmount?: number;
}

export abstract class TicketRepository {
  abstract listTickets(options?: TicketListOptions): Ticket[];
  abstract listVendorRepairJobs(vendorName?: string): RepairJob[];
  abstract getTicket(id: string): Ticket | undefined;
  abstract getAnalysis(ticketId: string): DefectAnalysis | undefined;
  abstract getRepair(ticketId: string): RepairJob | undefined;
  abstract createTicket(dto: CreateTicketDto): Ticket;
  abstract getManagerQueueSummary(): ManagerQueueSummary;
  abstract updateTicketStatus(id: string, status: TicketStatus): Ticket | undefined;
  abstract updateTicketDisposition(
    id: string,
    disposition: TicketDisposition,
    reason?: string,
  ): Ticket | undefined;
  abstract updateRepairQuote(
    ticketId: string,
    dto: UpdateRepairQuoteDto,
  ): RepairJob | undefined;
  abstract updateRepairStage(
    ticketId: string,
    dto: UpdateRepairStageDto,
  ): RepairJob | undefined;
}

const DEMO_TICKET: Ticket = {
  id: "tk_0001",
  type: "defect",
  unitId: "302",
  title: "에어컨 물샘",
  description: "거실 에어컨에서 물이 새요. 어제 저녁부터 바닥에 물이 고입니다.",
  location: "거실",
  occurredAt: "2026-06-29T20:00:00+09:00",
  status: "processing",
  urgency: 2,
  createdAt: "2026-06-30T09:00:00+09:00",
  updatedAt: "2026-06-30T10:00:00+09:00",
  analysisId: "an_0001",
  repairJobId: "rj_0001",
};

const DEMO_ANALYSIS: DefectAnalysis = {
  id: "an_0001",
  ticketId: "tk_0001",
  problemCandidates: ["에어컨 배수관 막힘/누수"],
  urgency: 2,
  responsibility: "tenant_likely",
  reasoning: [
    "배수 호스 연결부 결로/누수 패턴과 유사",
    "필터 청소 미흡 시 발생하는 전형적 증상",
  ],
  confidence: 0.71,
  safetyRisk: false,
  moveinComparisonAvailable: false,
  createdAt: "2026-06-30T09:05:00+09:00",
};

const DEMO_REPAIR: RepairJob = {
  id: "rj_0001",
  ticketId: "tk_0001",
  stage: "in_progress",
  vendorName: "○○냉난방",
  quoteAmount: 80000,
  quoteItems: [
    { label: "출장·점검", amount: 30000 },
    { label: "배수관 보수", amount: 50000 },
  ],
  quoteType: "numeric",
  scheduledAt: "2026-06-30T10:00:00+09:00",
};

const MANAGER_DEMO_TICKETS: Ticket[] = [
  {
    id: "tk_0002",
    type: "defect",
    unitId: "804",
    title: "욕실 천장 누수",
    description: "욕실 환풍구 주변에서 물방울이 떨어지고 천장 얼룩이 커지고 있습니다.",
    location: "욕실",
    occurredAt: "2026-07-02T07:30:00+09:00",
    status: "received",
    urgency: 1,
    createdAt: "2026-07-02T08:10:00+09:00",
    updatedAt: "2026-07-02T08:10:00+09:00",
    disposition: "open",
    repairJobId: "rj_0002",
  },
  {
    id: "tk_0003",
    type: "complaint",
    unitId: "1201",
    title: "공용 현관 도어락 오작동",
    description: "퇴근 시간대에 현관 도어락이 여러 번 열리지 않았습니다.",
    location: "1층 현관",
    occurredAt: "2026-07-01T19:20:00+09:00",
    status: "reviewing",
    urgency: 2,
    createdAt: "2026-07-01T19:45:00+09:00",
    updatedAt: "2026-07-02T09:20:00+09:00",
    disposition: "on_hold",
    dispositionReason: "관리실 출입 로그 확인 대기",
  },
  {
    id: "tk_0004",
    type: "defect",
    unitId: "502",
    title: "싱크대 배수구 역류",
    description: "설거지 후 배수구에서 악취와 함께 물이 역류합니다.",
    location: "주방",
    occurredAt: "2026-07-01T21:00:00+09:00",
    status: "processing",
    urgency: 1,
    createdAt: "2026-07-01T21:15:00+09:00",
    updatedAt: "2026-07-02T10:30:00+09:00",
    repairJobId: "rj_0004",
    disposition: "open",
  },
  {
    id: "tk_0005",
    type: "complaint",
    unitId: "301",
    title: "택배 분실 문의",
    description: "배송 완료 알림을 받았지만 보관함에서 택배를 찾을 수 없습니다.",
    location: "무인 택배함",
    occurredAt: "2026-06-30T16:00:00+09:00",
    status: "info_requested",
    urgency: 4,
    createdAt: "2026-06-30T16:20:00+09:00",
    updatedAt: "2026-07-01T11:00:00+09:00",
    disposition: "rejected",
    dispositionReason: "배송사 오배송 확인으로 건물 관리 범위 밖",
  },
];

const MANAGER_DEMO_REPAIRS: RepairJob[] = [
  {
    id: "rj_0002",
    ticketId: "tk_0002",
    stage: "vendor_assigned",
    vendorName: "빠른배관",
  },
  {
    id: "rj_0004",
    ticketId: "tk_0004",
    stage: "completed",
    vendorName: "빠른배관",
    quoteAmount: 120000,
    quoteItems: [
      { label: "배수관 세척", amount: 70000 },
      { label: "트랩 교체", amount: 50000 },
    ],
    scheduledAt: "2026-07-02T13:00:00+09:00",
  },
];

@Injectable()
export class InMemoryTicketRepository implements TicketRepository {
  private readonly tickets = new Map<string, Ticket>();
  private readonly analysesByTicketId = new Map<string, DefectAnalysis>();
  private readonly repairsByTicketId = new Map<string, RepairJob>();

  constructor() {
    this.tickets.set(DEMO_TICKET.id, DEMO_TICKET);
    this.analysesByTicketId.set(DEMO_ANALYSIS.ticketId, DEMO_ANALYSIS);
    this.repairsByTicketId.set(DEMO_REPAIR.ticketId, DEMO_REPAIR);
    for (const ticket of MANAGER_DEMO_TICKETS) {
      this.tickets.set(ticket.id, ticket);
    }
    for (const repair of MANAGER_DEMO_REPAIRS) {
      this.repairsByTicketId.set(repair.ticketId, repair);
    }
  }

  listTickets(options: TicketListOptions = {}): Ticket[] {
    const tickets = Array.from(this.tickets.values()).filter((ticket) => {
      const disposition = ticket.disposition ?? "open";

      return (
        (!options.status || ticket.status === options.status) &&
        (!options.urgency || ticket.urgency === options.urgency) &&
        (!options.disposition || disposition === options.disposition)
      );
    });

    if (options.sort === "urgency") {
      const direction = options.order === "desc" ? -1 : 1;
      return tickets.sort((left, right) => (left.urgency - right.urgency) * direction);
    }

    return tickets;
  }

  listVendorRepairJobs(vendorName?: string): RepairJob[] {
    const normalizedVendorName = vendorName?.trim();
    return Array.from(this.repairsByTicketId.values()).filter(
      (repair) => !normalizedVendorName || repair.vendorName === normalizedVendorName,
    );
  }

  getTicket(id: string): Ticket | undefined {
    return this.tickets.get(id);
  }

  getAnalysis(ticketId: string): DefectAnalysis | undefined {
    return this.analysesByTicketId.get(ticketId);
  }

  getRepair(ticketId: string): RepairJob | undefined {
    return this.repairsByTicketId.get(ticketId);
  }

  createTicket(dto: CreateTicketDto): Ticket {
    const now = new Date().toISOString();
    const ticket: Ticket = {
      id: this.createTicketId(),
      type: "defect",
      unitId: dto.unitId,
      title: dto.title,
      description: dto.description,
      location: dto.location,
      occurredAt: dto.occurredAt,
      status: "received",
      urgency: dto.urgency,
      createdAt: now,
      updatedAt: now,
    };

    this.tickets.set(ticket.id, ticket);
    return ticket;
  }

  getManagerQueueSummary(): ManagerQueueSummary {
    const activeTickets = Array.from(this.tickets.values()).filter(
      (ticket) => (ticket.disposition ?? "open") !== "rejected" && ticket.status !== "resolved",
    );

    return {
      today: activeTickets.filter((ticket) => this.isToday(ticket.createdAt)).length,
      urgent: activeTickets.filter((ticket) => ticket.urgency === 1).length,
      awaitingReview: activeTickets.filter((ticket) =>
        ["received", "reviewing"].includes(ticket.status),
      ).length,
      awaitingPayment: activeTickets.filter((ticket) => {
        const repair = ticket.repairJobId ? this.repairsByTicketId.get(ticket.id) : undefined;
        return repair?.stage === "completed";
      }).length,
      onHold: activeTickets.filter((ticket) => ticket.disposition === "on_hold").length,
      total: activeTickets.length,
    };
  }

  updateTicketStatus(id: string, status: TicketStatus): Ticket | undefined {
    const ticket = this.tickets.get(id);
    if (!ticket) {
      return undefined;
    }

    const updatedTicket = {
      ...ticket,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.tickets.set(id, updatedTicket);

    return updatedTicket;
  }

  updateTicketDisposition(
    id: string,
    disposition: TicketDisposition,
    reason?: string,
  ): Ticket | undefined {
    const ticket = this.tickets.get(id);
    if (!ticket) {
      return undefined;
    }

    const updatedTicket = {
      ...ticket,
      disposition,
      dispositionReason: reason,
      updatedAt: new Date().toISOString(),
    };
    this.tickets.set(id, updatedTicket);

    return updatedTicket;
  }

  updateRepairQuote(ticketId: string, dto: UpdateRepairQuoteDto): RepairJob | undefined {
    const repair = this.repairsByTicketId.get(ticketId);
    if (!repair) {
      return undefined;
    }

    const updatedRepair: RepairJob = {
      ...repair,
      stage: "quoted",
      quoteType: dto.quoteType,
      quoteAmount: dto.quoteAmount,
      quoteItems: dto.quoteItems,
      quoteNote: dto.quoteNote,
    };
    this.repairsByTicketId.set(ticketId, updatedRepair);

    return updatedRepair;
  }

  updateRepairStage(ticketId: string, dto: UpdateRepairStageDto): RepairJob | undefined {
    const repair = this.repairsByTicketId.get(ticketId);
    if (!repair) {
      return undefined;
    }

    const updatedRepair: RepairJob = {
      ...repair,
      ...dto,
    };
    this.repairsByTicketId.set(ticketId, updatedRepair);

    return updatedRepair;
  }

  private createTicketId(): string {
    return `tk_${Date.now().toString(36)}`;
  }

  private isToday(isoDate: string): boolean {
    return new Date(isoDate).toDateString() === new Date().toDateString();
  }
}
