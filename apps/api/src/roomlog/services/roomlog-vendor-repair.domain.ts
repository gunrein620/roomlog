// 업체 수리(vendor-repair) 도메인 협력 클래스 — roomlog.service.ts에서 추출(동작 불변).
// 코어 뮤테이터(transitionTicket/addMessageInternal/pushHistory 등)는 RoomlogService에 잔류·주입(동명 필드 → 본문 verbatim).
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { now } from "../roomlog-support";
import type {
  AddVendorRepairMessageInput,
  AiAnalysis,
  ApproveRepairEstimateInput,
  Complaint,
  RepairRequest,
  RepairStatus,
  ReportCompletionInput,
  ScheduleRepairInput,
  SubmitEstimateInput,
  Ticket,
  TicketMessage,
  TicketStatus
} from "../roomlog.types";
import type { Store } from "../roomlog.service";

export class RoomlogVendorRepairDomain {
  constructor(
    private readonly store: Store,
    private readonly persistStore: () => void,
    private readonly findTicket: (ticketId: string) => Ticket,
    private readonly findComplaint: (complaintId: string) => Complaint,
    private readonly findRepair: (repairId: string) => RepairRequest,
    private readonly transitionTicket: (
      ticketId: string,
      toStatus: TicketStatus,
      changedByUserId: string,
      note?: string
    ) => Ticket,
    private readonly addMessageInternal: (
      ticketId: string,
      complaintId: string | undefined,
      senderUserId: string,
      senderRole: TicketMessage["senderRole"],
      messageText: string,
      attachmentUrls?: string[]
    ) => TicketMessage,
    private readonly pushHistory: (
      ticketId: string,
      changedByUserId: string,
      fromStatus: TicketStatus | undefined,
      toStatus: TicketStatus,
      note?: string
    ) => void,
    private readonly assertRepairStatus: (repair: RepairRequest, allowed: RepairStatus[], action: string) => void,
    private readonly assertManagerCanAccessTicket: (managerId: string, ticket: Ticket) => void,
    private readonly presentTicketMessage: (message: TicketMessage) => TicketMessage
  ) {}

  listVendorRepairs(vendorUserOrProfileId: string) {
    const vendor = this.resolveVendor(vendorUserOrProfileId);

    return this.store.repairs
      .filter((repair) => repair.vendorId === vendor.id)
      .map((repair) => this.presentRepairForVendor(repair));
  }

  getVendorRepair(vendorUserOrProfileId: string, repairId: string) {
    const vendor = this.resolveVendor(vendorUserOrProfileId);
    const repair = this.store.repairs.find(
      (item) => item.id === repairId && item.vendorId === vendor.id
    );

    if (!repair) {
      throw new NotFoundException("수리 요청을 찾을 수 없습니다.");
    }

    return this.presentRepairForVendor(repair);
  }

  submitEstimate(vendorUserOrProfileId: string, repairId: string, input: SubmitEstimateInput) {
    const repair = this.findVendorRepair(vendorUserOrProfileId, repairId);
    this.assertRepairStatus(repair, ["REQUESTED", "ACCEPTED"], "견적 제출");
    const estimateAmount = Number(input.estimateAmount);
    const estimateDescription = input.estimateDescription?.trim();

    if (!Number.isFinite(estimateAmount) || estimateAmount <= 0) {
      throw new BadRequestException("견적 금액을 올바르게 입력해주세요.");
    }

    if (!estimateDescription) {
      throw new BadRequestException("견적 설명을 입력해주세요.");
    }

    repair.estimateAmount = estimateAmount;
    repair.estimateDescription = estimateDescription;
    repair.status = "ESTIMATE_SUBMITTED";
    repair.updatedAt = now();
    this.transitionTicket(repair.ticketId, "ESTIMATE_REVIEW", repair.vendorId, "견적 제출");
    this.persistStore();

    return repair;
  }

