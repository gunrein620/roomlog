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
      roomWalls,
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
      history,
      analyses
    ] = await Promise.all([
      this.prisma.userAccount.findMany(),
      this.prisma.room.findMany(),
      this.prisma.roomWall.findMany({ orderBy: { wallOrder: "asc" } }),
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
      !receipts.length
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
      roomWalls: roomWalls.map((wall) => ({
        id: wall.id,
        roomId: wall.roomId,
        sourceWallId: wall.sourceWallId,
        start: wall.start as any,
        end: wall.end as any,
        lengthMm: wall.lengthMm,
        rotationRad: wall.rotationRad,
        position: wall.position as any,
        dimensions: wall.dimensions as any,
        wallOrder: wall.wallOrder,
        createdAt: asIso(wall.createdAt) ?? new Date().toISOString(),
        updatedAt: asIso(wall.updatedAt) ?? new Date().toISOString()
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
      floorPlans: floorPlans.map((floorPlan) => {
        const floorPlanRow = floorPlan as typeof floorPlan & { objects?: unknown };

        return {
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
        objects: (floorPlanRow.objects as any) ?? [],
        openings: (floorPlan.openings as any) ?? [],
        fixtures: (floorPlan.fixtures as any) ?? [],
        roomId: optional(floorPlan.roomId),
        createdAt: asIso(floorPlan.createdAt) ?? new Date().toISOString(),
        updatedAt: asIso(floorPlan.updatedAt) ?? new Date().toISOString()
        };
      }),
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

      const roomWallIds = store.roomWalls.map((wall) => wall.id);
      await tx.roomWall.deleteMany({
        where: roomWallIds.length ? { id: { notIn: roomWallIds } } : {}
      });
      for (const wall of store.roomWalls) {
        await tx.roomWall.upsert({
          where: { id: wall.id },
          create: {
            id: wall.id,
            roomId: wall.roomId,
            sourceWallId: wall.sourceWallId,
            start: asJson(wall.start),
            end: asJson(wall.end),
            lengthMm: wall.lengthMm,
            rotationRad: wall.rotationRad,
            position: asJson(wall.position),
            dimensions: asJson(wall.dimensions),
            wallOrder: wall.wallOrder,
            createdAt: asDate(wall.createdAt),
            updatedAt: asDate(wall.updatedAt)
          },
          update: {
            roomId: wall.roomId,
            sourceWallId: wall.sourceWallId,
            start: asJson(wall.start),
            end: asJson(wall.end),
            lengthMm: wall.lengthMm,
            rotationRad: wall.rotationRad,
            position: asJson(wall.position),
            dimensions: asJson(wall.dimensions),
            wallOrder: wall.wallOrder,
            updatedAt: asDate(wall.updatedAt)
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
            roomId: floorPlan.roomId,
            sourceAttachmentId: floorPlan.sourceAttachmentId,
            sourceImageUrl: floorPlan.sourceImageUrl,
            status: floorPlan.status,
            pixelToMmRatio: floorPlan.pixelToMmRatio,
            walls: asJson(floorPlan.walls),
            hiddenWallIds: floorPlan.hiddenWallIds,
            furnitures: asJson(floorPlan.furnitures),
            room3d: asJson(floorPlan.room3d),
            extractionMeta: asJson(floorPlan.extractionMeta),
            objects: asJson(floorPlan.objects),
            openings: asJson(floorPlan.openings),
            fixtures: asJson(floorPlan.fixtures),
            createdAt: asDate(floorPlan.createdAt),
            updatedAt: asDate(floorPlan.updatedAt)
          } as any,
          update: {
            ownerId: floorPlan.ownerId,
            roomId: floorPlan.roomId,
            sourceAttachmentId: floorPlan.sourceAttachmentId,
            sourceImageUrl: floorPlan.sourceImageUrl,
            status: floorPlan.status,
            pixelToMmRatio: floorPlan.pixelToMmRatio,
            walls: asJson(floorPlan.walls),
            hiddenWallIds: floorPlan.hiddenWallIds,
            furnitures: asJson(floorPlan.furnitures),
            room3d: asJson(floorPlan.room3d),
            extractionMeta: asJson(floorPlan.extractionMeta),
            objects: asJson(floorPlan.objects),
            openings: asJson(floorPlan.openings),
            fixtures: asJson(floorPlan.fixtures),
            updatedAt: asDate(floorPlan.updatedAt)
          } as any
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
