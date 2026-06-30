import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Store, StoreProjector } from "./roomlog.service";

function asDate(value?: string) {
  return value ? new Date(value) : undefined;
}

function asJson<T>(value: T) {
  return value as Prisma.InputJsonValue;
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
