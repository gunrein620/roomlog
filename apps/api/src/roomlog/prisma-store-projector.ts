import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Store, StoreProjector } from "./roomlog.service";
import { IntakeDraft, PhotoAnalysis, TicketMessage } from "./roomlog.types";
import type {
  ContractDeletionState as PrismaContractDeletionState,
  ContractDocumentOrigin as PrismaContractDocumentOrigin,
  ContractLifecycle as PrismaContractLifecycle,
  ContractReview as PrismaContractReview,
  ContractValueSource as PrismaContractValueSource,
  CostAttributionScope as PrismaCostAttributionScope,
  CostReviewReason as PrismaCostReviewReason,
  CostStatus as PrismaCostStatus,
  CostType as PrismaCostType,
  DisclosureState as PrismaDisclosureState,
  MessagingAnnouncementCategory as PrismaMessagingAnnouncementCategory,
  MessagingAnnouncementDraftStatus as PrismaMessagingAnnouncementDraftStatus,
  MessagingAnnouncementReadState as PrismaMessagingAnnouncementReadState,
  MessagingAnnouncementScope as PrismaMessagingAnnouncementScope,
  MessagingMessageKind as PrismaMessagingMessageKind,
  MessagingMessageSender as PrismaMessagingMessageSender,
  MessagingThreadContext as PrismaMessagingThreadContext,
  MoveoutChecklistCondition as PrismaMoveoutChecklistCondition,
  MoveoutDeductionKind as PrismaMoveoutDeductionKind,
  MoveoutDisputeStatus as PrismaMoveoutDisputeStatus,
  MoveoutRecordSource as PrismaMoveoutRecordSource,
  MoveoutSettlementStatus as PrismaMoveoutSettlementStatus,
  MoveoutWearAdjustmentAction as PrismaMoveoutWearAdjustmentAction,
  MoveoutWearVerdict as PrismaMoveoutWearVerdict,
  ReceiptSource as PrismaReceiptSource,
  RepairPaymentState as PrismaRepairPaymentState
} from "@prisma/client";

function asDate(value?: string) {
  return value ? new Date(value) : undefined;
}

function asIso(value?: Date | null) {
  return value?.toISOString();
}

function asJson<T>(value: T) {
  return value as Prisma.InputJsonValue;
}

function optional<T>(value: T | null | undefined) {
  return value ?? undefined;
}

function toLowerEnum<T extends string>(value: string | null | undefined) {
  return optional(value?.toLowerCase()) as T | undefined;
}

function toUpperEnum<T extends string>(value: string | null | undefined) {
  return optional(value?.toUpperCase()) as T | undefined;
}

function asPhotoAnalysis(value: Prisma.JsonValue | null): PhotoAnalysis | undefined {
  return value ? (value as unknown as PhotoAnalysis) : undefined;
}

function actorRoleFor(store: Store, userId: string) {
  return store.users.find((user) => user.id === userId)?.role ?? "SYSTEM";
}

