import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Store, StoreProjector } from "./roomlog.service";
import { IntakeDraft, PhotoAnalysis, TicketMessage } from "./roomlog.types";

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
      tenantRooms,
      vendors,
      vendorInvites,
      tenantInvites,
      attachments,
      floorPlans,
      moveInChecklist,
      intakeSessions,
      complaints,
      tickets,
      feedback,
      repairs,
      messages,
      history,
      analyses
    ] = await Promise.all([
      this.prisma.userAccount.findMany(),
      this.prisma.room.findMany(),
      this.prisma.tenantRoom.findMany(),
      this.prisma.vendorProfile.findMany(),
      this.prisma.vendorInvite.findMany(),
      this.prisma.tenantInvite.findMany(),
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
      this.prisma.ticketMessage.findMany(),
      this.prisma.statusHistory.findMany(),
      this.prisma.aiAnalysis.findMany()
    ]);

    if (
      !users.length &&
      !rooms.length &&
      !floorPlans.length &&
      !intakeSessions.length &&
      !complaints.length &&
      !tickets.length
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
