import { createHmac } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import type { DomainEventRepository } from "../domain-events/domain-event.repository";
import { tokenSecret as defaultTokenSecret } from "./roomlog-support";
import {
  requiredVendorTrade,
  vendorSupportsRequiredTrade
} from "./vendor-trade-compatibility";
import {
  TenantVendorConnectionRepositoryError,
  type CreateTenantVendorConnectionCommand,
  type TenantPartnerVendorCandidateRecord,
  type TenantPartnerVendorSearchRecord,
  type TenantVendorConnectionRepository,
  type TenantVendorConnectionRequestRecord,
  type TenantVendorWorkflowAuthority
} from "./tenant-vendor-connection.repository";

const CLOSED_REPAIR_STATUSES = ["COMPLETED", "CANCELLED"] as const;
const REQUESTABLE_TICKET_STATUSES = [
  "RECEIVED",
  "REVIEWING",
  "ADDITIONAL_INFO_REQUESTED",
  "VENDOR_ASSIGNMENT_PENDING",
  "REOPENED"
] as const;
const COMPLAINT_INCLUDE = {
  ticket: { include: { room: true, analysis: true } }
} satisfies Prisma.ComplaintInclude;
const VENDOR_INCLUDE = {
  accountLinks: {
    where: { status: "ACTIVE" as const, user: { status: "ACTIVE" as const } },
    select: { userId: true }
  }
} satisfies Prisma.VendorProfileInclude;

type DbClient = PrismaClient | Prisma.TransactionClient;
type ComplaintScope = Prisma.ComplaintGetPayload<{ include: typeof COMPLAINT_INCLUDE }>;
type EligibleVendor = Prisma.VendorProfileGetPayload<{ include: typeof VENDOR_INCLUDE }>;

function repositoryError(
  code: ConstructorParameters<typeof TenantVendorConnectionRepositoryError>[0],
  message: string
) {
  return new TenantVendorConnectionRepositoryError(code, message);
}

function normalizeServiceArea(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("ko")
    .replace(/서울특별시|서울시/g, "서울")
    .replace(/부산광역시|부산시/g, "부산")
    .replace(/대구광역시|대구시/g, "대구")
    .replace(/인천광역시|인천시/g, "인천")
    .replace(/광주광역시|광주시/g, "광주")
    .replace(/대전광역시|대전시/g, "대전")
    .replace(/울산광역시|울산시/g, "울산")
    .replace(/세종특별자치시|세종시/g, "세종")
    .replace(/\s+/g, "")
    .replace(/(?:전지역|전역|전체)$/g, "");
}

function servesAddress(vendor: EligibleVendor, address: string) {
  const target = normalizeServiceArea(address);
  return [vendor.serviceArea, ...vendor.serviceAreas].some((area) => {
    const candidate = normalizeServiceArea(area);
    return Boolean(candidate) && (target.includes(candidate) || candidate.includes(target));
  });
}

function candidateRecord(
  complaint: ComplaintScope,
  vendor: EligibleVendor
): TenantPartnerVendorCandidateRecord {
  const ticket = complaint.ticket!;
  return {
    tenantId: complaint.tenantId,
    complaintId: complaint.id,
    ticketId: ticket.id,
    vendorId: vendor.id,
    complaintTitle: complaint.title,
    category: ticket.category,
    location: complaint.location,
    ticketSummary: ticket.aiSummary,
    businessName: vendor.businessName,
    trades: [...vendor.trades],
    serviceAreas: [...new Set([vendor.serviceArea, ...vendor.serviceAreas].filter(Boolean))]
  };
}

function deterministicRepairId(
  command: CreateTenantVendorConnectionCommand,
  secret: string
) {
  const digest = createHmac("sha256", secret)
    .update(
      [
        "tenant-vendor-repair-v1",
        command.tenantId,
        command.complaintId,
        command.vendorId,
        command.idempotencyKey
      ].join("\u0000")
    )
    .digest("base64url");
  return `repair-tenant-${digest}`;
}

