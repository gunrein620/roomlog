import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  Prisma,
  PrismaClient,
  type ManagerVendor,
  type RepairStatus,
  type VendorAccountLink,
  type VendorProfile
} from "@prisma/client";
import type {
  CreateManagerVendorInput,
  ManagerVendorDetail,
  ManagerVendorJobLookup,
  ManagerVendorView,
  VendorAccountProjectionStatus,
  VendorCatalogRecord,
  VendorCatalogSearchFilters,
  VendorCatalogSearchResult,
  VendorCompletionReport as SharedVendorCompletionReport,
  VendorEstimate as SharedVendorEstimate,
  VendorJobPaymentView,
  VendorJobSummary,
  VendorPaymentRequest as SharedVendorPaymentRequest
} from "@roomlog/types";
import {
  ManagerVendorRepositoryError,
  type ManagerVendorRepository,
  type ManagerVendorRepositoryErrorCode
} from "./manager-vendor.repository";
import {
  isDirectManagerVendor,
  managerVendorAssignmentWhere,
  vendorAssignmentWhere,
  vendorServesAddress
} from "./vendor-assignment-eligibility";
import {
  suggestedVendorTrade,
  vendorSupportsRequiredTrade
} from "./vendor-trade-compatibility";

type DbClient = PrismaClient | Prisma.TransactionClient;
type CatalogProjection = VendorProfile & {
  accountLinks: VendorAccountLink[];
  managerVendors: ManagerVendor[];
};
type RelationProjection = ManagerVendor & {
  vendor: VendorProfile & { accountLinks: VendorAccountLink[] };
};
type EstimateProjection = Prisma.VendorEstimateGetPayload<{
  include: { lineItems: true };
}>;
type CompletionProjection = Prisma.VendorCompletionReportGetPayload<{
  include: {
    attachments: { include: { attachment: true } };
    decision: true;
  };
}>;
type PaymentProjection = Prisma.VendorPaymentRequestGetPayload<Record<string, never>>;
const MANAGER_JOB_INCLUDE = {
  ticket: { include: { room: true } },
  vendor: true,
  estimates: {
    include: { lineItems: true },
    orderBy: [{ version: "desc" as const }, { id: "desc" as const }]
  },
  completionReports: {
    include: {
      attachments: { include: { attachment: true } },
      decision: true
    },
    orderBy: [{ version: "desc" as const }, { id: "desc" as const }]
  },
  paymentRequest: true
} satisfies Prisma.RepairRequestInclude;
type ManagerJobProjection = Prisma.RepairRequestGetPayload<{
  include: typeof MANAGER_JOB_INCLUDE;
}>;

const ACTIVE_JOB_STATUSES = new Set<RepairStatus>([
  "REQUESTED",
  "ACCEPTED",
  "ESTIMATE_SUBMITTED",
  "ESTIMATE_APPROVED",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETION_REPORTED"
]);
const WAITING_PAYMENT_STATUSES = [
  "WAITING_COMPLETION",
  "PENDING_APPROVAL",
  "INSUFFICIENT_CREDIT"
] as const;

function repositoryError(
  code: ManagerVendorRepositoryErrorCode,
  message: string
) {
  return new ManagerVendorRepositoryError(code, message);
}