function stableMoveoutDisputeEventId(disputeId: string, status: string, at: string) {
  return `${disputeId}_${status}_${at}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 180);
}

export class PrismaStoreProjector implements StoreProjector {
  private readonly prisma: PrismaClient;

  constructor(databaseUrl: string) {
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    this.prisma = new PrismaClient({ adapter });
  }

  async load(): Promise<Store | undefined> {
    const [
      users,
      rooms,
      tenantRooms,
      vendors,
      vendorInvites,
      tenantInvites,
      contracts,
      contractDocuments,
      contractExtractions,
      contractPrivacies,
      contractInvites,
      attachments,
      floorPlans,
      moveInChecklist,
      intakeSessions,
      complaints,
      tickets,
      feedback,
      repairs,
      costs,
      receipts,
      receiptOcrs,
      messages,
      messagingThreads,
      messagingMessages,
      messagingAnnouncementDrafts,
      messagingAnnouncements,
      messagingAnnouncementDeliveries,
      moveouts,
      moveoutRecords,
      moveoutChecklist,
      moveoutSettlements,
      moveoutDeductions,
      moveoutDisputes,
      moveoutReportAudits,
      history,
      analyses
    ] = await Promise.all([
      this.prisma.userAccount.findMany(),
      this.prisma.room.findMany(),
      this.prisma.tenantRoom.findMany(),
      this.prisma.vendorProfile.findMany(),
      this.prisma.vendorInvite.findMany(),
      this.prisma.tenantInvite.findMany(),
      this.prisma.contract.findMany(),
      this.prisma.contractDocument.findMany(),
      this.prisma.contractExtraction.findMany(),
      this.prisma.contractPrivacy.findMany(),
      this.prisma.contractInvite.findMany(),
      this.prisma.attachment.findMany(),
      this.prisma.floorPlan.findMany(),
      this.prisma.moveInChecklistItem.findMany(),
      this.prisma.intakeSession.findMany({
        include: { messages: { orderBy: { createdAt: "asc" } } }
      }),
      this.prisma.complaint.findMany(),
      this.prisma.ticket.findMany(),
      this.prisma.aiFeedback.findMany(),
      this.prisma.repairRequest.findMany(),
      this.prisma.cost.findMany(),
      this.prisma.receipt.findMany(),
      this.prisma.receiptOcr.findMany(),
      this.prisma.ticketMessage.findMany(),
      this.prisma.messagingThread.findMany(),
      this.prisma.messagingMessage.findMany(),
      this.prisma.messagingAnnouncementDraft.findMany(),
      this.prisma.messagingAnnouncement.findMany(),
      this.prisma.messagingAnnouncementDelivery.findMany(),
      this.prisma.moveoutRequest.findMany(),
      this.prisma.moveoutRecord.findMany(),
      this.prisma.moveoutChecklistItem.findMany(),
      this.prisma.moveoutSettlement.findMany(),
      this.prisma.moveoutDeduction.findMany(),
      this.prisma.moveoutDispute.findMany({
        include: { history: { orderBy: { createdAt: "asc" } } }
      }),
      this.prisma.moveoutReportAuditEntry.findMany(),
      this.prisma.statusHistory.findMany(),
      this.prisma.aiAnalysis.findMany()
    ]);

    if (
      !users.length &&
      !rooms.length &&
      !contracts.length &&
      !floorPlans.length &&
      !intakeSessions.length &&
      !complaints.length &&
      !tickets.length &&
      !costs.length &&
      !receipts.length &&
      !messagingThreads.length &&
      !messagingAnnouncements.length &&
      !moveouts.length
    ) {
      return undefined;
    }

    return {
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        name: user.name,
        phone: optional(user.phone),
        role: user.role,
        status: user.status,
        createdAt: asIso(user.createdAt) ?? new Date().toISOString()
      })),
      rooms: rooms.map((room) => ({
        id: room.id,
        buildingName: room.buildingName,
        roomNo: room.roomNo,
        address: room.address,
        landlordId: optional(room.landlordId)
      })),
      tenantRooms: Object.fromEntries(
        tenantRooms.map((tenantRoom) => [tenantRoom.tenantId, tenantRoom.roomId])
      ),
      vendors: vendors.map((vendor) => ({
        id: vendor.id,
        userId: vendor.userId,
        businessName: vendor.businessName,
        contactPerson: vendor.contactPerson,
        phone: vendor.phone,
        serviceArea: vendor.serviceArea,
        activeJobs: vendor.activeJobs
      })),
      vendorInvites: vendorInvites.map((invite) => ({
        id: invite.id,
        inviteToken: invite.inviteToken,
        invitedByManagerId: invite.invitedByManagerId,
        email: optional(invite.email),
        businessName: invite.businessName,
        contactPerson: invite.contactPerson,
        phone: invite.phone,
        serviceArea: invite.serviceArea,
        status: invite.status,
        signupUrl: invite.signupUrl,
        createdAt: asIso(invite.createdAt) ?? new Date().toISOString(),
        acceptedAt: asIso(invite.acceptedAt),
        acceptedByUserId: optional(invite.acceptedByUserId)
      })),
      tenantInvites: tenantInvites.map((invite) => ({
        id: invite.id,
        inviteToken: invite.inviteToken,
        invitedByManagerId: invite.invitedByManagerId,
        roomId: invite.roomId,
        email: optional(invite.email),
        tenantName: invite.tenantName,
        phone: optional(invite.phone),
        moveInDate: asIso(invite.moveInDate),
        status: invite.status,
        signupUrl: invite.signupUrl,
        createdAt: asIso(invite.createdAt) ?? new Date().toISOString(),
        acceptedAt: asIso(invite.acceptedAt),
        acceptedByUserId: optional(invite.acceptedByUserId)
      })),
      contracts: contracts.map((contract) => ({
        id: contract.id,
        roomId: contract.roomId,
        tenantId: optional(contract.tenantId),
        managerId: optional(contract.managerId),
        unitId: contract.unitId,
        landlordName: contract.landlordName,
        lifecycle: toLowerEnum<Store["contracts"][number]["lifecycle"]>(contract.lifecycle) ?? "active",
        review: toLowerEnum<Store["contracts"][number]["review"]>(contract.review) ?? "pending",
        deletion: toLowerEnum<Store["contracts"][number]["deletion"]>(contract.deletion) ?? "none",
        valueSource: toLowerEnum<Store["contracts"][number]["valueSource"]>(contract.valueSource) ?? "unverified",
        monthlyRent: optional(contract.monthlyRent),
        maintenanceFee: optional(contract.maintenanceFee),
        paymentDay: optional(contract.paymentDay),
        startDate: asIso(contract.startDate),
        endDate: asIso(contract.endDate),
        createdAt: asIso(contract.createdAt) ?? new Date().toISOString(),
        updatedAt: asIso(contract.updatedAt) ?? new Date().toISOString(),
        extractionId: optional(contract.extractionId),
        documentId: optional(contract.documentId),
        confirmedAt: asIso(contract.confirmedAt),
        confirmedByManagerId: optional(contract.confirmedByManagerId)
      })),
      contractDocuments: contractDocuments.map((document) => ({
        id: document.id,
        contractId: document.contractId,
        uploadedByUserId: optional(document.uploadedByUserId),
        origin: toLowerEnum<Store["contractDocuments"][number]["origin"]>(document.origin) ?? "manual",
        fileName: optional(document.fileName),
        fileUrl: optional(document.fileUrl),
        uploadedAt: asIso(document.uploadedAt) ?? new Date().toISOString()
      })),
      contractExtractions: contractExtractions.map((extraction) => ({
        id: extraction.id,
        contractId: extraction.contractId,
        confirmed: extraction.confirmed,
        highlights: extraction.highlights,
        items: (extraction.items as unknown as Store["contractExtractions"][number]["items"]) ?? [],
        helpNotes: (extraction.helpNotes as unknown as Store["contractExtractions"][number]["helpNotes"]) ?? [],
        createdAt: asIso(extraction.createdAt) ?? new Date().toISOString()
      })),
      contractPrivacies: contractPrivacies.map((privacy) => ({
        contractId: privacy.contractId,
        maskingEnabled: privacy.maskingEnabled,
        retention: (privacy.retention as unknown as Store["contractPrivacies"][number]["retention"]) ?? [],
        forwardingConsent: privacy.forwardingConsent,
        deletion: toLowerEnum<Store["contractPrivacies"][number]["deletion"]>(privacy.deletion) ?? "none",
        deletionSlaHours: optional(privacy.deletionSlaHours),
        deletable: privacy.deletable
      })),
      contractInvites: contractInvites.map((invite) => ({
        id: invite.id,
        contractId: invite.contractId,
        roomId: invite.roomId,
        inviteToken: invite.inviteToken,
        invitedByManagerId: invite.invitedByManagerId,
        tenantName: invite.tenantName,
        email: optional(invite.email),
        phone: optional(invite.phone),
        state: invite.state as Store["contractInvites"][number]["state"],
        signupUrl: invite.signupUrl,
        audit: invite.audit,
        createdAt: asIso(invite.createdAt) ?? new Date().toISOString(),
        acceptedAt: asIso(invite.acceptedAt),
        acceptedByUserId: optional(invite.acceptedByUserId)
      })),
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        uploadedByUserId: attachment.uploadedBy,
        category: attachment.category,
        fileName: attachment.fileName,
        fileUrl: attachment.fileUrl,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        createdAt: asIso(attachment.createdAt) ?? new Date().toISOString()
      })),
      floorPlans: floorPlans.map((floorPlan) => ({
        id: floorPlan.id,
        ownerId: floorPlan.ownerId,
        sourceAttachmentId: optional(floorPlan.sourceAttachmentId),
        sourceImageUrl: optional(floorPlan.sourceImageUrl),
        status: floorPlan.status,
        pixelToMmRatio: floorPlan.pixelToMmRatio,
        walls: floorPlan.walls as any,
        hiddenWallIds: floorPlan.hiddenWallIds,
        furnitures: floorPlan.furnitures as any,
        room3d: floorPlan.room3d as any,
        extractionMeta: (floorPlan.extractionMeta as any) ?? { scaleConfirmed: false },
        openings: (floorPlan.openings as any) ?? [],
        fixtures: (floorPlan.fixtures as any) ?? [],
        createdAt: asIso(floorPlan.createdAt) ?? new Date().toISOString(),
        updatedAt: asIso(floorPlan.updatedAt) ?? new Date().toISOString()
      })),
      moveInChecklist: moveInChecklist.map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        roomId: item.roomId,
        area: item.area,
        itemName: item.itemName,
        memo: optional(item.memo),
        guidance: item.guidance,
        attachmentUrls: item.attachmentUrls,
        createdAt: asIso(item.createdAt) ?? new Date().toISOString(),
        updatedAt: asIso(item.updatedAt) ?? new Date().toISOString()
      })),
      aiFeedback: feedback.map((item) => ({
        id: item.id,
        ticketId: item.ticketId,
        complaintId: item.complaintId,
        tenantId: item.tenantId,
        target: item.target,
        targetLabel: item.targetLabel,
        originalValue: item.originalValue,
        reason: item.reason,
        requestedAction: optional(item.requestedAction),
        attachmentUrls: item.attachmentUrls,
        status: item.status,
        managerReviewNote: optional(item.managerReviewNote),
        correctedValue: optional(item.correctedValue),
        reviewedByUserId: optional(item.reviewedByUserId),
        reviewedAt: asIso(item.reviewedAt),
        createdAt: asIso(item.createdAt) ?? new Date().toISOString(),
        updatedAt: asIso(item.updatedAt) ?? new Date().toISOString()
      })),
      intakeSessions: intakeSessions.map((session) => ({
        id: session.id,
        tenantId: session.tenantId,
        roomId: session.roomId,
        sourceChannel: session.sourceChannel,
        status: session.status,
        draft: session.draft as unknown as IntakeDraft,
        messages: session.messages.map((message) => ({
          id: message.id,
          sessionId: message.sessionId,
          sender: message.sender as "TENANT" | "AI_ASSISTANT" | "SYSTEM",
          messageText: message.messageText,
          transcriptText: optional(message.transcriptText),
          attachmentUrls: message.attachmentUrls,
          inputMode: message.inputMode,
          realtimeEventId: optional(message.realtimeEventId),
          createdAt: asIso(message.createdAt) ?? new Date().toISOString()
        })),
        complaintId: optional(session.complaintId),
        ticketId: optional(session.ticketId),
        createdAt: asIso(session.createdAt) ?? new Date().toISOString(),
        updatedAt: asIso(session.updatedAt) ?? new Date().toISOString(),
        finalizedAt: asIso(session.finalizedAt)
      })),
      complaints: complaints.map((complaint) => ({
        id: complaint.id,
        tenantId: complaint.tenantId,
        roomId: complaint.roomId,
        ticketId: complaint.ticketId,
        sourceChannel: complaint.sourceChannel,
        title: complaint.title,
        description: complaint.description,
        location: complaint.location,
        occurredAt: asIso(complaint.occurredAt),
        availableTimes: optional(complaint.availableTimes),
        status: complaint.status,
        createdAt: asIso(complaint.createdAt) ?? new Date().toISOString(),
        updatedAt: asIso(complaint.updatedAt) ?? new Date().toISOString()
      })),
      analyses: Object.fromEntries(
        analyses.map((analysis) => [
          analysis.ticketId,
          {
            summary: analysis.summary,
            category: analysis.category,
            detailCategory: optional(analysis.detailCategory),
            priority: analysis.priority,
            responsibilityHint: analysis.responsibilityHint as Store["analyses"][string]["responsibilityHint"],
            confidenceScore: analysis.confidenceScore,
            reasons: analysis.reasons,
            recommendedAction: analysis.recommendedAction,
            photoAnalysis: asPhotoAnalysis(analysis.photoAnalysis)
          }
        ])
      ),
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        complaintId: ticket.complaintId,
        tenantId: ticket.tenantId,
        roomId: ticket.roomId,
        assignedVendorId: optional(ticket.assignedVendorId),
        sourceChannel: ticket.sourceChannel,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        responsibilityHint: ticket.responsibilityHint,
        aiSummary: ticket.aiSummary,
        dueAt: asIso(ticket.dueAt),
        createdAt: asIso(ticket.createdAt) ?? new Date().toISOString(),
        updatedAt: asIso(ticket.updatedAt) ?? new Date().toISOString()
      })),
      repairs: repairs.map((repair) => ({
        id: repair.id,
        ticketId: repair.ticketId,
        vendorId: repair.vendorId,
        status: repair.status,
        title: repair.title,
        description: repair.description,
        estimateAmount: optional(repair.estimateAmount),
        estimateDescription: optional(repair.estimateDescription),
        costBearer: optional(repair.costBearer),
        estimateApprovedAt: asIso(repair.estimateApprovedAt),
        estimateApprovalNote: optional(repair.estimateApprovalNote),
        scheduledAt: asIso(repair.scheduledAt),
        completedAt: asIso(repair.completedAt),
        completionNote: optional(repair.completionNote),
        completionPhotoUrls: repair.completionPhotoUrls,
        createdAt: asIso(repair.createdAt) ?? new Date().toISOString(),
        updatedAt: asIso(repair.updatedAt) ?? new Date().toISOString()
      })),
      costs: costs.map((cost) => ({
        id: cost.id,
        managerId: optional(cost.managerId),
        date: asIso(cost.date) ?? new Date().toISOString(),
        item: cost.item,
        amount: cost.amount,
        type: toLowerEnum<Store["costs"][number]["type"]>(cost.type) ?? "other",
        scope: toLowerEnum<Store["costs"][number]["scope"]>(cost.scope) ?? "building",
        unitId: optional(cost.unitId),
        status: toLowerEnum<Store["costs"][number]["status"]>(cost.status) ?? "draft",
        verified: cost.verified,
        reviewReason: toLowerEnum<NonNullable<Store["costs"][number]["reviewReason"]>>(
          cost.reviewReason
        ),
        disclosure: toLowerEnum<NonNullable<Store["costs"][number]["disclosure"]>>(
          cost.disclosure
        ),
        repairPayment: toLowerEnum<NonNullable<Store["costs"][number]["repairPayment"]>>(
          cost.repairPayment
        ),
        paymentRef: optional(cost.paymentRef),
        receiptId: optional(cost.receiptId),
        supersedesId: optional(cost.supersedesId),
        voidReason: optional(cost.voidReason),
        createdAt: asIso(cost.createdAt) ?? new Date().toISOString(),
        updatedAt: asIso(cost.updatedAt) ?? new Date().toISOString()
      })),
      receipts: receipts.map((receipt) => ({
        id: receipt.id,
        managerId: optional(receipt.managerId),
        source: toLowerEnum<Store["receipts"][number]["source"]>(receipt.source) ?? "manual",
        imageUrl: optional(receipt.imageUrl),
        hasEvidence: receipt.hasEvidence,
        uploadedAt: asIso(receipt.uploadedAt) ?? new Date().toISOString(),
        duplicateOfId: optional(receipt.duplicateOfId)
      })),
      receiptOcrs: receiptOcrs.map((ocr) => ({
        id: ocr.id,
        receiptId: ocr.receiptId,
        costId: optional(ocr.costId),
        fields: {
          item: {
            value: ocr.itemValue,
            confidence: ocr.itemConfidence,
            needsReview: ocr.itemNeedsReview
          },
          date: {
            value: ocr.dateValue,
            confidence: ocr.dateConfidence,
            needsReview: ocr.dateNeedsReview
          },
          amount: {
            value: ocr.amountValue,
            confidence: ocr.amountConfidence,
            needsReview: ocr.amountNeedsReview
          },
          unitId: ocr.unitIdValue
            ? {
                value: ocr.unitIdValue,
                confidence: ocr.unitIdConfidence ?? 1,
                needsReview: ocr.unitIdNeedsReview ?? false
              }
            : undefined
        },
        suggestedType: toLowerEnum<NonNullable<Store["receiptOcrs"][number]["suggestedType"]>>(
          ocr.suggestedType
        ),
        typeConfidence: optional(ocr.typeConfidence),
        lineItems: (ocr.lineItems as unknown as Store["receiptOcrs"][number]["lineItems"]) ?? [],
        createdAt: asIso(ocr.createdAt) ?? new Date().toISOString()
      })),
      messages: messages.map((message) => ({
        id: message.id,
        ticketId: message.ticketId,
        complaintId: optional(message.complaintId),
        repairId: optional(message.repairId),
        senderUserId: message.senderUserId,
        senderRole: message.senderRole,
        messageText: message.messageText,
        attachmentUrls: message.attachmentUrls,
        createdAt: asIso(message.createdAt) ?? new Date().toISOString()
      }) as TicketMessage & { repairId?: string }),
      messagingThreads: messagingThreads.map((thread) => ({
        id: thread.id,
        roomId: thread.roomId,
        unitId: thread.unitId,
        tenantId: thread.tenantId,
        context:
          toLowerEnum<Store["messagingThreads"][number]["context"]>(thread.context) ?? "general",
        contextRef: optional(thread.contextRef),
        contextLabel: optional(thread.contextLabel),
        lastMessage: thread.lastMessage,
        unreadCount: thread.unreadCount,
        pendingRequest: thread.pendingRequest,
        archivedNotice: thread.archivedNotice,
        createdAt: asIso(thread.createdAt) ?? new Date().toISOString(),
        updatedAt: asIso(thread.updatedAt) ?? new Date().toISOString()
      })),
      messagingMessages: messagingMessages.map((message) => ({
        id: message.id,
        threadId: message.threadId,
        senderUserId: message.senderUserId,
        sender: toLowerEnum<Store["messagingMessages"][number]["sender"]>(message.sender) ?? "tenant",
        kind: toLowerEnum<Store["messagingMessages"][number]["kind"]>(message.kind) ?? "text",
        body: message.body,
        originalBody: optional(message.originalBody),
        attachmentUrls: message.attachmentUrls,
        createdAt: asIso(message.createdAt) ?? new Date().toISOString()
      })),
      messagingAnnouncementDrafts: messagingAnnouncementDrafts.map((draft) => ({
        id: draft.id,
        category:
          toLowerEnum<Store["messagingAnnouncementDrafts"][number]["category"]>(draft.category) ??
          "life",
        scope:
          toLowerEnum<Store["messagingAnnouncementDrafts"][number]["scope"]>(draft.scope) ??
          "building",
        targetLabel: draft.targetLabel,
        targetRoomIds: draft.targetRoomIds,
        title: draft.title,
        body: draft.body,
        translations:
          (draft.translations as unknown as Store["messagingAnnouncementDrafts"][number]["translations"]) ??
          [],
        confirmRequired: draft.confirmRequired,
        status:
          toLowerEnum<Store["messagingAnnouncementDrafts"][number]["status"]>(draft.status) ??
          "draft",
        createdByManagerId: draft.createdByManagerId,
        createdAt: asIso(draft.createdAt) ?? new Date().toISOString(),
        updatedAt: asIso(draft.updatedAt) ?? new Date().toISOString()
      })),
      messagingAnnouncements: messagingAnnouncements.map((announcement) => ({
        id: announcement.id,
        draftId: optional(announcement.draftId),
        category:
          toLowerEnum<Store["messagingAnnouncements"][number]["category"]>(
            announcement.category
          ) ?? "life",
        scope:
          toLowerEnum<Store["messagingAnnouncements"][number]["scope"]>(announcement.scope) ??
          "building",
        targetLabel: announcement.targetLabel,
        title: announcement.title,
        body: announcement.body,
        originalBody: optional(announcement.originalBody),
        sender: announcement.sender,
        senderId: announcement.senderId,
        sentAt: asIso(announcement.sentAt) ?? new Date().toISOString(),
        confirmRequired: announcement.confirmRequired,
        safetyCta: optional(announcement.safetyCta)
      })),
      messagingAnnouncementDeliveries: messagingAnnouncementDeliveries.map((delivery) => ({
        id: delivery.id,
        announcementId: delivery.announcementId,
        tenantId: delivery.tenantId,
        roomId: delivery.roomId,
        unitId: delivery.unitId,
        tenantName: delivery.tenantName,
        preferredLang: delivery.preferredLang,
        state:
          toLowerEnum<Store["messagingAnnouncementDeliveries"][number]["state"]>(
            delivery.state
          ) ?? "unread",
        readAt: asIso(delivery.readAt),
        confirmedAt: asIso(delivery.confirmedAt),
        failed: delivery.failed
      })),
      moveouts: moveouts.map((moveout) => ({
        id: moveout.id,
        tenantId: moveout.tenantId,
        roomId: moveout.roomId,
        contractId: optional(moveout.contractId),
        unitId: moveout.unitId,
        contractConfirmed:
          Boolean(moveout.contractId) &&
          contracts.some((contract) => contract.id === moveout.contractId && contract.review === "CONFIRMED"),
        leaseEndDate: asIso(moveout.leaseEndDate),
        daysRemaining: undefined,
        depositAmount: optional(moveout.depositAmount),
        estimatedRefundMin: optional(moveout.estimatedRefundMin),
        estimatedRefundMax: optional(moveout.estimatedRefundMax),
        settlementStatus:
          toLowerEnum<Store["moveouts"][number]["settlementStatus"]>(moveout.settlementStatus) ??
          "estimate",
        prepProgress: moveout.prepProgress,
        settlementId: optional(
          moveoutSettlements.find((settlement) => settlement.moveoutId === moveout.id)?.id
        ),
        messagingThreadId: optional(moveout.messagingThreadId),
        createdAt: asIso(moveout.createdAt) ?? new Date().toISOString(),
        updatedAt: asIso(moveout.updatedAt) ?? new Date().toISOString()
      })),
      moveoutRecords: moveoutRecords.map((record) => ({
        id: record.id,
        summaryId: record.moveoutId,
        source:
          toLowerEnum<Store["moveoutRecords"][number]["source"]>(record.source) ?? "chat",
        title: record.title,
        description: record.description,
        occurredAt: asIso(record.occurredAt),
        wearVerdict: toLowerEnum<NonNullable<Store["moveoutRecords"][number]["wearVerdict"]>>(
          record.wearVerdict
        ),
        wearNote: optional(record.wearNote),
        moveinComparisonAvailable: record.moveinComparisonAvailable
      })),
      moveoutChecklist: moveoutChecklist.map((item) => ({
        id: item.id,
        summaryId: item.moveoutId,
        label: item.label,
        present: item.present,
        condition:
          toLowerEnum<Store["moveoutChecklist"][number]["condition"]>(item.condition) ??
          "normal",
        note: optional(item.note)
      })),
      moveoutSettlements: moveoutSettlements.map((settlement) => ({
        id: settlement.id,
        summaryId: settlement.moveoutId,
        depositAmount: settlement.depositAmount,
        deductions: [],
        refundMin: settlement.refundMin,
        refundMax: settlement.refundMax,
        status:
          toLowerEnum<Store["moveoutSettlements"][number]["status"]>(settlement.status) ??
          "estimate",
        disclaimer: settlement.disclaimer,
        createdAt: asIso(settlement.createdAt) ?? new Date().toISOString(),
        updatedAt: asIso(settlement.updatedAt)
      })),
      moveoutDeductions: moveoutDeductions.map((deduction) => ({
        id: deduction.id,
        summaryId: deduction.moveoutId,
        kind:
          toLowerEnum<Store["moveoutDeductions"][number]["kind"]>(deduction.kind) ??
          "repair",
        label: deduction.label,
        estimatedMin: deduction.estimatedMin,
        estimatedMax: deduction.estimatedMax,
        needsConfirmation: deduction.needsConfirmation,
        evidenceNote: deduction.evidenceNote,
        source:
          toLowerEnum<Store["moveoutDeductions"][number]["source"]>(deduction.source) ??
          "repair"
      })),
      moveoutDisputes: moveoutDisputes.map((dispute) => ({
        id: dispute.id,
        summaryId: dispute.moveoutId,
        targetItemId: optional(dispute.targetItemId),
        targetLabel: dispute.targetLabel,
        reason: dispute.reason,
        status:
          toLowerEnum<Store["moveoutDisputes"][number]["status"]>(dispute.status) ??
          "received",
        slaDeadline: asIso(dispute.slaDeadline) ?? new Date().toISOString(),
        slaBreached: dispute.slaBreached,
        managerResponse: optional(dispute.managerResponse),
        messagingThreadId: optional(dispute.messagingThreadId),
        history: dispute.history.map((event) => ({
          id: event.id,
          status:
            toLowerEnum<Store["moveoutDisputes"][number]["history"][number]["status"]>(
              event.status
            ) ?? "received",
          at: asIso(event.createdAt) ?? new Date().toISOString(),
          note: optional(event.note),
          actorUserId: optional(event.actorUserId)
        })),
        createdAt: asIso(dispute.createdAt) ?? new Date().toISOString(),
        updatedAt: asIso(dispute.updatedAt) ?? new Date().toISOString()
      })),
      moveoutReportAudits: moveoutReportAudits.map((audit) => ({
        id: audit.id,
        summaryId: audit.moveoutId,
        recordItemId: audit.recordItemId,
        action:
          toLowerEnum<Store["moveoutReportAudits"][number]["action"]>(audit.action) ??
          "keep",
        fromVerdict: toLowerEnum<NonNullable<Store["moveoutReportAudits"][number]["fromVerdict"]>>(
          audit.fromVerdict
        ),
        toVerdict: toLowerEnum<NonNullable<Store["moveoutReportAudits"][number]["toVerdict"]>>(
          audit.toVerdict
        ),
        evidenceNote: audit.evidenceNote,
        tenantNotified: audit.tenantNotified,
        managerName: audit.managerName,
        managerId: audit.managerId,
        at: asIso(audit.createdAt) ?? new Date().toISOString()
      })),
      history: history.map((item) => ({
        id: item.id,
        ticketId: item.ticketId,
        changedByUserId: item.actorUserId,
        fromStatus: item.fromStatus as Store["history"][number]["fromStatus"],
        toStatus: item.toStatus as Store["history"][number]["toStatus"],
        note: item.note,
        createdAt: asIso(item.createdAt) ?? new Date().toISOString()
      }))
    };
  }

  async persist(store: Store) {
    await this.prisma.$transaction(async (tx) => {
      for (const user of store.users) {
        await tx.userAccount.upsert({
          where: { id: user.id },
          create: {
            id: user.id,
            email: user.email,
            passwordHash: user.passwordHash,
            name: user.name,
            phone: user.phone,
            role: user.role,
            status: user.status,
            createdAt: asDate(user.createdAt)
          },
          update: {
            email: user.email,
            passwordHash: user.passwordHash,
            name: user.name,
            phone: user.phone,
            role: user.role,
            status: user.status
          }
        });
      }

      for (const room of store.rooms) {
        await tx.room.upsert({
          where: { id: room.id },
          create: {
            id: room.id,
            buildingName: room.buildingName,
            roomNo: room.roomNo,
            address: room.address,
            landlordId: room.landlordId
          },
          update: {
            buildingName: room.buildingName,
            roomNo: room.roomNo,
            address: room.address,
            landlordId: room.landlordId
          }
        });
      }

      for (const [tenantId, roomId] of Object.entries(store.tenantRooms)) {
        await tx.tenantRoom.upsert({
          where: { tenantId_roomId: { tenantId, roomId } },
          create: { tenantId, roomId },
          update: {}
        });
      }

      for (const vendor of store.vendors) {
        await tx.vendorProfile.upsert({
          where: { id: vendor.id },
          create: {
            id: vendor.id,
            userId: vendor.userId,
            businessName: vendor.businessName,
            contactPerson: vendor.contactPerson,
            phone: vendor.phone,
            serviceArea: vendor.serviceArea,
            activeJobs: vendor.activeJobs
          },
          update: {
            userId: vendor.userId,
            businessName: vendor.businessName,
            contactPerson: vendor.contactPerson,
            phone: vendor.phone,
            serviceArea: vendor.serviceArea,
            activeJobs: vendor.activeJobs
          }
        });
      }

      for (const invite of store.vendorInvites) {
        await tx.vendorInvite.upsert({
          where: { id: invite.id },
          create: {
            id: invite.id,
            inviteToken: invite.inviteToken,
            invitedByManagerId: invite.invitedByManagerId,
            email: invite.email,
            businessName: invite.businessName,
            contactPerson: invite.contactPerson,
            phone: invite.phone,
            serviceArea: invite.serviceArea,
            status: invite.status,
            signupUrl: invite.signupUrl,
            createdAt: asDate(invite.createdAt),
            acceptedAt: asDate(invite.acceptedAt),
            acceptedByUserId: invite.acceptedByUserId
          },
          update: {
            invitedByManagerId: invite.invitedByManagerId,
            email: invite.email,
            businessName: invite.businessName,
            contactPerson: invite.contactPerson,
            phone: invite.phone,
            serviceArea: invite.serviceArea,
            status: invite.status,
            signupUrl: invite.signupUrl,
            acceptedAt: asDate(invite.acceptedAt),
            acceptedByUserId: invite.acceptedByUserId
          }
        });
      }

      for (const invite of store.tenantInvites) {
        await tx.tenantInvite.upsert({
          where: { id: invite.id },
          create: {
            id: invite.id,
            inviteToken: invite.inviteToken,
            invitedByManagerId: invite.invitedByManagerId,
            roomId: invite.roomId,
            email: invite.email,
            tenantName: invite.tenantName,
            phone: invite.phone,
            moveInDate: asDate(invite.moveInDate),
            status: invite.status,
            signupUrl: invite.signupUrl,
            createdAt: asDate(invite.createdAt),
            acceptedAt: asDate(invite.acceptedAt),
            acceptedByUserId: invite.acceptedByUserId
          },
          update: {
            invitedByManagerId: invite.invitedByManagerId,
            roomId: invite.roomId,
            email: invite.email,
            tenantName: invite.tenantName,
            phone: invite.phone,
            moveInDate: asDate(invite.moveInDate),
            status: invite.status,
            signupUrl: invite.signupUrl,
            acceptedAt: asDate(invite.acceptedAt),
            acceptedByUserId: invite.acceptedByUserId
          }
        });
      }

      for (const contract of store.contracts) {
        await tx.contract.upsert({
          where: { id: contract.id },
          create: {
            id: contract.id,
            roomId: contract.roomId,
            tenantId: contract.tenantId,
            managerId: contract.managerId,
            unitId: contract.unitId,
            landlordName: contract.landlordName,
            lifecycle: toUpperEnum<PrismaContractLifecycle>(contract.lifecycle) ?? "ACTIVE",
            review: toUpperEnum<PrismaContractReview>(contract.review) ?? "PENDING",
            deletion: toUpperEnum<PrismaContractDeletionState>(contract.deletion) ?? "NONE",
            valueSource: toUpperEnum<PrismaContractValueSource>(contract.valueSource) ?? "UNVERIFIED",
            monthlyRent: contract.monthlyRent,
            maintenanceFee: contract.maintenanceFee,
            paymentDay: contract.paymentDay,
            startDate: asDate(contract.startDate),
            endDate: asDate(contract.endDate),
            extractionId: contract.extractionId,
            documentId: contract.documentId,
            confirmedAt: asDate(contract.confirmedAt),
            confirmedByManagerId: contract.confirmedByManagerId,
            createdAt: asDate(contract.createdAt),
            updatedAt: asDate(contract.updatedAt)
          },
          update: {
            roomId: contract.roomId,
            tenantId: contract.tenantId,
            managerId: contract.managerId,
            unitId: contract.unitId,
            landlordName: contract.landlordName,
            lifecycle: toUpperEnum<PrismaContractLifecycle>(contract.lifecycle) ?? "ACTIVE",
            review: toUpperEnum<PrismaContractReview>(contract.review) ?? "PENDING",
            deletion: toUpperEnum<PrismaContractDeletionState>(contract.deletion) ?? "NONE",
            valueSource: toUpperEnum<PrismaContractValueSource>(contract.valueSource) ?? "UNVERIFIED",
            monthlyRent: contract.monthlyRent,
            maintenanceFee: contract.maintenanceFee,
            paymentDay: contract.paymentDay,
            startDate: asDate(contract.startDate),
            endDate: asDate(contract.endDate),
            extractionId: contract.extractionId,
            documentId: contract.documentId,
            confirmedAt: asDate(contract.confirmedAt),
            confirmedByManagerId: contract.confirmedByManagerId,
            updatedAt: asDate(contract.updatedAt)
          }
        });
      }

      for (const document of store.contractDocuments) {
        await tx.contractDocument.upsert({
          where: { id: document.id },
          create: {
            id: document.id,
            contractId: document.contractId,
            uploadedByUserId: document.uploadedByUserId,
            origin: toUpperEnum<PrismaContractDocumentOrigin>(document.origin) ?? "MANUAL",
            fileName: document.fileName,
            fileUrl: document.fileUrl,
            uploadedAt: asDate(document.uploadedAt)
          },
          update: {
            contractId: document.contractId,
            uploadedByUserId: document.uploadedByUserId,
            origin: toUpperEnum<PrismaContractDocumentOrigin>(document.origin) ?? "MANUAL",
            fileName: document.fileName,
            fileUrl: document.fileUrl,
            uploadedAt: asDate(document.uploadedAt)
          }
        });
      }

      for (const extraction of store.contractExtractions) {
        await tx.contractExtraction.upsert({
          where: { id: extraction.id },
          create: {
            id: extraction.id,
            contractId: extraction.contractId,
            confirmed: extraction.confirmed,
            highlights: extraction.highlights,
            items: asJson(extraction.items),
            helpNotes: asJson(extraction.helpNotes),
            createdAt: asDate(extraction.createdAt)
          },
          update: {
            contractId: extraction.contractId,
            confirmed: extraction.confirmed,
            highlights: extraction.highlights,
            items: asJson(extraction.items),
            helpNotes: asJson(extraction.helpNotes)
          }
        });
      }

      for (const privacy of store.contractPrivacies) {
        await tx.contractPrivacy.upsert({
          where: { contractId: privacy.contractId },
          create: {
            contractId: privacy.contractId,
            maskingEnabled: privacy.maskingEnabled,
            retention: asJson(privacy.retention),
            forwardingConsent: privacy.forwardingConsent,
            deletion: toUpperEnum<PrismaContractDeletionState>(privacy.deletion) ?? "NONE",
            deletionSlaHours: privacy.deletionSlaHours,
            deletable: privacy.deletable
          },
          update: {
            maskingEnabled: privacy.maskingEnabled,
            retention: asJson(privacy.retention),
            forwardingConsent: privacy.forwardingConsent,
            deletion: toUpperEnum<PrismaContractDeletionState>(privacy.deletion) ?? "NONE",
            deletionSlaHours: privacy.deletionSlaHours,
            deletable: privacy.deletable
          }
        });
      }

      for (const invite of store.contractInvites) {
        await tx.contractInvite.upsert({
          where: { id: invite.id },
          create: {
            id: invite.id,
            contractId: invite.contractId,
            roomId: invite.roomId,
            inviteToken: invite.inviteToken,
            invitedByManagerId: invite.invitedByManagerId,
            tenantName: invite.tenantName,
            email: invite.email,
            phone: invite.phone,
            state: invite.state,
            signupUrl: invite.signupUrl,
            audit: invite.audit,
            createdAt: asDate(invite.createdAt),
            acceptedAt: asDate(invite.acceptedAt),
            acceptedByUserId: invite.acceptedByUserId
          },
          update: {
            contractId: invite.contractId,
            roomId: invite.roomId,
            invitedByManagerId: invite.invitedByManagerId,
            tenantName: invite.tenantName,
            email: invite.email,
            phone: invite.phone,
            state: invite.state,
            signupUrl: invite.signupUrl,
            audit: invite.audit,
            acceptedAt: asDate(invite.acceptedAt),
            acceptedByUserId: invite.acceptedByUserId
          }
        });
      }

      for (const attachment of store.attachments) {
        await tx.attachment.upsert({
          where: { id: attachment.id },
          create: {
            id: attachment.id,
            uploadedBy: attachment.uploadedByUserId,
            fileName: attachment.fileName,
            fileUrl: attachment.fileUrl,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            category: attachment.category,
            createdAt: asDate(attachment.createdAt)
          },
          update: {
            uploadedBy: attachment.uploadedByUserId,
            fileName: attachment.fileName,
            fileUrl: attachment.fileUrl,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            category: attachment.category
          }
        });
      }

      for (const floorPlan of store.floorPlans) {
        await tx.floorPlan.upsert({
          where: { id: floorPlan.id },
          create: {
            id: floorPlan.id,
            ownerId: floorPlan.ownerId,
            sourceAttachmentId: floorPlan.sourceAttachmentId,
            sourceImageUrl: floorPlan.sourceImageUrl,
            status: floorPlan.status,
            pixelToMmRatio: floorPlan.pixelToMmRatio,
            walls: asJson(floorPlan.walls),
            hiddenWallIds: floorPlan.hiddenWallIds,
            furnitures: asJson(floorPlan.furnitures),
            room3d: asJson(floorPlan.room3d),
            extractionMeta: asJson(floorPlan.extractionMeta),
            openings: asJson(floorPlan.openings),
            fixtures: asJson(floorPlan.fixtures),
            createdAt: asDate(floorPlan.createdAt),
            updatedAt: asDate(floorPlan.updatedAt)
          },
          update: {
            ownerId: floorPlan.ownerId,
            sourceAttachmentId: floorPlan.sourceAttachmentId,
            sourceImageUrl: floorPlan.sourceImageUrl,
            status: floorPlan.status,
            pixelToMmRatio: floorPlan.pixelToMmRatio,
            walls: asJson(floorPlan.walls),
            hiddenWallIds: floorPlan.hiddenWallIds,
            furnitures: asJson(floorPlan.furnitures),
            room3d: asJson(floorPlan.room3d),
            extractionMeta: asJson(floorPlan.extractionMeta),
            openings: asJson(floorPlan.openings),
            fixtures: asJson(floorPlan.fixtures),
            updatedAt: asDate(floorPlan.updatedAt)
          }
        });
      }

      for (const item of store.moveInChecklist) {
        await tx.moveInChecklistItem.upsert({
          where: { id: item.id },
          create: {
            id: item.id,
            tenantId: item.tenantId,
            roomId: item.roomId,
            area: item.area,
            itemName: item.itemName,
            memo: item.memo,
            guidance: item.guidance,
            attachmentUrls: item.attachmentUrls,
            createdAt: asDate(item.createdAt),
            updatedAt: asDate(item.updatedAt)
          },
          update: {
            tenantId: item.tenantId,
            roomId: item.roomId,
            area: item.area,
            itemName: item.itemName,
            memo: item.memo,
            guidance: item.guidance,
            attachmentUrls: item.attachmentUrls,
            updatedAt: asDate(item.updatedAt)
          }
        });
      }

      for (const session of store.intakeSessions) {
        await tx.intakeSession.upsert({
          where: { id: session.id },
          create: {
            id: session.id,
            tenantId: session.tenantId,
            roomId: session.roomId,
            sourceChannel: session.sourceChannel,
            status: session.status,
            draft: asJson(session.draft),
            complaintId: session.complaintId,
            ticketId: session.ticketId,
            finalizedAt: asDate(session.finalizedAt),
            createdAt: asDate(session.createdAt),
            updatedAt: asDate(session.updatedAt)
          },
          update: {
            tenantId: session.tenantId,
            roomId: session.roomId,
            sourceChannel: session.sourceChannel,
            status: session.status,
            draft: asJson(session.draft),
            complaintId: session.complaintId,
            ticketId: session.ticketId,
            finalizedAt: asDate(session.finalizedAt),
            updatedAt: asDate(session.updatedAt)
          }
        });

        for (const message of session.messages) {
          await tx.intakeMessage.upsert({
            where: { id: message.id },
            create: {
              id: message.id,
              sessionId: message.sessionId,
              sender: message.sender,
              messageText: message.messageText,
              transcriptText: message.transcriptText,
              attachmentUrls: message.attachmentUrls,
              inputMode: message.inputMode,
              realtimeEventId: message.realtimeEventId,
              createdAt: asDate(message.createdAt)
            },
            update: {
              sessionId: message.sessionId,
              sender: message.sender,
              messageText: message.messageText,
              transcriptText: message.transcriptText,
              attachmentUrls: message.attachmentUrls,
              inputMode: message.inputMode,
              realtimeEventId: message.realtimeEventId
            }
          });
        }
      }

      for (const complaint of store.complaints) {
        await tx.complaint.upsert({
          where: { id: complaint.id },
          create: {
            id: complaint.id,
            tenantId: complaint.tenantId,
            roomId: complaint.roomId,
            ticketId: complaint.ticketId,
            sourceChannel: complaint.sourceChannel,
            title: complaint.title,
            description: complaint.description,
            location: complaint.location,
            occurredAt: asDate(complaint.occurredAt),
            availableTimes: complaint.availableTimes,
            status: complaint.status,
            createdAt: asDate(complaint.createdAt),
            updatedAt: asDate(complaint.updatedAt)
          },
          update: {
            tenantId: complaint.tenantId,
            roomId: complaint.roomId,
            ticketId: complaint.ticketId,
            sourceChannel: complaint.sourceChannel,
            title: complaint.title,
            description: complaint.description,
            location: complaint.location,
            occurredAt: asDate(complaint.occurredAt),
            availableTimes: complaint.availableTimes,
            status: complaint.status,
            updatedAt: asDate(complaint.updatedAt)
          }
        });
      }

      for (const ticket of store.tickets) {
        await tx.ticket.upsert({
          where: { id: ticket.id },
          create: {
            id: ticket.id,
            complaintId: ticket.complaintId,
            tenantId: ticket.tenantId,
            roomId: ticket.roomId,
            assignedVendorId: ticket.assignedVendorId,
            sourceChannel: ticket.sourceChannel,
            category: ticket.category,
            priority: ticket.priority,
            status: ticket.status,
            responsibilityHint: ticket.responsibilityHint,
            aiSummary: ticket.aiSummary,
            dueAt: asDate(ticket.dueAt),
            createdAt: asDate(ticket.createdAt),
            updatedAt: asDate(ticket.updatedAt)
          },
          update: {
            complaintId: ticket.complaintId,
            tenantId: ticket.tenantId,
            roomId: ticket.roomId,
            assignedVendorId: ticket.assignedVendorId,
            sourceChannel: ticket.sourceChannel,
            category: ticket.category,
            priority: ticket.priority,
            status: ticket.status,
            responsibilityHint: ticket.responsibilityHint,
            aiSummary: ticket.aiSummary,
            dueAt: asDate(ticket.dueAt),
            updatedAt: asDate(ticket.updatedAt)
          }
        });
      }

      for (const feedback of store.aiFeedback) {
        await tx.aiFeedback.upsert({
          where: { id: feedback.id },
          create: {
            id: feedback.id,
            ticketId: feedback.ticketId,
            complaintId: feedback.complaintId,
            tenantId: feedback.tenantId,
            target: feedback.target,
            targetLabel: feedback.targetLabel,
            originalValue: feedback.originalValue,
            reason: feedback.reason,
            requestedAction: feedback.requestedAction,
            attachmentUrls: feedback.attachmentUrls,
            status: feedback.status,
            managerReviewNote: feedback.managerReviewNote,
            correctedValue: feedback.correctedValue,
            reviewedByUserId: feedback.reviewedByUserId,
            reviewedAt: asDate(feedback.reviewedAt),
            createdAt: asDate(feedback.createdAt),
            updatedAt: asDate(feedback.updatedAt)
          },
          update: {
            ticketId: feedback.ticketId,
            complaintId: feedback.complaintId,
            tenantId: feedback.tenantId,
            target: feedback.target,
            targetLabel: feedback.targetLabel,
            originalValue: feedback.originalValue,
            reason: feedback.reason,
            requestedAction: feedback.requestedAction,
            attachmentUrls: feedback.attachmentUrls,
            status: feedback.status,
            managerReviewNote: feedback.managerReviewNote,
            correctedValue: feedback.correctedValue,
            reviewedByUserId: feedback.reviewedByUserId,
            reviewedAt: asDate(feedback.reviewedAt),
            updatedAt: asDate(feedback.updatedAt)
          }
        });
      }

      for (const repair of store.repairs) {
        await tx.repairRequest.upsert({
          where: { id: repair.id },
          create: {
            id: repair.id,
            ticketId: repair.ticketId,
            vendorId: repair.vendorId,
            status: repair.status,
            title: repair.title,
            description: repair.description,
            estimateAmount: repair.estimateAmount,
            estimateDescription: repair.estimateDescription,
            costBearer: repair.costBearer,
            estimateApprovedAt: asDate(repair.estimateApprovedAt),
            estimateApprovalNote: repair.estimateApprovalNote,
            scheduledAt: asDate(repair.scheduledAt),
            completedAt: asDate(repair.completedAt),
            completionNote: repair.completionNote,
            completionPhotoUrls: repair.completionPhotoUrls,
            createdAt: asDate(repair.createdAt),
            updatedAt: asDate(repair.updatedAt)
          },
          update: {
            ticketId: repair.ticketId,
            vendorId: repair.vendorId,
            status: repair.status,
            title: repair.title,
            description: repair.description,
            estimateAmount: repair.estimateAmount,
            estimateDescription: repair.estimateDescription,
            costBearer: repair.costBearer,
            estimateApprovedAt: asDate(repair.estimateApprovedAt),
            estimateApprovalNote: repair.estimateApprovalNote,
            scheduledAt: asDate(repair.scheduledAt),
            completedAt: asDate(repair.completedAt),
            completionNote: repair.completionNote,
            completionPhotoUrls: repair.completionPhotoUrls,
            updatedAt: asDate(repair.updatedAt)
          }
        });
      }

      for (const receipt of store.receipts) {
        await tx.receipt.upsert({
          where: { id: receipt.id },
          create: {
            id: receipt.id,
            managerId: receipt.managerId,
            source: toUpperEnum<PrismaReceiptSource>(receipt.source) ?? "MANUAL",
            imageUrl: receipt.imageUrl,
            hasEvidence: receipt.hasEvidence,
            uploadedAt: asDate(receipt.uploadedAt),
            duplicateOfId: receipt.duplicateOfId
          },
          update: {
            managerId: receipt.managerId,
            source: toUpperEnum<PrismaReceiptSource>(receipt.source) ?? "MANUAL",
            imageUrl: receipt.imageUrl,
            hasEvidence: receipt.hasEvidence,
            uploadedAt: asDate(receipt.uploadedAt),
            duplicateOfId: receipt.duplicateOfId
          }
        });
      }

      for (const cost of store.costs) {
        await tx.cost.upsert({
          where: { id: cost.id },
          create: {
            id: cost.id,
            managerId: cost.managerId,
            date: asDate(cost.date) ?? new Date(),
            item: cost.item,
            amount: cost.amount,
            type: toUpperEnum<PrismaCostType>(cost.type) ?? "OTHER",
            scope: toUpperEnum<PrismaCostAttributionScope>(cost.scope) ?? "BUILDING",
            unitId: cost.unitId,
            status: toUpperEnum<PrismaCostStatus>(cost.status) ?? "DRAFT",
            verified: cost.verified,
            reviewReason: toUpperEnum<PrismaCostReviewReason>(cost.reviewReason),
            disclosure: toUpperEnum<PrismaDisclosureState>(cost.disclosure),
            repairPayment: toUpperEnum<PrismaRepairPaymentState>(cost.repairPayment),
            paymentRef: cost.paymentRef,
            receiptId: cost.receiptId,
            supersedesId: cost.supersedesId,
            voidReason: cost.voidReason,
            createdAt: asDate(cost.createdAt),
            updatedAt: asDate(cost.updatedAt)
          },
          update: {
            managerId: cost.managerId,
            date: asDate(cost.date),
            item: cost.item,
            amount: cost.amount,
            type: toUpperEnum<PrismaCostType>(cost.type) ?? "OTHER",
            scope: toUpperEnum<PrismaCostAttributionScope>(cost.scope) ?? "BUILDING",
            unitId: cost.unitId,
            status: toUpperEnum<PrismaCostStatus>(cost.status) ?? "DRAFT",
            verified: cost.verified,
            reviewReason: toUpperEnum<PrismaCostReviewReason>(cost.reviewReason),
            disclosure: toUpperEnum<PrismaDisclosureState>(cost.disclosure),
            repairPayment: toUpperEnum<PrismaRepairPaymentState>(cost.repairPayment),
            paymentRef: cost.paymentRef,
            receiptId: cost.receiptId,
            supersedesId: cost.supersedesId,
            voidReason: cost.voidReason,
            updatedAt: asDate(cost.updatedAt)
          }
        });
      }

      for (const ocr of store.receiptOcrs) {
        await tx.receiptOcr.upsert({
          where: { id: ocr.id },
          create: {
            id: ocr.id,
            receiptId: ocr.receiptId,
            costId: ocr.costId,
            itemValue: ocr.fields.item.value,
            itemConfidence: ocr.fields.item.confidence,
            itemNeedsReview: ocr.fields.item.needsReview,
            dateValue: ocr.fields.date.value,
            dateConfidence: ocr.fields.date.confidence,
            dateNeedsReview: ocr.fields.date.needsReview,
            amountValue: ocr.fields.amount.value,
            amountConfidence: ocr.fields.amount.confidence,
            amountNeedsReview: ocr.fields.amount.needsReview,
            unitIdValue: ocr.fields.unitId?.value,
            unitIdConfidence: ocr.fields.unitId?.confidence,
            unitIdNeedsReview: ocr.fields.unitId?.needsReview,
            suggestedType: toUpperEnum<PrismaCostType>(ocr.suggestedType),
            typeConfidence: ocr.typeConfidence,
            lineItems: asJson(ocr.lineItems),
            createdAt: asDate(ocr.createdAt)
          },
          update: {
            receiptId: ocr.receiptId,
            costId: ocr.costId,
            itemValue: ocr.fields.item.value,
            itemConfidence: ocr.fields.item.confidence,
            itemNeedsReview: ocr.fields.item.needsReview,
            dateValue: ocr.fields.date.value,
            dateConfidence: ocr.fields.date.confidence,
            dateNeedsReview: ocr.fields.date.needsReview,
            amountValue: ocr.fields.amount.value,
            amountConfidence: ocr.fields.amount.confidence,
            amountNeedsReview: ocr.fields.amount.needsReview,
            unitIdValue: ocr.fields.unitId?.value,
            unitIdConfidence: ocr.fields.unitId?.confidence,
            unitIdNeedsReview: ocr.fields.unitId?.needsReview,
            suggestedType: toUpperEnum<PrismaCostType>(ocr.suggestedType),
            typeConfidence: ocr.typeConfidence,
            lineItems: asJson(ocr.lineItems)
          }
        });
      }

      for (const message of store.messages) {
        const repairId = (message as { repairId?: string }).repairId;

        await tx.ticketMessage.upsert({
          where: { id: message.id },
          create: {
            id: message.id,
            ticketId: message.ticketId,
            complaintId: message.complaintId,
            repairId,
            senderUserId: message.senderUserId,
            senderRole: message.senderRole,
            messageText: message.messageText,
            attachmentUrls: message.attachmentUrls,
            createdAt: asDate(message.createdAt)
          },
          update: {
            ticketId: message.ticketId,
            complaintId: message.complaintId,
            repairId,
            senderUserId: message.senderUserId,
            senderRole: message.senderRole,
            messageText: message.messageText,
            attachmentUrls: message.attachmentUrls
          }
        });
      }

      for (const thread of store.messagingThreads) {
        await tx.messagingThread.upsert({
          where: { id: thread.id },
          create: {
            id: thread.id,
            roomId: thread.roomId,
            unitId: thread.unitId,
            tenantId: thread.tenantId,
            context: toUpperEnum<PrismaMessagingThreadContext>(thread.context) ?? "GENERAL",
            contextRef: thread.contextRef,
            contextLabel: thread.contextLabel,
            lastMessage: thread.lastMessage,
            unreadCount: thread.unreadCount,
            pendingRequest: thread.pendingRequest,
            archivedNotice: thread.archivedNotice,
            createdAt: asDate(thread.createdAt),
            updatedAt: asDate(thread.updatedAt)
          },
          update: {
            roomId: thread.roomId,
            unitId: thread.unitId,
            tenantId: thread.tenantId,
            context: toUpperEnum<PrismaMessagingThreadContext>(thread.context) ?? "GENERAL",
            contextRef: thread.contextRef,
            contextLabel: thread.contextLabel,
            lastMessage: thread.lastMessage,
            unreadCount: thread.unreadCount,
            pendingRequest: thread.pendingRequest,
            archivedNotice: thread.archivedNotice,
            updatedAt: asDate(thread.updatedAt)
          }
        });
      }

      for (const message of store.messagingMessages) {
        await tx.messagingMessage.upsert({
          where: { id: message.id },
          create: {
            id: message.id,
            threadId: message.threadId,
            senderUserId: message.senderUserId,
            sender: toUpperEnum<PrismaMessagingMessageSender>(message.sender) ?? "TENANT",
            kind: toUpperEnum<PrismaMessagingMessageKind>(message.kind) ?? "TEXT",
            body: message.body,
            originalBody: message.originalBody,
            attachmentUrls: message.attachmentUrls,
            createdAt: asDate(message.createdAt)
          },
          update: {
            threadId: message.threadId,
            senderUserId: message.senderUserId,
            sender: toUpperEnum<PrismaMessagingMessageSender>(message.sender) ?? "TENANT",
            kind: toUpperEnum<PrismaMessagingMessageKind>(message.kind) ?? "TEXT",
            body: message.body,
            originalBody: message.originalBody,
            attachmentUrls: message.attachmentUrls
          }
        });
      }

      for (const draft of store.messagingAnnouncementDrafts) {
        await tx.messagingAnnouncementDraft.upsert({
          where: { id: draft.id },
          create: {
            id: draft.id,
            category: toUpperEnum<PrismaMessagingAnnouncementCategory>(draft.category) ?? "LIFE",
            scope: toUpperEnum<PrismaMessagingAnnouncementScope>(draft.scope) ?? "BUILDING",
            targetLabel: draft.targetLabel,
            targetRoomIds: draft.targetRoomIds,
            title: draft.title,
            body: draft.body,
            translations: asJson(draft.translations),
            confirmRequired: draft.confirmRequired,
            status: toUpperEnum<PrismaMessagingAnnouncementDraftStatus>(draft.status) ?? "DRAFT",
            createdByManagerId: draft.createdByManagerId,
            createdAt: asDate(draft.createdAt),
            updatedAt: asDate(draft.updatedAt)
          },
          update: {
            category: toUpperEnum<PrismaMessagingAnnouncementCategory>(draft.category) ?? "LIFE",
            scope: toUpperEnum<PrismaMessagingAnnouncementScope>(draft.scope) ?? "BUILDING",
            targetLabel: draft.targetLabel,
            targetRoomIds: draft.targetRoomIds,
            title: draft.title,
            body: draft.body,
            translations: asJson(draft.translations),
            confirmRequired: draft.confirmRequired,
            status: toUpperEnum<PrismaMessagingAnnouncementDraftStatus>(draft.status) ?? "DRAFT",
            createdByManagerId: draft.createdByManagerId,
            updatedAt: asDate(draft.updatedAt)
          }
        });
      }

      for (const announcement of store.messagingAnnouncements) {
        await tx.messagingAnnouncement.upsert({
          where: { id: announcement.id },
          create: {
            id: announcement.id,
            draftId: announcement.draftId,
            category:
              toUpperEnum<PrismaMessagingAnnouncementCategory>(announcement.category) ?? "LIFE",
            scope: toUpperEnum<PrismaMessagingAnnouncementScope>(announcement.scope) ?? "BUILDING",
            targetLabel: announcement.targetLabel,
            title: announcement.title,
            body: announcement.body,
            originalBody: announcement.originalBody,
            sender: announcement.sender,
            senderId: announcement.senderId,
            sentAt: asDate(announcement.sentAt) ?? new Date(),
            confirmRequired: announcement.confirmRequired,
            safetyCta: announcement.safetyCta
          },
          update: {
            draftId: announcement.draftId,
            category:
              toUpperEnum<PrismaMessagingAnnouncementCategory>(announcement.category) ?? "LIFE",
            scope: toUpperEnum<PrismaMessagingAnnouncementScope>(announcement.scope) ?? "BUILDING",
            targetLabel: announcement.targetLabel,
            title: announcement.title,
            body: announcement.body,
            originalBody: announcement.originalBody,
            sender: announcement.sender,
            senderId: announcement.senderId,
            sentAt: asDate(announcement.sentAt) ?? new Date(),
            confirmRequired: announcement.confirmRequired,
            safetyCta: announcement.safetyCta
          }
        });
      }

      for (const delivery of store.messagingAnnouncementDeliveries) {
        await tx.messagingAnnouncementDelivery.upsert({
          where: { id: delivery.id },
          create: {
            id: delivery.id,
            announcementId: delivery.announcementId,
            tenantId: delivery.tenantId,
            roomId: delivery.roomId,
            unitId: delivery.unitId,
            tenantName: delivery.tenantName,
            preferredLang: delivery.preferredLang,
            state: toUpperEnum<PrismaMessagingAnnouncementReadState>(delivery.state) ?? "UNREAD",
            readAt: asDate(delivery.readAt),
            confirmedAt: asDate(delivery.confirmedAt),
            failed: delivery.failed ?? false
          },
          update: {
            announcementId: delivery.announcementId,
            tenantId: delivery.tenantId,
            roomId: delivery.roomId,
            unitId: delivery.unitId,
            tenantName: delivery.tenantName,
            preferredLang: delivery.preferredLang,
            state: toUpperEnum<PrismaMessagingAnnouncementReadState>(delivery.state) ?? "UNREAD",
            readAt: asDate(delivery.readAt),
            confirmedAt: asDate(delivery.confirmedAt),
            failed: delivery.failed ?? false
          }
        });
      }

      for (const moveout of store.moveouts) {
        await tx.moveoutRequest.upsert({
          where: { id: moveout.id },
          create: {
            id: moveout.id,
            tenantId: moveout.tenantId,
            roomId: moveout.roomId,
            contractId: moveout.contractId,
            unitId: moveout.unitId,
            leaseEndDate: asDate(moveout.leaseEndDate),
            depositAmount: moveout.depositAmount,
            estimatedRefundMin: moveout.estimatedRefundMin,
            estimatedRefundMax: moveout.estimatedRefundMax,
            settlementStatus:
              toUpperEnum<PrismaMoveoutSettlementStatus>(moveout.settlementStatus) ?? "ESTIMATE",
            prepProgress: moveout.prepProgress,
            messagingThreadId: moveout.messagingThreadId,
            createdAt: asDate(moveout.createdAt),
            updatedAt: asDate(moveout.updatedAt)
          },
          update: {
            tenantId: moveout.tenantId,
            roomId: moveout.roomId,
            contractId: moveout.contractId,
            unitId: moveout.unitId,
            leaseEndDate: asDate(moveout.leaseEndDate),
            depositAmount: moveout.depositAmount,
            estimatedRefundMin: moveout.estimatedRefundMin,
            estimatedRefundMax: moveout.estimatedRefundMax,
            settlementStatus:
              toUpperEnum<PrismaMoveoutSettlementStatus>(moveout.settlementStatus) ?? "ESTIMATE",
            prepProgress: moveout.prepProgress,
            messagingThreadId: moveout.messagingThreadId,
            updatedAt: asDate(moveout.updatedAt)
          }
        });
      }

      for (const record of store.moveoutRecords) {
        await tx.moveoutRecord.upsert({
          where: { id: record.id },
          create: {
            id: record.id,
            moveoutId: record.summaryId,
            source: toUpperEnum<PrismaMoveoutRecordSource>(record.source) ?? "CHAT",
            title: record.title,
            description: record.description,
            occurredAt: asDate(record.occurredAt),
            wearVerdict: toUpperEnum<PrismaMoveoutWearVerdict>(record.wearVerdict),
            wearNote: record.wearNote,
            moveinComparisonAvailable: record.moveinComparisonAvailable,
            createdAt: asDate(record.occurredAt)
          },
          update: {
            moveoutId: record.summaryId,
            source: toUpperEnum<PrismaMoveoutRecordSource>(record.source) ?? "CHAT",
            title: record.title,
            description: record.description,
            occurredAt: asDate(record.occurredAt),
            wearVerdict: toUpperEnum<PrismaMoveoutWearVerdict>(record.wearVerdict),
            wearNote: record.wearNote,
            moveinComparisonAvailable: record.moveinComparisonAvailable
          }
        });
      }

      for (const item of store.moveoutChecklist) {
        await tx.moveoutChecklistItem.upsert({
          where: { id: item.id },
          create: {
            id: item.id,
            moveoutId: item.summaryId,
            label: item.label,
            present: item.present,
            condition: toUpperEnum<PrismaMoveoutChecklistCondition>(item.condition) ?? "NORMAL",
            note: item.note,
            updatedAt: new Date()
          },
          update: {
            moveoutId: item.summaryId,
            label: item.label,
            present: item.present,
            condition: toUpperEnum<PrismaMoveoutChecklistCondition>(item.condition) ?? "NORMAL",
            note: item.note,
            updatedAt: new Date()
          }
        });
      }

      for (const settlement of store.moveoutSettlements) {
        await tx.moveoutSettlement.upsert({
          where: { id: settlement.id },
          create: {
            id: settlement.id,
            moveoutId: settlement.summaryId,
            depositAmount: settlement.depositAmount,
            refundMin: settlement.refundMin,
            refundMax: settlement.refundMax,
            status: toUpperEnum<PrismaMoveoutSettlementStatus>(settlement.status) ?? "ESTIMATE",
            disclaimer: settlement.disclaimer,
            createdAt: asDate(settlement.createdAt),
            updatedAt: asDate(settlement.updatedAt ?? settlement.createdAt)
          },
          update: {
            moveoutId: settlement.summaryId,
            depositAmount: settlement.depositAmount,
            refundMin: settlement.refundMin,
            refundMax: settlement.refundMax,
            status: toUpperEnum<PrismaMoveoutSettlementStatus>(settlement.status) ?? "ESTIMATE",
            disclaimer: settlement.disclaimer,
            updatedAt: asDate(settlement.updatedAt ?? settlement.createdAt)
          }
        });
      }

      for (const deduction of store.moveoutDeductions) {
        await tx.moveoutDeduction.upsert({
          where: { id: deduction.id },
          create: {
            id: deduction.id,
            moveoutId: deduction.summaryId,
            kind: toUpperEnum<PrismaMoveoutDeductionKind>(deduction.kind) ?? "REPAIR",
            label: deduction.label,
            estimatedMin: deduction.estimatedMin,
            estimatedMax: deduction.estimatedMax,
            needsConfirmation: deduction.needsConfirmation,
            evidenceNote: deduction.evidenceNote,
            source: toUpperEnum<PrismaMoveoutRecordSource>(deduction.source) ?? "REPAIR",
            updatedAt: new Date()
          },
          update: {
            moveoutId: deduction.summaryId,
            kind: toUpperEnum<PrismaMoveoutDeductionKind>(deduction.kind) ?? "REPAIR",
            label: deduction.label,
            estimatedMin: deduction.estimatedMin,
            estimatedMax: deduction.estimatedMax,
            needsConfirmation: deduction.needsConfirmation,
            evidenceNote: deduction.evidenceNote,
            source: toUpperEnum<PrismaMoveoutRecordSource>(deduction.source) ?? "REPAIR",
            updatedAt: new Date()
          }
        });
      }

      for (const dispute of store.moveoutDisputes) {
        await tx.moveoutDispute.upsert({
          where: { id: dispute.id },
          create: {
            id: dispute.id,
            moveoutId: dispute.summaryId,
            targetItemId: dispute.targetItemId,
            targetLabel: dispute.targetLabel,
            reason: dispute.reason,
            status: toUpperEnum<PrismaMoveoutDisputeStatus>(dispute.status) ?? "RECEIVED",
            slaDeadline: asDate(dispute.slaDeadline) ?? new Date(),
            slaBreached: dispute.slaBreached,
            managerResponse: dispute.managerResponse,
            messagingThreadId: dispute.messagingThreadId,
            createdAt: asDate(dispute.createdAt),
            updatedAt: asDate(dispute.updatedAt)
          },
          update: {
            moveoutId: dispute.summaryId,
            targetItemId: dispute.targetItemId,
            targetLabel: dispute.targetLabel,
            reason: dispute.reason,
            status: toUpperEnum<PrismaMoveoutDisputeStatus>(dispute.status) ?? "RECEIVED",
            slaDeadline: asDate(dispute.slaDeadline) ?? new Date(),
            slaBreached: dispute.slaBreached,
            managerResponse: dispute.managerResponse,
            messagingThreadId: dispute.messagingThreadId,
            updatedAt: asDate(dispute.updatedAt)
          }
        });

        for (const event of dispute.history) {
          const eventId =
            event.id ?? stableMoveoutDisputeEventId(dispute.id, event.status, event.at);

          await tx.moveoutDisputeEvent.upsert({
            where: { id: eventId },
            create: {
              id: eventId,
              disputeId: dispute.id,
              status: toUpperEnum<PrismaMoveoutDisputeStatus>(event.status) ?? "RECEIVED",
              actorUserId: event.actorUserId,
              note: event.note,
              createdAt: asDate(event.at)
            },
            update: {
              disputeId: dispute.id,
              status: toUpperEnum<PrismaMoveoutDisputeStatus>(event.status) ?? "RECEIVED",
              actorUserId: event.actorUserId,
              note: event.note
            }
          });
        }
      }

      for (const audit of store.moveoutReportAudits) {
        await tx.moveoutReportAuditEntry.upsert({
          where: { id: audit.id },
          create: {
            id: audit.id,
            moveoutId: audit.summaryId,
            recordItemId: audit.recordItemId,
            action: toUpperEnum<PrismaMoveoutWearAdjustmentAction>(audit.action) ?? "KEEP",
            fromVerdict: toUpperEnum<PrismaMoveoutWearVerdict>(audit.fromVerdict),
            toVerdict: toUpperEnum<PrismaMoveoutWearVerdict>(audit.toVerdict),
            evidenceNote: audit.evidenceNote,
            tenantNotified: audit.tenantNotified,
            managerName: audit.managerName,
            managerId: audit.managerId,
            createdAt: asDate(audit.at)
          },
          update: {
            moveoutId: audit.summaryId,
            recordItemId: audit.recordItemId,
            action: toUpperEnum<PrismaMoveoutWearAdjustmentAction>(audit.action) ?? "KEEP",
            fromVerdict: toUpperEnum<PrismaMoveoutWearVerdict>(audit.fromVerdict),
            toVerdict: toUpperEnum<PrismaMoveoutWearVerdict>(audit.toVerdict),
            evidenceNote: audit.evidenceNote,
            tenantNotified: audit.tenantNotified,
            managerName: audit.managerName,
            managerId: audit.managerId
          }
        });
      }

      for (const history of store.history) {
        await tx.statusHistory.upsert({
          where: { id: history.id },
          create: {
            id: history.id,
            ticketId: history.ticketId,
            fromStatus: history.fromStatus,
            toStatus: history.toStatus,
            actorUserId: history.changedByUserId,
            actorRole: actorRoleFor(store, history.changedByUserId),
            note: history.note ?? "",
            createdAt: asDate(history.createdAt)
          },
          update: {
            ticketId: history.ticketId,
            fromStatus: history.fromStatus,
            toStatus: history.toStatus,
            actorUserId: history.changedByUserId,
            actorRole: actorRoleFor(store, history.changedByUserId),
            note: history.note ?? ""
          }
        });
      }

      for (const [ticketId, analysis] of Object.entries(store.analyses)) {
        await tx.aiAnalysis.upsert({
          where: { ticketId },
          create: {
            ticketId,
            summary: analysis.summary,
            category: analysis.category,
            detailCategory: analysis.detailCategory,
            priority: analysis.priority,
            responsibilityHint: analysis.responsibilityHint,
            confidenceScore: analysis.confidenceScore,
            reasons: analysis.reasons ?? [],
            recommendedAction: analysis.recommendedAction,
            photoAnalysis: analysis.photoAnalysis ? asJson(analysis.photoAnalysis) : undefined
          },
          update: {
            summary: analysis.summary,
            category: analysis.category,
            detailCategory: analysis.detailCategory,
            priority: analysis.priority,
            responsibilityHint: analysis.responsibilityHint,
            confidenceScore: analysis.confidenceScore,
            reasons: analysis.reasons ?? [],
            recommendedAction: analysis.recommendedAction,
            photoAnalysis: analysis.photoAnalysis ? asJson(analysis.photoAnalysis) : undefined
          }
        });
      }
    });
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }
}