export class PrismaTenantVendorConnectionRepository
  implements TenantVendorConnectionRepository {
  private readonly prisma: PrismaClient;

  constructor(
    databaseUrl: string,
    private readonly domainEvents: DomainEventRepository,
    private readonly idempotencySecret: string = defaultTokenSecret
  ) {
    this.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl })
    });
  }

  async close() {
    await this.prisma.$disconnect();
  }

  async search(
    tenantId: string,
    complaintId: string,
    query?: string
  ): Promise<TenantPartnerVendorSearchRecord> {
    const complaint = await this.requireComplaint(this.prisma, tenantId, complaintId);
    const candidates = (
      await this.eligibleVendors(this.prisma, complaint, query)
    ).map((vendor) => candidateRecord(complaint, vendor));
    const ticket = complaint.ticket!;
    return {
      complaint: {
        tenantId,
        complaintId: complaint.id,
        ticketId: ticket.id,
        title: complaint.title,
        category: ticket.category,
        location: complaint.location,
        ticketSummary: ticket.aiSummary
      },
      candidates
    };
  }

  async findEligibleCandidate(
    tenantId: string,
    complaintId: string,
    vendorId: string
  ): Promise<TenantPartnerVendorCandidateRecord | null> {
    const complaint = await this.requireComplaint(this.prisma, tenantId, complaintId);
    const vendor = (
      await this.eligibleVendors(this.prisma, complaint, undefined, vendorId)
    )[0];
    return vendor ? candidateRecord(complaint, vendor) : null;
  }

  async requestVendor(command: CreateTenantVendorConnectionCommand) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const initial = await this.loadComplaint(
          tx,
          command.tenantId,
          command.complaintId
        );
        const ticketId = initial.ticket!.id;
        const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "Ticket" WHERE "id" = ${ticketId} FOR UPDATE
        `);
        if (locked.length === 0) {
          throw repositoryError("COMPLAINT_NOT_FOUND", "Complaint ticket was not found.");
        }

        const complaint = await this.loadComplaint(
          tx,
          command.tenantId,
          command.complaintId
        );
        const candidate = (
          await this.eligibleVendors(tx, complaint, undefined, command.vendorId)
        )[0];
        if (!candidate) {
          throw repositoryError("VENDOR_NOT_ELIGIBLE", "Vendor is not eligible.");
        }

        const ticket = complaint.ticket!;
        const repairId = deterministicRepairId(command, this.idempotencySecret);
        const sameAttempt = await tx.repairRequest.findUnique({
          where: { id: repairId }
        });
        if (sameAttempt) {
          if (
            sameAttempt.ticketId !== ticket.id ||
            sameAttempt.vendorId !== candidate.id ||
            !(await this.isTenantVendorRequest(tx, sameAttempt, complaint))
          ) {
            throw repositoryError(
              "ACTIVE_REPAIR_CONFLICT",
              "The idempotency key belongs to another repair."
            );
          }
          return {
            request: this.requestRecord(sameAttempt, complaint, candidate),
            idempotent: true
          };
        }
        const active = await tx.repairRequest.findFirst({
          where: {
            ticketId: ticket.id,
            status: { notIn: [...CLOSED_REPAIR_STATUSES] }
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
        });
        if (active) {
          throw repositoryError(
            "ACTIVE_REPAIR_CONFLICT",
            "Another repair is already active for this ticket."
          );
        }
        this.assertTicketRequestable(ticket.status);

        const description = command.requestNote?.trim() || ticket.aiSummary;
        const repair = await tx.repairRequest.create({
          data: {
            id: repairId,
            ticketId: ticket.id,
            vendorId: candidate.id,
            status: "REQUESTED",
            title: `${ticket.category} 처리 요청`,
            description,
            costBearer: "TENANT",
            completionPhotoUrls: []
          }
        });
        await tx.ticket.update({
          where: { id: ticket.id },
          data: { assignedVendorId: candidate.id, status: "VENDOR_ASSIGNED" }
        });
        await tx.complaint.update({
          where: { id: complaint.id },
          data: { status: "VENDOR_ASSIGNED" }
        });

        const targetUserIds = [...new Set(candidate.accountLinks.map(({ userId }) => userId))];
        await this.domainEvents.enqueue(tx, {
          event: {
            eventKey: `vendor-job-assigned:${repair.id}`,
            type: "VENDOR_JOB_ASSIGNED",
            targetUserIds,
            vendorId: candidate.id,
            repairId: repair.id,
            actorUserId: command.tenantId,
            statusCode: "REQUESTED",
            occurredAt: repair.createdAt.toISOString()
          },
          consumers: ["NOTIFICATION"]
        });

        return {
          request: this.requestRecord(repair, complaint, candidate),
          idempotent: false
        };
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      ) {
        throw error;
      }
      const complaint = await this.loadComplaint(
        this.prisma,
        command.tenantId,
        command.complaintId
      );
      const repairId = deterministicRepairId(command, this.idempotencySecret);
      const exactAttempt = await this.prisma.repairRequest.findUnique({
        where: { id: repairId }
      });
      if (
        !exactAttempt ||
        exactAttempt.ticketId !== complaint.ticket!.id ||
        exactAttempt.vendorId !== command.vendorId ||
        !(await this.isTenantVendorRequest(this.prisma, exactAttempt, complaint))
      ) {
        throw repositoryError(
          "ACTIVE_REPAIR_CONFLICT",
          "Another repair is already active for this ticket."
        );
      }
      const candidate = (
        await this.eligibleVendors(
          this.prisma,
          complaint,
          undefined,
          command.vendorId
        )
      )[0];
      if (!candidate) {
        throw repositoryError("VENDOR_NOT_ELIGIBLE", "Vendor is not eligible.");
      }
      return {
        request: this.requestRecord(exactAttempt, complaint, candidate),
        idempotent: true
      };
    }
  }

  async readWorkflowAuthority(
    tenantId: string,
    complaintId: string
  ): Promise<TenantVendorWorkflowAuthority> {
    const complaint = await this.loadComplaintScope(
      this.prisma,
      tenantId,
      complaintId
    );
    const ticket = complaint.ticket!;
    const activeRepair = await this.prisma.repairRequest.findFirst({
      where: {
        ticketId: ticket.id,
        status: { notIn: [...CLOSED_REPAIR_STATUSES] }
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
    });
    return {
      tenantId,
      complaintId: complaint.id,
      ticketId: ticket.id,
      complaintStatus: complaint.status,
      complaintUpdatedAt: complaint.updatedAt.toISOString(),
      ticketStatus: ticket.status,
      ticketUpdatedAt: ticket.updatedAt.toISOString(),
      ...(ticket.assignedVendorId
        ? { assignedVendorId: ticket.assignedVendorId }
        : {}),
      category: ticket.category,
      ...(activeRepair
        ? {
            activeRepair: {
              id: activeRepair.id,
              vendorId: activeRepair.vendorId,
              status: activeRepair.status,
              title: activeRepair.title,
              description: activeRepair.description,
              ...(activeRepair.costBearer
                ? { costBearer: activeRepair.costBearer }
                : {}),
              completionPhotoUrls: [...activeRepair.completionPhotoUrls],
              createdAt: activeRepair.createdAt.toISOString(),
              updatedAt: activeRepair.updatedAt.toISOString()
            }
          }
        : {})
    };
  }

  private async requireComplaint(
    db: DbClient,
    tenantId: string,
    complaintId: string
  ): Promise<ComplaintScope> {
    const complaint = await this.loadComplaint(db, tenantId, complaintId);
    this.assertTicketRequestable(complaint.ticket!.status);
    return complaint;
  }

  private async loadComplaint(
    db: DbClient,
    tenantId: string,
    complaintId: string
  ): Promise<ComplaintScope> {
    const complaint = await this.loadComplaintScope(db, tenantId, complaintId);
    if (complaint.ticket!.analysis?.responsibilityHint !== "임차인 책임 가능성") {
      throw repositoryError(
        "TENANT_RESPONSIBILITY_REQUIRED",
        "Responsibility is not assigned to tenant."
      );
    }
    return complaint;
  }

  private async loadComplaintScope(
    db: DbClient,
    tenantId: string,
    complaintId: string
  ): Promise<ComplaintScope> {
    const complaint = await db.complaint.findFirst({
      where: { id: complaintId, tenantId },
      include: COMPLAINT_INCLUDE
    });
    const ticket = complaint?.ticket;
    if (
      !complaint ||
      !ticket ||
      ticket.id !== complaint.ticketId ||
      ticket.complaintId !== complaint.id ||
      ticket.tenantId !== complaint.tenantId ||
      ticket.roomId !== complaint.roomId
    ) {
      throw repositoryError("COMPLAINT_NOT_FOUND", "Complaint was not found.");
    }
    return complaint;
  }

  private async isTenantVendorRequest(
    db: DbClient,
    repair: { id: string; vendorId: string },
    complaint: ComplaintScope
  ) {
    const event = await db.domainEventOutbox.findUnique({
      where: { eventKey: `vendor-job-assigned:${repair.id}` },
      select: {
        type: true,
        actorUserId: true,
        managerId: true,
        vendorId: true,
        repairId: true
      }
    });
    return (
      event?.type === "VENDOR_JOB_ASSIGNED" &&
      event.actorUserId === complaint.tenantId &&
      event.managerId === null &&
      event.vendorId === repair.vendorId &&
      event.repairId === repair.id
    );
  }

  private assertTicketRequestable(status: string) {
    if (
      !REQUESTABLE_TICKET_STATUSES.includes(
        status as (typeof REQUESTABLE_TICKET_STATUSES)[number]
      )
    ) {
      throw repositoryError(
        "TICKET_NOT_REQUESTABLE",
        "Ticket is not in a requestable state."
      );
    }
  }

  private async eligibleVendors(
    db: DbClient,
    complaint: ComplaintScope,
    query?: string,
    vendorId?: string
  ) {
    const ticket = complaint.ticket!;
    const normalizedQuery = query?.trim();
    const rows = await db.vendorProfile.findMany({
      where: {
        ...(vendorId ? { id: vendorId } : {}),
        verificationStatus: "VERIFIED",
        isActive: true,
        accountLinks: {
          some: { status: "ACTIVE", user: { status: "ACTIVE" } }
        },
        ...(normalizedQuery
          ? { businessName: { contains: normalizedQuery, mode: "insensitive" } }
          : {})
      },
      include: VENDOR_INCLUDE,
      take: 25,
      orderBy: [{ businessName: "asc" }, { id: "asc" }]
    });
    const requiredTrade = requiredVendorTrade(ticket.category);
    return rows.filter(
      (vendor) =>
        vendorSupportsRequiredTrade(vendor.trades, requiredTrade) &&
        servesAddress(vendor, ticket.room.address)
    );
  }

  private requestRecord(
    repair: {
      id: string;
      ticketId: string;
      vendorId: string;
      description: string;
      createdAt: Date;
    },
    complaint: ComplaintScope,
    vendor: EligibleVendor
  ): TenantVendorConnectionRequestRecord {
    return {
      id: repair.id,
      tenantId: complaint.tenantId,
      complaintId: complaint.id,
      ticketId: repair.ticketId,
      vendorId: repair.vendorId,
      status: "REQUESTED",
      requestNote: repair.description,
      createdAt: repair.createdAt.toISOString(),
      vendor: candidateRecord(complaint, vendor)
    };
  }
}
