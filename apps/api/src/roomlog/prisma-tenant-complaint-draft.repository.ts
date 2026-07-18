import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type TenantComplaintDraft } from "@prisma/client";
import type {
  TenantComplaintDraftRecord,
  TenantComplaintDraftRepository
} from "./tenant-complaint-draft.repository";

type DraftUpsertInput = Parameters<TenantComplaintDraftRepository["upsert"]>[0];

export function expiredDraftDeleteWhere(id: string, now: Date) {
  return { id, expiresAt: { lte: now } };
}

function present(row: TenantComplaintDraft): TenantComplaintDraftRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    roomId: row.roomId,
    category: row.category === "하자" ? "하자" : "민원",
    title: row.title,
    occurredAt: row.occurredAt?.toISOString() ?? null,
    description: row.description,
    attachmentUrls: row.attachmentUrls,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt
  };
}

export class PrismaTenantComplaintDraftRepository implements TenantComplaintDraftRepository {
  private readonly prisma: PrismaClient;

  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  }

  async findActive(tenantId: string, roomId: string, now: Date) {
    const row = await this.prisma.tenantComplaintDraft.findUnique({
      where: { tenantId_roomId: { tenantId, roomId } }
    });
    if (!row) return null;
    if (row.expiresAt.getTime() <= now.getTime()) {
      await this.prisma.tenantComplaintDraft.deleteMany({
        where: expiredDraftDeleteWhere(row.id, now)
      });
      return null;
    }
    return present(row);
  }

  async upsert(input: DraftUpsertInput) {
    const row = await this.prisma.tenantComplaintDraft.upsert({
      where: { tenantId_roomId: { tenantId: input.tenantId, roomId: input.roomId } },
      create: {
        id: randomUUID(),
        tenantId: input.tenantId,
        roomId: input.roomId,
        category: input.category,
        title: input.title,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
        description: input.description,
        attachmentUrls: input.attachmentUrls,
        expiresAt: input.expiresAt
      },
      update: {
        category: input.category,
        title: input.title,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
        description: input.description,
        attachmentUrls: input.attachmentUrls,
        expiresAt: input.expiresAt
      }
    });
    return present(row);
  }

  async delete(tenantId: string, roomId: string) {
    await this.prisma.tenantComplaintDraft.deleteMany({ where: { tenantId, roomId } });
  }

  async deleteExpired(now: Date) {
    const result = await this.prisma.tenantComplaintDraft.deleteMany({
      where: { expiresAt: { lte: now } }
    });
    return result.count;
  }

  async close() {
    await this.prisma.$disconnect();
  }
}
