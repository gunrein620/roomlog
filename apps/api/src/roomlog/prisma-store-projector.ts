import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Store, StoreProjector } from "./roomlog.service";

function asDate(value?: string) {
  return value ? new Date(value) : undefined;
}

function asJson<T>(value: T) {
  return value as Prisma.InputJsonValue;
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