function mapCatalog(row: VendorProfile): VendorCatalogRecord {
  return {
    id: row.id,
    businessName: row.businessName,
    contactPerson: row.contactPerson,
    phone: row.phone,
    businessNumber: row.businessNumber ?? undefined,
    trades: [...row.trades],
    serviceAreas: [...row.serviceAreas],
    verificationStatus: row.verificationStatus,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function accountStatus(links: readonly VendorAccountLink[]): VendorAccountProjectionStatus {
  if (links.some((link) => link.status === "ACTIVE")) return "ACTIVE";
  return links.length > 0 ? "DISABLED" : "UNLINKED";
}

function assignmentState(
  catalog: VendorCatalogRecord,
  account: VendorAccountProjectionStatus,
  registration: "ACTIVE" | "ARCHIVED" | "UNREGISTERED",
  directRegistration = false,
) {
  const assignmentBlockReasons: VendorCatalogSearchResult["assignmentBlockReasons"] = [];
  if (!directRegistration && catalog.verificationStatus !== "VERIFIED") assignmentBlockReasons.push("UNVERIFIED");
  if (!catalog.isActive) assignmentBlockReasons.push("INACTIVE");
  if (!directRegistration && account !== "ACTIVE") assignmentBlockReasons.push("ACCOUNT_UNLINKED");
  if (registration !== "ACTIVE") assignmentBlockReasons.push("NOT_REGISTERED");
  return { canAssign: assignmentBlockReasons.length === 0, assignmentBlockReasons };
}

function mapSearchResult(
  row: CatalogProjection,
  managerId?: string,
): VendorCatalogSearchResult {
  const catalog = mapCatalog(row);
  const account = accountStatus(row.accountLinks);
  const registration = row.managerVendors[0]?.status ?? "UNREGISTERED";
  return {
    catalog,
    accountStatus: account,
    registrationStatus: registration,
    registrationSource:
      managerId !== undefined && isDirectManagerVendor(row, managerId)
        ? "MANAGER_DIRECT"
        : "PLATFORM",
    ...assignmentState(
      catalog,
      account,
      registration,
      managerId !== undefined && isDirectManagerVendor(row, managerId),
    )
  };
}

function normalized(value: string | undefined) {
  const result = value?.trim().toLocaleLowerCase("ko");
  return result || undefined;
}

function median(values: number[]) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function publicRoomNo(roomNo: string) {
  const normalizedRoomNo = roomNo.trim();
  return normalizedRoomNo.endsWith("호")
    ? normalizedRoomNo
    : `${normalizedRoomNo}호`;
}

function mapEstimate(row: EstimateProjection): SharedVendorEstimate {
  return {
    id: row.id,
    repairId: row.repairId,
    vendorId: row.vendorId,
    version: row.version,
    origin: row.origin,
    responseType: row.responseType,
    status: row.status,
    ...(row.visitAvailableAt ? { visitAvailableAt: row.visitAvailableAt.toISOString() } : {}),
    ...(row.estimatedDurationMinutes === null ? {} : { estimatedDurationMinutes: row.estimatedDurationMinutes }),
    ...(row.workDescription === null ? {} : { workDescription: row.workDescription }),
    ...(row.declineReason === null ? {} : { declineReason: row.declineReason }),
    ...(row.totalAmount === null ? {} : { totalAmount: row.totalAmount }),
    ...(row.submittedAt ? { submittedAt: row.submittedAt.toISOString() } : {}),
    ...(row.reviewedAt ? { reviewedAt: row.reviewedAt.toISOString() } : {}),
    ...(row.reviewedByManagerId === null ? {} : { reviewedByManagerId: row.reviewedByManagerId }),
    ...(row.reviewNote === null ? {} : { reviewNote: row.reviewNote }),
    lineItems: [...row.lineItems]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((line) => ({
        id: line.id,
        category: line.category,
        description: line.description,
        quantity: line.quantity,
        unitAmount: line.unitAmount,
        lineAmount: line.lineAmount,
        sortOrder: line.sortOrder
      }))
  };
}

function mapCompletion(row: CompletionProjection): SharedVendorCompletionReport {
  const attachments = [...row.attachments]
    .sort((left, right) => left.sortOrder - right.sortOrder);
  return {
    id: row.id,
    repairId: row.repairId,
    vendorId: row.vendorId,
    version: row.version,
    origin: row.origin,
    workSummary: row.workSummary,
    completedAt: row.completedAt.toISOString(),
    attachmentIds: attachments.map((attachment) => attachment.attachmentId),
    attachmentUrls: attachments.map((attachment) => attachment.attachment.fileUrl),
    ...(row.decision ? {
      review: {
        decision: row.decision.decision,
        ...(row.decision.note ? { note: row.decision.note } : {}),
        decidedAt: row.decision.decidedAt.toISOString()
      }
    } : {}),
    submissionKey: row.submissionKey,
    submittedAt: row.submittedAt.toISOString()
  };
}

function mapManagerJob(
  repair: ManagerJobProjection,
  managerId: string
): VendorJobSummary {
  const latestEstimate = repair.estimates[0];
  const latestCompletion = repair.completionReports[0];
  return {
    repairId: repair.id,
    ticketId: repair.ticketId,
    title: repair.title,
    trade: repair.ticket.category,
    status: repair.status,
    publicLocation: `${repair.ticket.room.buildingName} ${publicRoomNo(repair.ticket.room.roomNo)}`,
    ...(latestEstimate ? { latestEstimate: mapEstimate(latestEstimate) } : {}),
    ...(latestCompletion ? { latestCompletion: mapCompletion(latestCompletion) } : {}),
    ...(repair.paymentRequest?.managerId === managerId
      ? { paymentRequest: mapJobPayment(repair.paymentRequest) }
      : {}),
    updatedAt: repair.updatedAt.toISOString()
  };
}

function mapPayment(row: PaymentProjection): SharedVendorPaymentRequest {
  return {
    id: row.id,
    repairId: row.repairId,
    vendorId: row.vendorId,
    managerId: row.managerId,
    approvedEstimateId: row.approvedEstimateId,
    completionReportId: row.completionReportId,
    ...(row.completionDecisionId === null ? {} : { completionDecisionId: row.completionDecisionId }),
    ...(row.costId === null ? {} : { costId: row.costId }),
    payerRole: row.payerRole,
    payerUserId: row.payerUserId,
    amount: row.amount,
    status: row.status,
    ...(row.failureReason === null ? {} : { failureReason: row.failureReason }),
    ...(row.lastAttemptMode === null ? {} : { lastAttemptMode: row.lastAttemptMode }),
    ...(row.ledgerEntryId === null ? {} : { ledgerEntryId: row.ledgerEntryId }),
    createdAt: row.createdAt.toISOString(),
    ...(row.processedAt ? { processedAt: row.processedAt.toISOString() } : {})
  };
}

function mapJobPayment(row: PaymentProjection): VendorJobPaymentView {
  const payment = mapPayment(row);
  return {
    id: payment.id,
    repairId: payment.repairId,
    amount: payment.amount,
    status: payment.status,
    ...(payment.failureReason === undefined
      ? {}
      : { failureReason: payment.failureReason }),
    ...(payment.lastAttemptMode === undefined
      ? {}
      : { lastAttemptMode: payment.lastAttemptMode }),
    createdAt: payment.createdAt,
    ...(payment.processedAt === undefined
      ? {}
      : { processedAt: payment.processedAt })
  };
}

export class PrismaManagerVendorRepository implements ManagerVendorRepository {
  private readonly prisma: PrismaClient;

  constructor(
    databaseUrl: string,
    private readonly nextId: () => string = () => `mvd-${randomUUID()}`,
    private readonly nextVendorId: () => string = () => `ven-${randomUUID()}`
  ) {
    this.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl })
    });
  }

  async close() {
    await this.prisma.$disconnect();
  }

  async searchCatalog(managerId: string, filters: VendorCatalogSearchFilters) {
    await this.assertValidManager(this.prisma, managerId);
    const rows = await this.catalogRows(this.prisma, managerId, filters);
    return rows.map((row) => mapSearchResult(row));
  }

  async searchAssignmentCandidates(
    managerId: string,
    ticketId: string,
    query?: string
  ) {
    await this.assertValidManager(this.prisma, managerId);
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, room: { landlordId: managerId } },
      include: { room: true }
    });
    if (!ticket) {
      throw repositoryError("RELATION_NOT_FOUND", "Assignable ticket was not found.");
    }
    const normalizedQuery = query?.trim();
    const rows = await this.prisma.vendorProfile.findMany({
      where: {
        ...managerVendorAssignmentWhere(managerId),
        ...(normalizedQuery
          ? { businessName: { contains: normalizedQuery, mode: "insensitive" } }
          : {})
      },
      include: {
        accountLinks: {
          where: { status: "ACTIVE", user: { status: "ACTIVE" } }
        },
        managerVendors: {
          where: { managerId, status: "ACTIVE" }
        }
      },
      orderBy: [{ businessName: "asc" }, { id: "asc" }],
      take: 25
    });
    const suggestedTrade = suggestedVendorTrade(ticket.category);
    const candidates = rows.filter((vendor) =>
      isDirectManagerVendor(vendor, managerId)
      || vendorServesAddress(vendor, ticket.room.address),
    );
    if (suggestedTrade) {
      candidates.sort((left, right) =>
        Number(vendorSupportsRequiredTrade(right.trades, suggestedTrade))
        - Number(vendorSupportsRequiredTrade(left.trades, suggestedTrade))
      );
    }
    return candidates
      .map((vendor) => mapSearchResult(vendor, managerId));
  }

  async list(managerId: string, filters: VendorCatalogSearchFilters) {
    await this.assertValidManager(this.prisma, managerId);
    const rows = await this.prisma.managerVendor.findMany({
      where: {
        managerId,
        vendor: this.visibleCatalogWhere(managerId, filters)
      },
      include: { vendor: { include: { accountLinks: true } } },
      orderBy: [{ vendor: { businessName: "asc" } }, { vendorId: "asc" }]
    });
    const postFiltered = rows.filter(({ vendor }) => this.matchesArrayFilters(vendor, filters));
    return this.projectViews(this.prisma, managerId, postFiltered);
  }

  async getDetail(managerId: string, vendorId: string) {
    await this.assertValidManager(this.prisma, managerId);
    const relation = await this.findVisibleRelation(this.prisma, managerId, vendorId);
    if (!relation) return null;
    const [vendor] = await this.projectViews(this.prisma, managerId, [relation]);
    const repairs = await this.prisma.repairRequest.findMany({
        where: { vendorId, ticket: { room: { landlordId: managerId } } },
        include: MANAGER_JOB_INCLUDE,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }]
      });
      const jobs = repairs.map((repair) => mapManagerJob(repair, managerId));
      const completed = repairs.filter((repair) => repair.status === "COMPLETED");
      const responseHours = completed.flatMap((repair) => {
        const submitted = repair.estimates
          .map((estimate) => estimate.submittedAt)
          .filter((value): value is Date => value instanceof Date)
          .sort((a, b) => a.getTime() - b.getTime())[0];
        if (!submitted) return [];
        const hours = (submitted.getTime() - repair.createdAt.getTime()) / 3_600_000;
        return hours >= 0 ? [hours] : [];
      });
      const approvedAmounts = completed.flatMap((repair) => {
        const amount = repair.estimates.find((estimate) => estimate.status === "APPROVED")?.totalAmount;
        return typeof amount === "number" && amount > 0 ? [amount] : [];
      });
      const latestCompletedAt = completed
        .map((repair) => repair.completedAt ?? repair.updatedAt)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const medianEstimateResponseHours = median(responseHours);
      const averageApprovedAmount = approvedAmounts.length
        ? approvedAmounts.reduce((sum, amount) => sum + amount, 0) / approvedAmounts.length
        : undefined;
    return {
      vendor,
      jobs,
      performance: {
        completedCount: completed.length,
        ...(medianEstimateResponseHours === undefined ? {} : { medianEstimateResponseHours }),
        ...(averageApprovedAmount === undefined ? {} : { averageApprovedAmount }),
        updatedAt: (latestCompletedAt ?? relation.updatedAt).toISOString()
      }
    };
  }

  async findJobByTicket(
    managerId: string,
    ticketId: string
  ): Promise<ManagerVendorJobLookup | null> {
    await this.assertValidManager(this.prisma, managerId);
    const ownedTicket = { ticketId, ticket: { room: { landlordId: managerId } } };
    const active = await this.prisma.repairRequest.findFirst({
      where: {
        ...ownedTicket,
        status: { notIn: ["COMPLETED", "CANCELLED"] }
      },
      include: MANAGER_JOB_INCLUDE,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
    });
    const repair = active ?? await this.prisma.repairRequest.findFirst({
      where: { ...ownedTicket, status: "COMPLETED" },
      include: MANAGER_JOB_INCLUDE,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
    });
    if (!repair) return null;

    const relation = await this.findRelation(
      this.prisma,
      managerId,
      repair.vendorId
    );
    if (!relation) {
      return {
        partnership: "UNREGISTERED" as const,
        vendor: {
          vendorId: repair.vendorId,
          catalog: mapCatalog(repair.vendor)
        },
        job: mapManagerJob(repair, managerId)
      };
    }
    const [vendor] = await this.projectViews(this.prisma, managerId, [relation]);
    return {
      partnership: "REGISTERED" as const,
      vendor,
      job: mapManagerJob(repair, managerId)
    };
  }

  async register(managerId: string, vendorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertValidManager(tx, managerId);
      const vendor = await tx.vendorProfile.findFirst({
        where: { id: vendorId, createdByManagerId: null, ...vendorAssignmentWhere() },
        select: { id: true }
      });
      if (!vendor) throw repositoryError("VENDOR_NOT_FOUND", "Vendor catalog record was not found.");
      await tx.managerVendor.upsert({
        where: { managerId_vendorId: { managerId, vendorId } },
        create: { id: this.nextId(), managerId, vendorId, status: "ACTIVE" },
        update: { status: "ACTIVE" }
      });
      return this.requireVisibleView(tx, managerId, vendorId);
    });
  }

  async createManual(managerId: string, input: CreateManagerVendorInput) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertValidManager(tx, managerId);
        const vendorId = this.nextVendorId();
        await tx.vendorProfile.create({
          data: {
            id: vendorId,
            businessName: input.businessName,
            contactPerson: input.businessName,
            phone: input.phone,
            serviceArea: "",
            trades: [],
            serviceAreas: [],
            verificationStatus: "PENDING",
            isActive: true,
            createdByManagerId: managerId,
          },
        });
        await tx.managerVendor.create({
          data: {
            id: this.nextId(),
            managerId,
            vendorId,
            status: "ACTIVE",
            settlementAccountNumber: input.accountNumber,
          },
        });
        return this.requireView(tx, managerId, vendorId);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002"
      ) {
        throw repositoryError("DUPLICATE_VENDOR", "Manager vendor phone already exists.");
      }
      throw error;
    }
  }

  async updateNote(managerId: string, vendorId: string, managerNote: string | null) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertValidManager(tx, managerId);
      const result = await tx.managerVendor.updateMany({
        where: { managerId, vendorId, vendor: this.visibleCatalogWhere(managerId, {}) },
        data: { managerNote }
      });
      if (result.count !== 1) throw repositoryError("RELATION_NOT_FOUND", "Manager vendor relation was not found.");
      return this.requireVisibleView(tx, managerId, vendorId);
    });
  }

  async archive(managerId: string, vendorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertValidManager(tx, managerId);
      const result = await tx.managerVendor.updateMany({
        where: { managerId, vendorId, vendor: this.visibleCatalogWhere(managerId, {}) },
        data: { status: "ARCHIVED" }
      });
      if (result.count !== 1) throw repositoryError("RELATION_NOT_FOUND", "Manager vendor relation was not found.");
      return this.requireVisibleView(tx, managerId, vendorId);
    });
  }

  private async assertValidManager(db: DbClient, managerId: string) {
    const manager = await db.userAccount.findFirst({
      where: { id: managerId, status: "ACTIVE" },
      select: { role: true }
    });
    if (!manager) {
      throw repositoryError("INVALID_MANAGER", "Manager access is unavailable.");
    }
    if (manager.role === "LANDLORD") return;

    const ownedRoom = await db.room.findFirst({
      where: { landlordId: managerId },
      select: { id: true }
    });
    if (!ownedRoom) {
      throw repositoryError("INVALID_MANAGER", "Manager access is unavailable.");
    }
  }

  private catalogWhere(filters: VendorCatalogSearchFilters): Prisma.VendorProfileWhereInput {
    const query = filters.query?.trim();
    return {
      ...(filters.verificationStatus ? { verificationStatus: filters.verificationStatus } : {}),
      ...(typeof filters.isActive === "boolean" ? { isActive: filters.isActive } : {}),
      ...(query ? { OR: [
        { businessName: { contains: query, mode: "insensitive" } },
        { contactPerson: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } },
        { businessNumber: { contains: query, mode: "insensitive" } }
      ] } : {})
    };
  }

  private operationalCatalogWhere(
    filters: VendorCatalogSearchFilters
  ): Prisma.VendorProfileWhereInput {
    return { ...this.catalogWhere(filters), ...vendorAssignmentWhere() };
  }

  private visibleCatalogWhere(
    managerId: string,
    filters: VendorCatalogSearchFilters
  ): Prisma.VendorProfileWhereInput {
    return {
      AND: [
        this.catalogWhere(filters),
        {
          OR: [
            vendorAssignmentWhere(),
            { createdByManagerId: managerId },
          ],
        },
      ],
    };
  }

  private matchesArrayFilters(vendor: VendorProfile, filters: VendorCatalogSearchFilters) {
    const trade = normalized(filters.trade);
    const area = normalized(filters.serviceArea);
    const matchesTrade = !trade || vendor.trades.some((candidate) => normalized(candidate) === trade);
    const matchesArea = !area || [vendor.serviceArea, ...vendor.serviceAreas]
      .some((candidate) => normalized(candidate)?.includes(area));
    return matchesTrade && matchesArea;
  }

  private async catalogRows(db: DbClient, managerId: string, filters: VendorCatalogSearchFilters) {
    const rows = await db.vendorProfile.findMany({
      where: {
        ...this.operationalCatalogWhere(filters),
        createdByManagerId: null,
      },
      include: {
        accountLinks: true,
        managerVendors: { where: { managerId } }
      }
    });
    return rows
      .filter((row) => this.matchesArrayFilters(row, filters))
      .sort((left, right) => left.businessName.localeCompare(right.businessName, "ko") || left.id.localeCompare(right.id));
  }

  private async findRelation(db: DbClient, managerId: string, vendorId: string) {
    return db.managerVendor.findUnique({
      where: { managerId_vendorId: { managerId, vendorId } },
      include: { vendor: { include: { accountLinks: true } } }
    });
  }

  private async findVisibleRelation(db: DbClient, managerId: string, vendorId: string) {
    return db.managerVendor.findFirst({
      where: {
        managerId,
        vendorId,
        vendor: this.visibleCatalogWhere(managerId, {}),
      },
      include: { vendor: { include: { accountLinks: true } } }
    });
  }

  private async requireView(db: DbClient, managerId: string, vendorId: string) {
    const relation = await this.findRelation(db, managerId, vendorId);
    if (!relation) throw repositoryError("RELATION_NOT_FOUND", "Manager vendor relation was not found.");
    const [view] = await this.projectViews(db, managerId, [relation]);
    return view;
  }

  private async requireVisibleView(db: DbClient, managerId: string, vendorId: string) {
    const relation = await this.findVisibleRelation(db, managerId, vendorId);
    if (!relation) throw repositoryError("RELATION_NOT_FOUND", "Manager vendor relation was not found.");
    const [view] = await this.projectViews(db, managerId, [relation]);
    return view;
  }

  private async projectViews(
    db: DbClient,
    managerId: string,
    rows: RelationProjection[]
  ): Promise<ManagerVendorView[]> {
    if (rows.length === 0) return [];
    const vendorIds = rows.map((row) => row.vendorId);
    const repairs = await db.repairRequest.findMany({
      where: { vendorId: { in: vendorIds }, ticket: { room: { landlordId: managerId } } },
      select: { vendorId: true, status: true }
    });
    const payments = await db.vendorPaymentRequest.findMany({
      where: {
        vendorId: { in: vendorIds }, managerId,
        status: { in: [...WAITING_PAYMENT_STATUSES] },
        repair: { ticket: { room: { landlordId: managerId } } }
      },
      select: { vendorId: true }
    });
    const counts = new Map<string, { active: number; completed: number; waiting: number }>();
    for (const vendorId of vendorIds) counts.set(vendorId, { active: 0, completed: 0, waiting: 0 });
    for (const repair of repairs) {
      const count = counts.get(repair.vendorId)!;
      if (ACTIVE_JOB_STATUSES.has(repair.status)) count.active += 1;
      if (repair.status === "COMPLETED") count.completed += 1;
    }
    for (const payment of payments) counts.get(payment.vendorId)!.waiting += 1;
    return rows.map((row) => {
      const count = counts.get(row.vendorId)!;
      return {
        id: row.id,
        managerId: row.managerId,
        vendorId: row.vendorId,
        status: row.status,
        ...(row.managerNote === null ? {} : { managerNote: row.managerNote }),
        ...(row.settlementAccountNumber === null
          ? {}
          : { settlementAccountNumber: row.settlementAccountNumber }),
        registeredAt: row.registeredAt.toISOString(),
        catalog: mapCatalog(row.vendor),
        accountStatus: accountStatus(row.vendor.accountLinks),
        activeJobCount: count.active,
        waitingPaymentCount: count.waiting,
        completedJobCount: count.completed
      };
    });
  }
}