  approveRepairEstimate(
    managerId: string,
    repairId: string,
    input: ApproveRepairEstimateInput
  ) {
    const repair = this.findRepair(repairId);
    const ticket = this.findTicket(repair.ticketId);
    this.assertManagerCanAccessTicket(managerId, ticket);
    this.assertRepairStatus(repair, ["ESTIMATE_SUBMITTED"], "견적 승인");

    if (!["LANDLORD", "TENANT", "PENDING"].includes(input.costBearer)) {
      throw new BadRequestException("비용 주체를 선택해주세요.");
    }

    repair.status = "ESTIMATE_APPROVED";
    repair.costBearer = input.costBearer;
    repair.estimateApprovalNote = input.note?.trim() || this.costBearerLabel(input.costBearer);
    repair.estimateApprovedAt = now();
    repair.updatedAt = now();
    ticket.updatedAt = now();
    this.pushHistory(
      ticket.id,
      managerId,
      ticket.status,
      ticket.status,
      `견적 승인: ${this.costBearerLabel(input.costBearer)}`
    );
    this.addMessageInternal(
      ticket.id,
      ticket.complaintId,
      managerId,
      "LANDLORD",
      [
        `견적을 승인했습니다. 비용 주체: ${this.costBearerLabel(input.costBearer)}.`,
        repair.estimateAmount ? `승인 금액: ${repair.estimateAmount.toLocaleString()}원.` : "",
        repair.estimateApprovalNote ? `관리자 메모: ${repair.estimateApprovalNote}` : "",
        "업체가 방문 일정을 확정하면 이 티켓에서 다시 안내드리겠습니다."
      ]
        .filter(Boolean)
        .join("\n")
    );
    this.persistStore();

    return repair;
  }

  scheduleRepair(vendorUserOrProfileId: string, repairId: string, input: ScheduleRepairInput) {
    const repair = this.findVendorRepair(vendorUserOrProfileId, repairId);
    this.assertRepairStatus(repair, ["ESTIMATE_APPROVED"], "방문 일정 저장");
    const scheduledAt = input.scheduledAt?.trim();

    if (!scheduledAt) {
      throw new BadRequestException("방문 일정을 입력해주세요.");
    }

    repair.scheduledAt = input.scheduledAt;
    repair.status = "SCHEDULED";
    repair.updatedAt = now();
    this.transitionTicket(repair.ticketId, "REPAIR_IN_PROGRESS", repair.vendorId, "방문 일정 확정");
    const ticket = this.findTicket(repair.ticketId);
    const vendor = this.resolveVendor(vendorUserOrProfileId);
    this.addMessageInternal(
      ticket.id,
      ticket.complaintId,
      vendor.userId,
      "VENDOR",
      [
        `방문 일정이 확정되었습니다: ${scheduledAt}.`,
        repair.costBearer ? `비용 주체: ${this.costBearerLabel(repair.costBearer)}.` : "",
        "방문 전 문제 부위 주변을 정리해주시고, 추가로 보이는 증상이 있으면 이 티켓에 남겨주세요."
      ]
        .filter(Boolean)
        .join("\n")
    );
    this.persistStore();

    return repair;
  }

  reportCompletion(vendorUserOrProfileId: string, repairId: string, input: ReportCompletionInput) {
    const repair = this.findVendorRepair(vendorUserOrProfileId, repairId);
    this.assertRepairStatus(repair, ["SCHEDULED", "IN_PROGRESS"], "완료 보고");
    repair.status = "COMPLETION_REPORTED";
    repair.completedAt = now();
    repair.completionNote = input.completionNote;
    repair.completionPhotoUrls = input.completionPhotoUrls ?? [];
    repair.updatedAt = now();
    this.transitionTicket(repair.ticketId, "COMPLETION_REPORTED", repair.vendorId, "완료 보고");
    this.persistStore();

    return repair;
  }

  addVendorRepairMessage(
    vendorUserOrProfileId: string,
    repairId: string,
    input: AddVendorRepairMessageInput
  ) {
    const repair = this.findVendorRepair(vendorUserOrProfileId, repairId);
    const vendor = this.resolveVendor(vendorUserOrProfileId);
    const ticket = this.findTicket(repair.ticketId);
    const messageText = input.messageText?.trim() ?? "";
    const attachmentUrls = input.attachmentUrls ?? [];

    if (!messageText && attachmentUrls.length === 0) {
      throw new BadRequestException("업체 메시지 또는 사진이 필요합니다.");
    }

    const message = this.addMessageInternal(
      ticket.id,
      ticket.complaintId,
      vendor.userId,
      "VENDOR",
      messageText || "업체 사진을 첨부했습니다.",
      attachmentUrls
    );
    ticket.updatedAt = now();
    repair.updatedAt = now();
    this.persistStore();

    return {
      message: this.presentTicketMessage(message),
      repair: this.presentRepairForVendor(repair),
      ticket: this.presentTicketForVendor(ticket, repair)
    };
  }

  private resolveVendor(vendorUserOrProfileId: string) {
    const vendor = this.store.vendors.find(
      (item) => item.id === vendorUserOrProfileId || item.userId === vendorUserOrProfileId
    );

    if (!vendor) {
      throw new NotFoundException("협력업체를 찾을 수 없습니다.");
    }

    return vendor;
  }

  private findVendorRepair(vendorUserOrProfileId: string, repairId: string) {
    const vendor = this.resolveVendor(vendorUserOrProfileId);
    const repair = this.store.repairs.find(
      (item) => item.id === repairId && item.vendorId === vendor.id
    );

    if (!repair) {
      throw new NotFoundException("수리 요청을 찾을 수 없습니다.");
    }

    return repair;
  }

  private presentRepairForVendor(repair: RepairRequest) {
    const ticket = this.findTicket(repair.ticketId);
    const complaint = this.findComplaint(ticket.complaintId);

    return {
      ...repair,
      managerRequestText: repair.description,
      visitMemo: complaint.availableTimes,
      ticket: this.presentTicketForVendor(ticket, repair)
    };
  }

  private presentTicketForVendor(ticket: Ticket, repair: RepairRequest) {
    const complaint = this.findComplaint(ticket.complaintId);
    const room = this.store.rooms.find((item) => item.id === ticket.roomId);
    const analysis = this.store.analyses[ticket.id];
    const attachmentUrls = this.vendorComplaintAttachmentUrls(ticket, analysis);

    if (!analysis) {
      throw new NotFoundException("AI 분석을 찾을 수 없습니다.");
    }

    return {
      id: ticket.id,
      complaintId: ticket.complaintId,
      status: ticket.status,
      category: ticket.category,
      priority: ticket.priority,
      responsibilityHint: ticket.responsibilityHint,
      dueAt: ticket.dueAt,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      managerRequestText: repair.description,
      visitMemo: complaint.availableTimes,
      attachmentUrls,
      complaint: {
        id: complaint.id,
        ticketId: complaint.ticketId,
        sourceChannel: complaint.sourceChannel,
        title: complaint.title,
        description: complaint.description,
        category: ticket.category,
        location: complaint.location,
        occurredAt: complaint.occurredAt,
        availableTimes: complaint.availableTimes,
        status: complaint.status,
        createdAt: complaint.createdAt,
        updatedAt: complaint.updatedAt,
        attachmentUrls,
        visitMemo: complaint.availableTimes
      },
      room: room
        ? {
            buildingName: room.buildingName,
            roomNo: room.roomNo
          }
        : undefined,
      analysis: this.presentAnalysisForVendor(analysis),
      assignedVendor: this.presentAssignedVendorForVendor(ticket.assignedVendorId),
      repairs: [{ ...repair, completionPhotoUrls: [...repair.completionPhotoUrls] }]
    };
  }

  private presentAnalysisForVendor(analysis: AiAnalysis) {
    return {
      category: analysis.category,
      detailCategory: analysis.detailCategory,
      priority: analysis.priority,
      responsibilityHint: analysis.responsibilityHint,
      confidenceScore: analysis.confidenceScore,
      photoAnalysis: analysis.photoAnalysis
        ? {
            attachmentUrls: [...analysis.photoAnalysis.attachmentUrls],
            candidates: [...analysis.photoAnalysis.candidates],
            comparisonStatus: analysis.photoAnalysis.comparisonStatus,
            summary: analysis.photoAnalysis.summary,
            evidence: [...analysis.photoAnalysis.evidence],
            recommendedRetake: analysis.photoAnalysis.recommendedRetake
          }
        : undefined
    };
  }

  private presentAssignedVendorForVendor(vendorId?: string) {
    const vendor = vendorId
      ? this.store.vendors.find((item) => item.id === vendorId)
      : undefined;

    return vendor
      ? {
          businessName: vendor.businessName
        }
      : undefined;
  }

  private vendorComplaintAttachmentUrls(ticket: Ticket, analysis?: AiAnalysis) {
    return Array.from(
      new Set([
        ...(analysis?.photoAnalysis?.attachmentUrls ?? []),
        ...this.store.messages
          .filter((message) => message.ticketId === ticket.id && message.senderRole === "TENANT")
          .flatMap((message) => message.attachmentUrls)
      ])
    );
  }

  private costBearerLabel(costBearer: "LANDLORD" | "TENANT" | "PENDING") {
    const labels = {
      LANDLORD: "임대인 부담",
      TENANT: "임차인 부담 가능성",
      PENDING: "비용 주체 판단 대기"
    };

    return labels[costBearer];
  }
}
