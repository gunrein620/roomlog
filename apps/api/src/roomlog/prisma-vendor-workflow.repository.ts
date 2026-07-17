import { createHash, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import type {
  DecideRepairCompletionInput,
  RepairCompletionDecision as SharedRepairCompletionDecision,
  RequestTenantDirectPaymentInput,
  StartVendorJobResult,
  SubmitVendorCompletionInput,
  TenantVendorCompletionDecisionInput,
  TenantVendorEstimateReviewInput,
  TenantVendorVisitScheduleInput,
  TenantVendorWorkflowView,
  VendorCompletionReport as SharedVendorCompletionReport,
  VendorEstimate as SharedVendorEstimate,
  VendorEstimateDraftInput,
  VendorEstimateReviewInput,
  VendorJobDetail,
  VendorJobEstimateView,
  VendorJobPaymentView,
  VendorJobSummary,
  VendorPaymentRequest as SharedVendorPaymentRequest,
  VendorSettlementRow,
  VendorVisitScheduleInput
} from "@roomlog/types";
import type { DomainEventRepository } from "../domain-events/domain-event.repository";
import { mapRepairPaymentOrder } from "../credit/prisma-repair-payment-order.repository";
import { publicRepairPaymentOrder } from "../credit/repair-payment-order-public";
import {
  requiredVendorTrade
} from "./vendor-trade-compatibility";
import {
  vendorAssignmentWhere,
  vendorServesAddress
} from "./vendor-assignment-eligibility";
import { isVendorCompletionPrivateFileName } from "./vendor-completion-storage";
import {
  VendorWorkflowRepositoryError,
  type AssignVendorCommand,
  type CompletionCommit,
  type DecisionCommit,
  type SaveVendorCompletionAttachmentCommand,
  type VendorCompletionAttachmentAccess,
  type VendorWorkflowRepository
} from "./vendor-workflow.repository";

const CLOSED_REPAIR_STATUSES = ["COMPLETED", "CANCELLED"] as const;
const PRESERVED_REPAIR_LIFECYCLE_STATUSES = ["SCHEDULED", "IN_PROGRESS"] as const;
const PENDING_ESTIMATE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "VISIT_SCHEDULED",
  "REVISION_REQUESTED"
] as const;
const MAX_DATABASE_INT = 2_147_483_647;
const SAFE_COMPLETION_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif"
]);

type DbClient = PrismaClient | Prisma.TransactionClient;
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
type DirectPaymentProjection = Prisma.VendorPaymentRequestGetPayload<{
  include: { repair: { include: { ticket: { include: { room: true } } } } };
}>;
type DecisionProjection = Prisma.RepairCompletionDecisionGetPayload<Record<string, never>>;
const JOB_INCLUDE = {
  ticket: { include: { room: true, analysis: true } },
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
  paymentRequest: {
    include: {
      repairPaymentOrders: {
        orderBy: [{ updatedAt: "desc" as const }, { id: "desc" as const }],
        take: 1
      }
    }
  }
} satisfies Prisma.RepairRequestInclude;
type JobProjection = Prisma.RepairRequestGetPayload<{ include: typeof JOB_INCLUDE }>;
type LockedRepair = Prisma.RepairRequestGetPayload<{
  include: {
    ticket: { include: { room: true } };
    paymentRequest: true;
  };
}>;

interface NormalizedCompletionInput {
  workSummary: string;
  completedAt: Date;
  attachmentIds: string[];
  submissionKey: string;
  payloadHash: string;
}

type NormalizedDraft =
  | {
      responseType: "FIXED_ESTIMATE";
      workDescription: string;
      estimatedDurationMinutes: number | null;
      visitAvailableAt: null;
      declineReason: null;
      totalAmount: number;
      lineItems: Array<{
        category: "VISIT" | "LABOR" | "MATERIAL";
        description: string;
        quantity: number;
        unitAmount: number;
        lineAmount: number;
        sortOrder: number;
      }>;
    }
  | {
      responseType: "VISIT_REQUIRED";
      workDescription: string;
      estimatedDurationMinutes: null;
      visitAvailableAt: Date;
      declineReason: null;
      totalAmount: null;
      lineItems: [];
    }
  | {
      responseType: "DECLINED";
      workDescription: null;
      estimatedDurationMinutes: null;
      visitAvailableAt: null;
      declineReason: string;
      totalAmount: null;
      lineItems: [];
    };

function workflowError(
  code: ConstructorParameters<typeof VendorWorkflowRepositoryError>[0],
  message: string
) {
  return new VendorWorkflowRepositoryError(code, message);
}

function publicRoomNo(roomNo: string) {
  const normalized = roomNo.trim();
  return normalized.endsWith("호") ? normalized : `${normalized}호`;
}

function requiredText(value: unknown, message: string) {
  if (typeof value !== "string") throw workflowError("INVALID_REQUEST", message);
  const normalized = value.trim();
  if (!normalized) throw workflowError("INVALID_REQUEST", message);
  return normalized;
}

function validDate(value: unknown, message: string) {
  if (typeof value !== "string") throw workflowError("INVALID_REQUEST", message);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw workflowError("INVALID_REQUEST", message);
  return date;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function completionPayloadHash(input: {
  vendorId: string;
  repairId: string;
  workSummary: string;
  completedAt: string;
  attachmentIds: string[];
}) {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

function directPaymentPayloadHash(input: {
  paymentRequestId: string;
  tenantId: string;
  vendorId: string;
  amount: number;
  completionDecisionId: string | null;
}) {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

function normalizedCompletionInput(
  vendorId: string,
  repairId: string,
  input: SubmitVendorCompletionInput
): NormalizedCompletionInput {
  if (!input || typeof input !== "object") {
    throw workflowError("INVALID_REQUEST", "완료 보고 내용을 확인해 주세요.");
  }
  const workSummary = requiredText(input.workSummary, "완료한 작업 내용을 입력해 주세요.");
  const completedAt = validDate(input.completedAt, "유효한 작업 완료 일시를 입력해 주세요.");
  const submissionKey = requiredText(input.submissionKey, "완료 보고 제출 키를 확인해 주세요.");
  if (!Array.isArray(input.attachmentIds)) {
    throw workflowError("INVALID_REQUEST", "완료 사진 목록을 확인해 주세요.");
  }
  const attachmentIds = [...new Set(input.attachmentIds.map((value) =>
    requiredText(value, "완료 사진 정보를 확인해 주세요.")
  ))].sort();
  if (attachmentIds.length < 1 || attachmentIds.length > 6) {
    throw workflowError("INVALID_REQUEST", "완료 사진은 1장 이상 6장 이하로 첨부해 주세요.");
  }
  const completedAtIso = completedAt.toISOString();
  return {
    workSummary,
    completedAt,
    attachmentIds,
    submissionKey,
    payloadHash: completionPayloadHash({
      vendorId,
      repairId,
      workSummary,
      completedAt: completedAtIso,
      attachmentIds
    })
  };
}

function normalizedCompletionDecision(input: DecideRepairCompletionInput) {
  if (!input || typeof input !== "object" || !["APPROVED", "REJECTED"].includes(input.decision)) {
    throw workflowError("INVALID_REQUEST", "지원하지 않는 완료 검토 방식입니다.");
  }
  if (input.note !== undefined && typeof input.note !== "string") {
    throw workflowError("INVALID_REQUEST", "완료 검토 메모를 확인해 주세요.");
  }
  const note = typeof input.note === "string" ? input.note.trim() || null : null;
  if (input.decision === "REJECTED" && !note) {
    throw workflowError("INVALID_REQUEST", "완료 반려 사유를 입력해 주세요.");
  }
  return { decision: input.decision, note } as const;
}

function assertResolvedCostBearer(costBearer: unknown) {
  if (costBearer !== "LANDLORD" && costBearer !== "TENANT") {
    throw workflowError(
      "INVALID_STATE",
      "비용 부담 주체를 확정한 뒤 작업을 진행해 주세요."
    );
  }
}

function positiveDatabaseInteger(value: unknown, message: string) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > MAX_DATABASE_INT
  ) {
    throw workflowError("INVALID_REQUEST", message);
  }
  return value;
}

function normalizedDraft(input: VendorEstimateDraftInput): NormalizedDraft {
  if (!input || !["FIXED_ESTIMATE", "VISIT_REQUIRED", "DECLINED"].includes(input.responseType)) {
    throw workflowError("INVALID_REQUEST", "지원하지 않는 견적 응답 유형입니다.");
  }
  if (input.responseType === "FIXED_ESTIMATE") {
    if (!Array.isArray(input.lineItems) || input.lineItems.length === 0) {
      throw workflowError("INVALID_REQUEST", "견적 항목을 한 개 이상 입력해 주세요.");
    }
    const estimatedDurationMinutes = input.estimatedDurationMinutes === undefined
      ? null
      : positiveDatabaseInteger(input.estimatedDurationMinutes, "예상 작업 시간은 양의 정수여야 합니다.");
    const lineItems = input.lineItems.map((line, sortOrder) => {
      if (!line || typeof line !== "object") {
        throw workflowError("INVALID_REQUEST", "견적 항목 형식을 확인해 주세요.");
      }
      if (!(["VISIT", "LABOR", "MATERIAL"] as const).includes(line.category)) {
        throw workflowError("INVALID_REQUEST", "지원하지 않는 견적 항목 유형입니다.");
      }
      const quantity = positiveDatabaseInteger(line.quantity, "수량은 양의 정수여야 합니다.");
      const unitAmount = positiveDatabaseInteger(line.unitAmount, "단가는 양의 정수여야 합니다.");
      const lineAmount = quantity * unitAmount;
      if (!Number.isSafeInteger(lineAmount) || lineAmount > MAX_DATABASE_INT) {
        throw workflowError("INVALID_REQUEST", "견적 금액이 허용 범위를 초과했습니다.");
      }
      return {
        category: line.category,
        description: requiredText(line.description, "견적 항목 설명을 입력해 주세요."),
        quantity,
        unitAmount,
        lineAmount,
        sortOrder
      };
    });
    const totalAmount = lineItems.reduce((sum, line) => sum + line.lineAmount, 0);
    if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0 || totalAmount > MAX_DATABASE_INT) {
      throw workflowError("INVALID_REQUEST", "총 견적 금액이 허용 범위를 초과했습니다.");
    }
    return {
      responseType: "FIXED_ESTIMATE",
      workDescription: requiredText(input.workDescription, "작업 내용을 입력해 주세요."),
      estimatedDurationMinutes,
      visitAvailableAt: null,
      declineReason: null,
      totalAmount,
      lineItems
    };
  }

  if (input.responseType === "VISIT_REQUIRED") {
    return {
      responseType: "VISIT_REQUIRED",
      workDescription: requiredText(input.workDescription, "방문이 필요한 이유를 입력해 주세요."),
      estimatedDurationMinutes: null,
      visitAvailableAt: validDate(input.visitAvailableAt, "유효한 방문 가능 일시를 입력해 주세요."),
      declineReason: null,
      totalAmount: null,
      lineItems: []
    };
  }

  return {
    responseType: "DECLINED",
    workDescription: null,
    estimatedDurationMinutes: null,
    visitAvailableAt: null,
    declineReason: requiredText(input.declineReason, "작업 거절 사유를 입력해 주세요."),
    totalAmount: null,
    lineItems: []
  };
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
    ...(row.reviewedByTenantId === null ? {} : { reviewedByTenantId: row.reviewedByTenantId }),
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

function mapJobEstimate(row: EstimateProjection): VendorJobEstimateView {
  const {
    reviewedByManagerId: _internalManagerId,
    reviewedByTenantId: _internalTenantId,
    ...publicEstimate
  } = mapEstimate(row);
  return publicEstimate;
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

function publicTicketAttachmentUrls(ticket: JobProjection["ticket"]): string[] {
  const photoAnalysis = ticket.analysis?.photoAnalysis;
  const analysisUrls = photoAnalysis
    && typeof photoAnalysis === "object"
    && !Array.isArray(photoAnalysis)
    && Array.isArray((photoAnalysis as { attachmentUrls?: unknown }).attachmentUrls)
      ? (photoAnalysis as { attachmentUrls: unknown[] }).attachmentUrls
          .filter((value): value is string => typeof value === "string")
      : [];
  return [...new Set(analysisUrls
    .map((value) => value.trim())
    .filter(Boolean))];
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

function mapDecision(row: DecisionProjection): SharedRepairCompletionDecision {
  return {
    id: row.id,
    repairId: row.repairId,
    completionReportId: row.completionReportId,
    ...(row.managerId === null ? {} : { managerId: row.managerId }),
    ...(row.tenantId === null ? {} : { tenantId: row.tenantId }),
    source: row.source,
    decision: row.decision,
    ...(row.note === null ? {} : { note: row.note }),
    decidedAt: row.decidedAt.toISOString()
  };
}

function mapJobPayment(row: PaymentProjection): VendorJobPaymentView {
  return {
    id: row.id,
    repairId: row.repairId,
    amount: row.amount,
    status: row.status,
    ...(row.failureReason === null ? {} : { failureReason: row.failureReason }),
    ...(row.lastAttemptMode === null ? {} : { lastAttemptMode: row.lastAttemptMode }),
    createdAt: row.createdAt.toISOString(),
    ...(row.processedAt ? { processedAt: row.processedAt.toISOString() } : {})
  };
}

export class PrismaVendorWorkflowRepository implements VendorWorkflowRepository {
  private readonly prisma: PrismaClient;

  constructor(
    databaseUrl: string,
    private readonly domainEvents: DomainEventRepository,
    private readonly nextId: (prefix: string) => string = (prefix) => `${prefix}-${randomUUID()}`,
    private readonly clock: () => Date = () => new Date()
  ) {
    this.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl })
    });
  }

  async close() {
    await this.prisma.$disconnect();
  }

  async assignVendor(command: AssignVendorCommand): Promise<VendorJobDetail> {
    const requestNote = command.requestNote.trim();
    if (!requestNote) {
      throw workflowError("INVALID_REQUEST", "업체에 전달할 요청 내용을 입력해 주세요.");
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const manager = await tx.userAccount.findFirst({
          where: { id: command.managerId, status: "ACTIVE" },
          select: { id: true }
        });
        if (!manager) {
          throw workflowError("INVALID_MANAGER", "활성 관리자 계정으로만 업체를 배정할 수 있습니다.");
        }

        const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "Ticket" WHERE "id" = ${command.ticketId} FOR UPDATE
        `);
        if (locked.length === 0) {
          throw workflowError("TICKET_NOT_FOUND", "배정할 하자 접수 건을 찾을 수 없습니다.");
        }

        const ticket = await tx.ticket.findUnique({
          where: { id: command.ticketId },
          include: { room: true }
        });
        if (!ticket) {
          throw workflowError("TICKET_NOT_FOUND", "배정할 하자 접수 건을 찾을 수 없습니다.");
        }
        if (ticket.room.landlordId !== command.managerId) {
          throw workflowError("TICKET_ACCESS_DENIED", "이 하자 접수 건에 업체를 배정할 권한이 없습니다.");
        }

        const candidate = await tx.vendorProfile.findFirst({
          where: {
            id: command.vendorId,
            ...vendorAssignmentWhere(command.managerId)
          },
          include: {
            accountLinks: {
              where: { status: "ACTIVE", user: { status: "ACTIVE" } },
              select: { userId: true },
              orderBy: [{ linkedAt: "asc" }, { id: "asc" }]
            },
            managerVendors: {
              where: { managerId: command.managerId, status: "ACTIVE" },
              select: { id: true }
            }
          }
        });
        if (
          !candidate ||
          candidate.accountLinks.length === 0 ||
          candidate.managerVendors.length === 0
        ) {
          throw workflowError("VENDOR_NOT_ASSIGNABLE", "현재 상태의 업체는 배정할 수 없습니다.");
        }

        if (!vendorServesAddress(candidate, ticket.room.address)) {
          throw workflowError("VENDOR_NOT_ASSIGNABLE", "해당 하자 위치에 출동 가능한 업체가 아닙니다.");
        }

        const current = await tx.repairRequest.findFirst({
          where: { ticketId: ticket.id, status: { notIn: [...CLOSED_REPAIR_STATUSES] } },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
        });
        if (current?.vendorId === command.vendorId) {
          return await this.projectJob(tx, current.id);
        }
        if (current) {
          if (current.status !== "REQUESTED") {
            throw workflowError(
              "INVALID_STATE",
              "견적 또는 작업이 진행된 수리는 취소 절차 없이 다른 업체로 재배정할 수 없습니다."
            );
          }
          await tx.repairRequest.update({
            where: { id: current.id },
            data: { status: "CANCELLED" }
          });
        }

        const repair = await tx.repairRequest.create({
          data: {
            id: this.nextId("repair"),
            ticketId: ticket.id,
            vendorId: command.vendorId,
            status: "REQUESTED",
            title: `${ticket.category} 처리 요청`,
            description: requestNote,
            completionPhotoUrls: []
          }
        });
        await tx.ticket.update({
          where: { id: ticket.id },
          data: { assignedVendorId: command.vendorId, status: "VENDOR_ASSIGNED" }
        });
        await tx.complaint.update({
          where: { id: ticket.complaintId },
          data: { status: "VENDOR_ASSIGNED" }
        });

        const targetUserIds = [...new Set(candidate.accountLinks.map((link) => link.userId))];
        await this.domainEvents.enqueue(tx, {
          event: {
            eventKey: `vendor-job-assigned:${repair.id}`,
            type: "VENDOR_JOB_ASSIGNED",
            targetUserIds,
            vendorId: command.vendorId,
            managerId: command.managerId,
            repairId: repair.id,
            actorUserId: command.managerId,
            statusCode: "REQUESTED",
            occurredAt: repair.createdAt.toISOString()
          },
          consumers: ["NOTIFICATION"]
        });

        return await this.projectJob(tx, repair.id);
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }

      const active = await this.prisma.repairRequest.findFirst({
        where: { ticketId: command.ticketId, status: { notIn: [...CLOSED_REPAIR_STATUSES] } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
      });
      if (active?.vendorId === command.vendorId) {
        return await this.projectJob(this.prisma, active.id);
      }
      throw workflowError("CONCURRENT_ASSIGNMENT", "다른 업체 배정이 먼저 처리되었습니다. 화면을 새로고침해 주세요.");
    }
  }

  async listJobs(vendorId: string): Promise<VendorJobSummary[]> {
    const rows = await this.prisma.repairRequest.findMany({
      where: { vendorId, status: { not: "COMPLETED" } },
      include: this.jobInclude(),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
    });
    return rows.map((row) => this.projectSummary(row));
  }

  async getJob(vendorId: string, repairId: string): Promise<VendorJobDetail | null> {
    const row = await this.prisma.repairRequest.findFirst({
      where: { id: repairId, vendorId },
      include: this.jobInclude()
    });
    return row ? this.projectJobRow(row) : null;
  }

  async getTenantWorkflow(
    tenantId: string,
    complaintId: string
  ): Promise<TenantVendorWorkflowView | null> {
    const normalizedTenantId = requiredText(tenantId, "임차인 정보를 확인해 주세요.");
    const normalizedComplaintId = requiredText(
      complaintId,
      "하자 접수 정보를 확인해 주세요."
    );
    const complaint = await this.prisma.complaint.findFirst({
      where: {
        id: normalizedComplaintId,
        tenantId: normalizedTenantId,
        tenant: { role: "TENANT", status: "ACTIVE" },
        room: { tenants: { some: { tenantId: normalizedTenantId } } }
      },
      select: { id: true, ticketId: true }
    });
    if (!complaint) {
      throw workflowError("REPAIR_ACCESS_DENIED", "조회 가능한 하자 접수를 찾을 수 없습니다.");
    }
    const row = await this.prisma.repairRequest.findFirst({
      where: {
        ticketId: complaint.ticketId,
        costBearer: "TENANT",
        domainEvents: {
          some: {
            type: "VENDOR_JOB_ASSIGNED",
            actorUserId: normalizedTenantId,
            managerId: null
          }
        }
      },
      include: this.jobInclude(),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
    });
    return row
      ? this.projectTenantWorkflowRow(row, normalizedComplaintId)
      : null;
  }

  async listTenantPayableWorkflows(
    tenantId: string
  ): Promise<TenantVendorWorkflowView[]> {
    const normalizedTenantId = requiredText(
      tenantId,
      "임차인 정보를 확인해 주세요."
    );
    const rows = await this.prisma.repairRequest.findMany({
      where: {
        costBearer: "TENANT",
        paymentRequest: {
          is: {
            payerRole: "TENANT",
            payerUserId: normalizedTenantId,
            status: "PENDING_APPROVAL",
            NOT: { lastAttemptMode: "DIRECT" }
          }
        },
        ticket: {
          tenantId: normalizedTenantId,
          tenant: { role: "TENANT", status: "ACTIVE" },
          complaint: { tenantId: normalizedTenantId },
          room: { tenants: { some: { tenantId: normalizedTenantId } } }
        }
      },
      include: this.jobInclude(),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
    });
    return rows.map((row) =>
      this.projectTenantWorkflowRow(row, row.ticket.complaintId)
    );
  }

  async reviewTenantEstimate(
    tenantId: string,
    repairId: string,
    estimateId: string,
    input: TenantVendorEstimateReviewInput
  ): Promise<TenantVendorWorkflowView> {
    if (!input || !["APPROVE", "REQUEST_REVISION"].includes(input.action)) {
      throw workflowError("INVALID_REQUEST", "지원하지 않는 견적 검토 방식입니다.");
    }
    const normalizedTenantId = requiredText(tenantId, "임차인 정보를 확인해 주세요.");
    const normalizedRepairId = requiredText(repairId, "수리 작업 정보를 확인해 주세요.");
    const normalizedEstimateId = requiredText(estimateId, "견적 정보를 확인해 주세요.");
    const note = "note" in input ? requiredText(input.note, "수정 요청 사유를 입력해 주세요.") : null;

    return this.prisma.$transaction(async (tx) => {
      const repair = await this.lockRepair(tx, normalizedRepairId);
      await this.assertTenantRepair(tx, repair, normalizedTenantId);
      if (CLOSED_REPAIR_STATUSES.includes(repair.status as typeof CLOSED_REPAIR_STATUSES[number])) {
        throw workflowError("INVALID_STATE", "종료된 작업의 견적은 검토할 수 없습니다.");
      }
      const estimate = await tx.vendorEstimate.findUnique({
        where: { id: normalizedEstimateId },
        include: { lineItems: true }
      });
      if (!estimate || estimate.repairId !== normalizedRepairId) {
        throw workflowError("ESTIMATE_NOT_FOUND", "견적을 찾을 수 없습니다.");
      }
      const targetStatus = input.action === "APPROVE"
        ? "APPROVED"
        : "REVISION_REQUESTED";
      if (estimate.status === targetStatus) {
        if (
          estimate.reviewedByTenantId === normalizedTenantId &&
          estimate.reviewedByManagerId === null &&
          (estimate.reviewNote ?? null) === note
        ) {
          return this.projectTenantWorkflowByRepair(
            tx,
            normalizedTenantId,
            normalizedRepairId
          );
        }
        throw workflowError("REVIEW_CONFLICT", "이미 다른 내용으로 처리된 견적입니다.");
      }
      if (estimate.status !== "SUBMITTED") {
        throw workflowError("INVALID_STATE", "제출 상태의 견적만 검토할 수 있습니다.");
      }
      if (input.action === "APPROVE" && estimate.responseType !== "FIXED_ESTIMATE") {
        throw workflowError("INVALID_STATE", "확정 견적만 승인할 수 있습니다.");
      }
      if (repair.paymentRequest) {
        throw workflowError("PAYMENT_SNAPSHOT_LOCKED", "결제 요청이 생성된 작업의 견적은 변경할 수 없습니다.");
      }

      const reviewedAt = this.clock();
      if (input.action === "APPROVE") {
        await tx.vendorEstimate.updateMany({
          where: { repairId: normalizedRepairId, status: "APPROVED", id: { not: estimate.id } },
          data: { status: "SUPERSEDED" }
        });
      }
      await tx.vendorEstimate.update({
        where: { id: estimate.id },
        data: {
          status: targetStatus,
          reviewedAt,
          reviewedByManagerId: null,
          reviewedByTenantId: normalizedTenantId,
          reviewNote: note
        }
      });
      if (input.action === "APPROVE") {
        await tx.repairRequest.update({
          where: { id: normalizedRepairId },
          data: { status: "ESTIMATE_APPROVED", costBearer: "TENANT" }
        });
      }

      const eventType = input.action === "APPROVE"
        ? "VENDOR_ESTIMATE_APPROVED"
        : "VENDOR_ESTIMATE_REVISION_REQUESTED";
      await this.domainEvents.enqueue(tx, {
        event: {
          eventKey: `tenant-vendor-estimate-review:${estimate.id}:${input.action.toLowerCase()}`,
          type: eventType,
          targetUserIds: await this.activeVendorUsers(tx, repair.vendorId),
          vendorId: repair.vendorId,
          repairId: normalizedRepairId,
          actorUserId: normalizedTenantId,
          statusCode: targetStatus,
          occurredAt: reviewedAt.toISOString()
        },
        consumers: ["NOTIFICATION"]
      });
      return this.projectTenantWorkflowByRepair(
        tx,
        normalizedTenantId,
        normalizedRepairId
      );
    });
  }

  async confirmTenantEstimateVisit(
    tenantId: string,
    repairId: string,
    estimateId: string,
    input: TenantVendorVisitScheduleInput
  ): Promise<TenantVendorWorkflowView> {
    const normalizedTenantId = requiredText(tenantId, "임차인 정보를 확인해 주세요.");
    const normalizedRepairId = requiredText(repairId, "수리 작업 정보를 확인해 주세요.");
    const normalizedEstimateId = requiredText(estimateId, "견적 정보를 확인해 주세요.");
    const scheduledAt = validDate(input?.scheduledAt, "유효한 방문 일정을 입력해 주세요.");
    return this.prisma.$transaction(async (tx) => {
      const repair = await this.lockRepair(tx, normalizedRepairId);
      await this.assertTenantRepair(tx, repair, normalizedTenantId);
      const estimate = await tx.vendorEstimate.findUnique({
        where: { id: normalizedEstimateId }
      });
      if (!estimate || estimate.repairId !== normalizedRepairId) {
        throw workflowError("ESTIMATE_NOT_FOUND", "견적을 찾을 수 없습니다.");
      }
      if (estimate.status === "VISIT_SCHEDULED") {
        if (
          estimate.reviewedByTenantId !== normalizedTenantId ||
          repair.scheduledAt?.getTime() !== scheduledAt.getTime()
        ) {
          throw workflowError("REVIEW_CONFLICT", "이미 다른 방문 일정으로 확정되었습니다.");
        }
        return this.projectTenantWorkflowByRepair(tx, normalizedTenantId, normalizedRepairId);
      }
      if (estimate.status !== "SUBMITTED" || estimate.responseType !== "VISIT_REQUIRED") {
        throw workflowError("INVALID_STATE", "제출된 방문 견적만 일정을 확정할 수 있습니다.");
      }
      const reviewedAt = this.clock();
      await tx.vendorEstimate.update({
        where: { id: estimate.id },
        data: {
          status: "VISIT_SCHEDULED",
          reviewedAt,
          reviewedByManagerId: null,
          reviewedByTenantId: normalizedTenantId
        }
      });
      await tx.repairRequest.update({
        where: { id: normalizedRepairId },
        data: { status: "SCHEDULED", scheduledAt }
      });
      await tx.ticket.update({
        where: { id: repair.ticketId },
        data: { status: "REPAIR_IN_PROGRESS" }
      });
      await tx.complaint.update({
        where: { id: repair.ticket.complaintId },
        data: { status: "REPAIR_IN_PROGRESS" }
      });
      return this.projectTenantWorkflowByRepair(tx, normalizedTenantId, normalizedRepairId);
    });
  }

  async saveEstimateDraft(command: {
    vendorId: string;
    repairId: string;
    estimateId?: string;
    input: VendorEstimateDraftInput;
  }): Promise<SharedVendorEstimate> {
    const draft = normalizedDraft(command.input);
    return this.prisma.$transaction(async (tx) => {
      const repair = await this.lockRepair(tx, command.repairId);
      this.assertVendorRepair(repair, command.vendorId);
      if (CLOSED_REPAIR_STATUSES.includes(repair.status as typeof CLOSED_REPAIR_STATUSES[number])) {
        throw workflowError("INVALID_STATE", "종료된 작업에는 견적을 작성할 수 없습니다.");
      }
      if (repair.paymentRequest) {
        throw workflowError("PAYMENT_SNAPSHOT_LOCKED", "결제 요청이 생성된 작업의 견적은 변경할 수 없습니다.");
      }

      if (command.estimateId) {
        const existing = await tx.vendorEstimate.findUnique({
          where: { id: command.estimateId },
          include: { lineItems: true }
        });
        this.assertEstimateScope(existing, command.vendorId, command.repairId);
        if (existing.status !== "DRAFT") {
          throw workflowError("ESTIMATE_IMMUTABLE", "제출 또는 승인된 견적은 수정할 수 없습니다.");
        }
        return mapEstimate(await this.writeDraft(tx, existing.id, draft));
      }

      const latest = await tx.vendorEstimate.findFirst({
        where: { repairId: command.repairId },
        include: { lineItems: true },
        orderBy: [{ version: "desc" }, { id: "desc" }]
      });
      if (latest?.status === "DRAFT") {
        return mapEstimate(await this.writeDraft(tx, latest.id, draft));
      }
      if (latest?.status === "SUBMITTED") {
        throw workflowError("INVALID_STATE", "검토 중인 견적이 있습니다.");
      }

      if (
        latest &&
        ["VISIT_SCHEDULED", "REVISION_REQUESTED", "REJECTED"].includes(latest.status)
      ) {
        await tx.vendorEstimate.update({
          where: { id: latest.id },
          data: { status: "SUPERSEDED" }
        });
      }

      const created = await tx.vendorEstimate.create({
        data: {
          id: this.nextId("estimate"),
          repairId: command.repairId,
          vendorId: command.vendorId,
          version: (latest?.version ?? 0) + 1,
          origin: "LIVE",
          responseType: draft.responseType,
          status: "DRAFT",
          visitAvailableAt: draft.visitAvailableAt,
          estimatedDurationMinutes: draft.estimatedDurationMinutes,
          workDescription: draft.workDescription,
          declineReason: draft.declineReason,
          totalAmount: draft.totalAmount,
          lineItems: {
            create: draft.lineItems.map((line) => ({
              id: this.nextId("estimate-line"),
              ...line
            }))
          }
        },
        include: { lineItems: true }
      });
      return mapEstimate(created);
    });
  }

  async submitEstimate(
    vendorId: string,
    repairId: string,
    estimateId: string
  ): Promise<SharedVendorEstimate> {
    return this.prisma.$transaction(async (tx) => {
      const repair = await this.lockRepair(tx, repairId);
      this.assertVendorRepair(repair, vendorId);
      if (CLOSED_REPAIR_STATUSES.includes(repair.status as typeof CLOSED_REPAIR_STATUSES[number])) {
        throw workflowError("INVALID_STATE", "종료된 작업에는 견적을 제출할 수 없습니다.");
      }
      const estimate = await tx.vendorEstimate.findUnique({
        where: { id: estimateId },
        include: { lineItems: true }
      });
      this.assertEstimateScope(estimate, vendorId, repairId);

      if (estimate.status !== "DRAFT") {
        if (estimate.submittedAt && estimate.status !== "WITHDRAWN") {
          return mapEstimate(estimate);
        }
        throw workflowError("INVALID_STATE", "초안 상태의 견적만 제출할 수 있습니다.");
      }
      if (repair.paymentRequest) {
        throw workflowError("PAYMENT_SNAPSHOT_LOCKED", "결제 요청이 생성된 작업에는 새 견적을 제출할 수 없습니다.");
      }
      const managerId = repair.ticket.room.landlordId;
      if (!managerId) {
        throw workflowError("INVALID_STATE", "견적을 검토할 관리자가 지정되어 있지 않습니다.");
      }
      const submittedAt = this.clock();
      const tenantActorId = await this.tenantWorkflowActor(tx, repair);
      const status = estimate.responseType === "DECLINED" ? "DECLINED" : "SUBMITTED";
      const preserveLifecycle = PRESERVED_REPAIR_LIFECYCLE_STATUSES.includes(
        repair.status as typeof PRESERVED_REPAIR_LIFECYCLE_STATUSES[number]
      );
      if (status === "DECLINED" && preserveLifecycle) {
        throw workflowError("INVALID_STATE", "일정이 확정되거나 진행 중인 작업은 견적으로 거절할 수 없습니다.");
      }
      const updated = await tx.vendorEstimate.update({
        where: { id: estimate.id },
        data: { status, submittedAt },
        include: { lineItems: true }
      });

      if (status === "DECLINED") {
        await tx.vendorEstimate.updateMany({
          where: { repairId, status: "APPROVED" },
          data: { status: "SUPERSEDED" }
        });
        await tx.repairRequest.update({
          where: { id: repairId },
          data: { status: "CANCELLED", costBearer: null }
        });
        await tx.ticket.update({
          where: { id: repair.ticketId },
          data: { assignedVendorId: null, status: "VENDOR_ASSIGNMENT_PENDING" }
        });
        await tx.complaint.update({
          where: { id: repair.ticket.complaintId },
          data: { status: "REVIEWING" }
        });
      } else if (!preserveLifecycle) {
        await tx.repairRequest.update({ where: { id: repairId }, data: { status: "ESTIMATE_SUBMITTED" } });
        await tx.ticket.update({ where: { id: repair.ticketId }, data: { status: "ESTIMATE_REVIEW" } });
      }

      const eventType = estimate.version > 1
        ? "VENDOR_ESTIMATE_REVISED"
        : "VENDOR_ESTIMATE_SUBMITTED";
      await this.domainEvents.enqueue(tx, {
        event: {
          eventKey: `${eventType === "VENDOR_ESTIMATE_REVISED" ? "vendor-estimate-revised" : "vendor-estimate-submitted"}:${estimate.id}`,
          type: eventType,
          targetUserIds: [tenantActorId ?? managerId],
          vendorId,
          ...(tenantActorId ? {} : { managerId }),
          repairId,
          statusCode: status,
          occurredAt: submittedAt.toISOString()
        },
        consumers: ["NOTIFICATION"]
      });
      return mapEstimate(updated);
    });
  }

  async withdrawEstimate(
    vendorId: string,
    repairId: string,
    estimateId: string
  ): Promise<SharedVendorEstimate> {
    return this.prisma.$transaction(async (tx) => {
      const repair = await this.lockRepair(tx, repairId);
      this.assertVendorRepair(repair, vendorId);
      const estimate = await tx.vendorEstimate.findUnique({
        where: { id: estimateId },
        include: { lineItems: true }
      });
      this.assertEstimateScope(estimate, vendorId, repairId);
      if (estimate.status === "WITHDRAWN") return mapEstimate(estimate);
      if (repair.paymentRequest) {
        throw workflowError("PAYMENT_SNAPSHOT_LOCKED", "결제 요청이 생성된 작업의 견적은 철회할 수 없습니다.");
      }
      if (!["DRAFT", "SUBMITTED"].includes(estimate.status) || estimate.reviewedAt) {
        throw workflowError("INVALID_STATE", "검토되지 않은 초안 또는 제출 견적만 철회할 수 있습니다.");
      }
      const updated = await tx.vendorEstimate.update({
        where: { id: estimate.id },
        data: { status: "WITHDRAWN" },
        include: { lineItems: true }
      });
      if (repair.status === "ESTIMATE_SUBMITTED") {
        await this.restoreAfterEstimateExit(tx, repair, estimate.id);
      }
      return mapEstimate(updated);
    });
  }

  async reviewEstimate(
    managerId: string,
    repairId: string,
    estimateId: string,
    input: VendorEstimateReviewInput
  ): Promise<SharedVendorEstimate> {
    if (!input || !["APPROVE", "REQUEST_REVISION", "REJECT"].includes(input.action)) {
      throw workflowError("INVALID_REQUEST", "지원하지 않는 견적 검토 방식입니다.");
    }
    if (
      input.action === "APPROVE" &&
      !["LANDLORD", "TENANT", "PENDING"].includes(input.costBearer)
    ) {
      throw workflowError("INVALID_REQUEST", "비용 부담 주체를 확인해 주세요.");
    }
    return this.prisma.$transaction(async (tx) => {
      const repair = await this.lockRepair(tx, repairId);
      await this.assertManagerRepair(tx, repair, managerId);
      if (await this.tenantWorkflowActor(tx, repair)) {
        throw workflowError("REPAIR_ACCESS_DENIED", "세입자가 요청한 작업의 견적은 세입자가 확인합니다.");
      }
      if (CLOSED_REPAIR_STATUSES.includes(repair.status as typeof CLOSED_REPAIR_STATUSES[number])) {
        throw workflowError("INVALID_STATE", "종료된 작업의 견적은 검토할 수 없습니다.");
      }
      const estimate = await tx.vendorEstimate.findUnique({
        where: { id: estimateId },
        include: { lineItems: true }
      });
      if (!estimate) throw workflowError("ESTIMATE_NOT_FOUND", "견적을 찾을 수 없습니다.");
      if (estimate.repairId !== repairId) {
        throw workflowError("REPAIR_ACCESS_DENIED", "다른 작업의 견적을 검토할 수 없습니다.");
      }

      const note = typeof input.note === "string" ? input.note.trim() || null : null;
      const targetStatus = input.action === "APPROVE"
        ? "APPROVED"
        : input.action === "REQUEST_REVISION"
          ? "REVISION_REQUESTED"
          : "REJECTED";
      if (estimate.status === targetStatus) {
        const sameNote = (estimate.reviewNote ?? null) === note;
        const sameManager = estimate.reviewedByManagerId === managerId;
        const sameBearer = input.action !== "APPROVE" || repair.costBearer === input.costBearer;
        if (sameNote && sameManager && sameBearer) return mapEstimate(estimate);
        throw workflowError("REVIEW_CONFLICT", "이미 다른 내용으로 처리된 견적입니다.");
      }
      if (estimate.status !== "SUBMITTED") {
        throw workflowError("INVALID_STATE", "제출 상태의 견적만 검토할 수 있습니다.");
      }
      if (input.action !== "APPROVE" && !note) {
        throw workflowError("INVALID_REQUEST", "수정 요청 또는 거절 사유를 입력해 주세요.");
      }
      if (input.action === "APPROVE" && estimate.responseType !== "FIXED_ESTIMATE") {
        throw workflowError("INVALID_STATE", "확정 견적만 승인할 수 있습니다.");
      }
      if (repair.paymentRequest) {
        throw workflowError("PAYMENT_SNAPSHOT_LOCKED", "결제 요청이 생성된 작업의 견적 검토 결과는 변경할 수 없습니다.");
      }

      const reviewedAt = this.clock();
      if (input.action === "APPROVE") {
        await tx.vendorEstimate.updateMany({
          where: { repairId, status: "APPROVED", id: { not: estimate.id } },
          data: { status: "SUPERSEDED" }
        });
      }
      const updated = await tx.vendorEstimate.update({
        where: { id: estimate.id },
        data: {
          status: targetStatus,
          reviewedAt,
          reviewedByManagerId: managerId,
          reviewNote: note
        },
        include: { lineItems: true }
      });

      if (input.action === "APPROVE") {
        const preserveLifecycle = PRESERVED_REPAIR_LIFECYCLE_STATUSES.includes(
          repair.status as typeof PRESERVED_REPAIR_LIFECYCLE_STATUSES[number]
        );
        if (preserveLifecycle) {
          if (repair.costBearer !== input.costBearer) {
            await tx.repairRequest.update({
              where: { id: repairId },
              data: { costBearer: input.costBearer }
            });
          }
        } else {
          await tx.repairRequest.update({
            where: { id: repairId },
            data: { status: "ESTIMATE_APPROVED", costBearer: input.costBearer }
          });
        }
      } else if (input.action === "REJECT") {
        await this.restoreAfterEstimateExit(tx, repair, estimate.id);
      }

      const targetUserIds = await this.activeVendorUsers(tx, repair.vendorId);
      const eventType = input.action === "APPROVE"
        ? "VENDOR_ESTIMATE_APPROVED"
        : input.action === "REQUEST_REVISION"
          ? "VENDOR_ESTIMATE_REVISION_REQUESTED"
          : "VENDOR_ESTIMATE_REJECTED";
      await this.domainEvents.enqueue(tx, {
        event: {
          eventKey: `vendor-estimate-review:${estimate.id}:${input.action.toLowerCase()}`,
          type: eventType,
          targetUserIds,
          vendorId: repair.vendorId,
          managerId,
          repairId,
          actorUserId: managerId,
          statusCode: targetStatus,
          occurredAt: reviewedAt.toISOString()
        },
        consumers: ["NOTIFICATION"]
      });
      return mapEstimate(updated);
    });
  }

  async confirmEstimateVisit(
    managerId: string,
    repairId: string,
    estimateId: string,
    input: VendorVisitScheduleInput
  ): Promise<VendorJobDetail> {
    const scheduledAt = validDate(input.scheduledAt, "유효한 방문 일정을 입력해 주세요.");
    return this.prisma.$transaction(async (tx) => {
      const repair = await this.lockRepair(tx, repairId);
      await this.assertManagerRepair(tx, repair, managerId);
      if (await this.tenantWorkflowActor(tx, repair)) {
        throw workflowError("REPAIR_ACCESS_DENIED", "세입자가 요청한 작업의 방문 일정은 세입자가 확인합니다.");
      }
      const estimate = await tx.vendorEstimate.findUnique({ where: { id: estimateId } });
      if (!estimate) throw workflowError("ESTIMATE_NOT_FOUND", "견적을 찾을 수 없습니다.");
      if (estimate.repairId !== repairId) {
        throw workflowError("REPAIR_ACCESS_DENIED", "다른 작업의 방문 일정을 확정할 수 없습니다.");
      }
      if (estimate.status === "VISIT_SCHEDULED") {
        if (repair.scheduledAt?.getTime() !== scheduledAt.getTime()) {
          throw workflowError("REVIEW_CONFLICT", "이미 다른 방문 일정으로 확정되었습니다.");
        }
        return await this.projectJob(tx, repairId);
      }
      if (estimate.status !== "SUBMITTED" || estimate.responseType !== "VISIT_REQUIRED") {
        throw workflowError("INVALID_STATE", "제출된 방문 견적만 일정을 확정할 수 있습니다.");
      }
      const reviewedAt = this.clock();
      await tx.vendorEstimate.update({
        where: { id: estimate.id },
        data: { status: "VISIT_SCHEDULED", reviewedAt, reviewedByManagerId: managerId }
      });
      await tx.repairRequest.update({
        where: { id: repairId },
        data: { status: "SCHEDULED", scheduledAt }
      });
      await tx.ticket.update({ where: { id: repair.ticketId }, data: { status: "REPAIR_IN_PROGRESS" } });
      await tx.complaint.update({
        where: { id: repair.ticket.complaintId },
        data: { status: "REPAIR_IN_PROGRESS" }
      });
      return await this.projectJob(tx, repairId);
    });
  }

  async scheduleApprovedJob(
    vendorId: string,
    repairId: string,
    input: VendorVisitScheduleInput
  ): Promise<VendorJobDetail> {
    const scheduledAt = validDate(input.scheduledAt, "유효한 방문 일정을 입력해 주세요.");
    return this.prisma.$transaction(async (tx) => {
      const repair = await this.lockRepair(tx, repairId);
      this.assertVendorRepair(repair, vendorId);
      assertResolvedCostBearer(repair.costBearer);
      if (repair.status === "SCHEDULED") {
        if (repair.scheduledAt?.getTime() !== scheduledAt.getTime()) {
          throw workflowError("REVIEW_CONFLICT", "이미 다른 작업 일정으로 저장되었습니다.");
        }
        return await this.projectJob(tx, repairId);
      }
      if (repair.status !== "ESTIMATE_APPROVED") {
        throw workflowError("INVALID_STATE", "승인된 견적이 있는 작업만 일정을 잡을 수 있습니다.");
      }
      const approved = await tx.vendorEstimate.findFirst({
        where: { repairId, status: "APPROVED", responseType: "FIXED_ESTIMATE" },
        select: { id: true }
      });
      const pendingChange = await tx.vendorEstimate.findFirst({
        where: { repairId, status: { in: ["SUBMITTED", "REVISION_REQUESTED"] } },
        select: { id: true }
      });
      if (!approved || pendingChange) {
        throw workflowError("INVALID_STATE", "현재 승인된 확정 견적을 확인해 주세요.");
      }
      await tx.repairRequest.update({
        where: { id: repairId },
        data: { status: "SCHEDULED", scheduledAt }
      });
      await tx.ticket.update({ where: { id: repair.ticketId }, data: { status: "REPAIR_IN_PROGRESS" } });
      await tx.complaint.update({
        where: { id: repair.ticket.complaintId },
        data: { status: "REPAIR_IN_PROGRESS" }
      });
      return await this.projectJob(tx, repairId);
    });
  }

  async startJob(vendorId: string, repairId: string): Promise<StartVendorJobResult> {
    return this.prisma.$transaction(async (tx) => {
      const repair = await this.lockRepair(tx, repairId);
      this.assertVendorRepair(repair, vendorId);
      assertResolvedCostBearer(repair.costBearer);
      const approved = await tx.vendorEstimate.findFirst({
        where: { repairId, status: "APPROVED", responseType: "FIXED_ESTIMATE" },
        select: { id: true }
      });
      const pendingChange = await tx.vendorEstimate.findFirst({
        where: { repairId, status: { in: [...PENDING_ESTIMATE_STATUSES] } },
        select: { id: true }
      });
      if (!approved || pendingChange) {
        throw workflowError("INVALID_STATE", "현재 승인된 확정 견적과 변경 여부를 확인해 주세요.");
      }
      if (repair.status === "IN_PROGRESS") {
        if (repair.startedAt) {
          return { repairId, status: "IN_PROGRESS", startedAt: repair.startedAt.toISOString() };
        }
        const legacyStartedAt = this.clock();
        await tx.repairRequest.updateMany({
          where: { id: repairId, status: "IN_PROGRESS", startedAt: null },
          data: { startedAt: legacyStartedAt }
        });
        const backfilled = await tx.repairRequest.findUniqueOrThrow({
          where: { id: repairId },
          select: { startedAt: true }
        });
        return {
          repairId,
          status: "IN_PROGRESS",
          startedAt: (backfilled.startedAt ?? legacyStartedAt).toISOString()
        };
      }
      if (repair.status !== "SCHEDULED") {
        throw workflowError("INVALID_STATE", "일정이 확정된 작업만 시작할 수 있습니다.");
      }
      const updated = await tx.repairRequest.update({
        where: { id: repairId },
        data: { status: "IN_PROGRESS", startedAt: this.clock() }
      });
      await tx.ticket.update({ where: { id: repair.ticketId }, data: { status: "REPAIR_IN_PROGRESS" } });
      await tx.complaint.update({
        where: { id: repair.ticket.complaintId },
        data: { status: "REPAIR_IN_PROGRESS" }
      });
      return {
        repairId,
        status: "IN_PROGRESS",
        startedAt: updated.startedAt!.toISOString()
      };
    });
  }

  async saveCompletionAttachment(
    command: SaveVendorCompletionAttachmentCommand
  ): Promise<{ attachmentId: string; fileUrl: string }> {
    const vendorId = requiredText(command.vendorId, "업체 정보를 확인해 주세요.");
    const userId = requiredText(command.userId, "업로드 사용자 정보를 확인해 주세요.");
    const repairId = requiredText(command.repairId, "수리 작업 정보를 확인해 주세요.");
    const fileName = requiredText(command.fileName, "저장할 파일 이름을 확인해 주세요.");
    const fileUrl = requiredText(command.fileUrl, "저장된 파일 주소를 확인해 주세요.");
    const mimeType = requiredText(command.mimeType, "파일 형식을 확인해 주세요.");
    if (
      command.category !== "COMPLETION_PHOTO" ||
      !SAFE_COMPLETION_IMAGE_MIME_TYPES.has(mimeType)
    ) {
      throw workflowError("INVALID_REQUEST", "완료 보고에는 이미지 파일만 첨부할 수 있습니다.");
    }
    if (
      !isVendorCompletionPrivateFileName(fileName)
      || fileUrl !== `/api/vendor-completion-files/${encodeURIComponent(fileName)}`
    ) {
      throw workflowError("INVALID_REQUEST", "완료 사진은 비공개 저장 경로만 사용할 수 있습니다.");
    }
    if (
      !Number.isSafeInteger(command.sizeBytes) ||
      command.sizeBytes <= 0 ||
      command.sizeBytes > 10 * 1024 * 1024
    ) {
      throw workflowError("INVALID_REQUEST", "완료 사진은 10MB 이하의 파일이어야 합니다.");
    }

    return this.prisma.$transaction(async (tx) => {
      const repair = await this.lockRepair(tx, repairId);
      this.assertVendorRepair(repair, vendorId);
      if (
        repair.status === "COMPLETED" ||
        repair.status === "CANCELLED" ||
        repair.status === "COMPLETION_REPORTED"
      ) {
        throw workflowError("INVALID_STATE", "완료되거나 완료 보고된 작업에는 사진을 추가할 수 없습니다.");
      }
      const link = await tx.vendorAccountLink.findFirst({
        where: {
          vendorId,
          userId,
          status: "ACTIVE",
          user: { status: "ACTIVE" }
        },
        select: { id: true }
      });
      if (!link) {
        throw workflowError("REPAIR_ACCESS_DENIED", "활성 업체 계정만 완료 사진을 업로드할 수 있습니다.");
      }
      const attachmentId = this.nextId("completion-attachment");
      const attachment = await tx.attachment.create({
        data: {
          id: attachmentId,
          repairId,
          uploadedBy: userId,
          fileName,
          fileUrl,
          mimeType,
          sizeBytes: command.sizeBytes,
          category: "COMPLETION_PHOTO",
          origin: "USER_UPLOAD"
        },
        select: { id: true, fileUrl: true }
      });
      return { attachmentId: attachment.id, fileUrl: attachment.fileUrl };
    });
  }

  async findCompletionAttachmentForAccess(
    fileName: string,
    access: VendorCompletionAttachmentAccess
  ): Promise<{ fileName: string; mimeType: string } | null> {
    const normalizedFileName = requiredText(fileName, "완료 사진 정보를 확인해 주세요.");
    const repairScope: Prisma.RepairRequestWhereInput = access.role === "VENDOR"
      ? { vendorId: requiredText(access.vendorId, "업체 정보를 확인해 주세요.") }
      : access.role === "LANDLORD"
        ? {
          ticket: {
            room: {
              landlordId: requiredText(access.managerId, "관리자 정보를 확인해 주세요.")
            }
          }
        }
        : {
            costBearer: "TENANT",
            ticket: {
              tenantId: requiredText(access.tenantId, "임차인 정보를 확인해 주세요."),
              room: {
                tenants: {
                  some: { tenantId: requiredText(access.tenantId, "임차인 정보를 확인해 주세요.") }
                }
              }
            },
            domainEvents: {
              some: {
                type: "VENDOR_JOB_ASSIGNED",
                actorUserId: requiredText(access.tenantId, "임차인 정보를 확인해 주세요."),
                managerId: null
              }
            }
          };
    return this.prisma.attachment.findFirst({
      where: {
        fileName: normalizedFileName,
        fileUrl: { startsWith: "/api/vendor-completion-files/" },
        category: "COMPLETION_PHOTO",
        origin: "USER_UPLOAD",
        repair: { is: repairScope }
      },
      select: { fileName: true, mimeType: true }
    });
  }

  async submitCompletion(
    vendorId: string,
    repairId: string,
    input: SubmitVendorCompletionInput
  ): Promise<CompletionCommit> {
    const normalizedVendorId = requiredText(vendorId, "업체 정보를 확인해 주세요.");
    const normalizedRepairId = requiredText(repairId, "수리 작업 정보를 확인해 주세요.");
    const normalized = normalizedCompletionInput(
      normalizedVendorId,
      normalizedRepairId,
      input
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const repair = await this.lockRepair(tx, normalizedRepairId);
        this.assertVendorRepair(repair, normalizedVendorId);
        assertResolvedCostBearer(repair.costBearer);

        const existingByKey = await tx.vendorCompletionReport.findUnique({
          where: { submissionKey: normalized.submissionKey },
          include: {
            attachments: { include: { attachment: true } },
            decision: true
          }
        });
        if (existingByKey) {
          if (existingByKey.payloadHash !== normalized.payloadHash) {
            throw workflowError(
              "REVIEW_CONFLICT",
              "동일한 submissionKey를 다른 완료 보고에 사용할 수 없습니다."
            );
          }
          const paymentRequest = await tx.vendorPaymentRequest.findUnique({
            where: { repairId: existingByKey.repairId }
          });
          const eventKeys = [`vendor-completion-submitted:${existingByKey.id}`];
          if (paymentRequest) {
            const paymentEvent = await tx.domainEventOutbox.findUnique({
              where: { eventKey: `vendor-payment-request-created:${paymentRequest.id}` },
              select: { eventKey: true }
            });
            if (paymentEvent) eventKeys.push(paymentEvent.eventKey);
          }
          return {
            report: mapCompletion(existingByKey),
            ...(paymentRequest ? { paymentRequest: mapPayment(paymentRequest) } : {}),
            eventKeys
          };
        }

        const latestReport = await tx.vendorCompletionReport.findFirst({
          where: { repairId: normalizedRepairId },
          orderBy: [{ version: "desc" }, { id: "desc" }],
          include: { decision: true }
        });
        if (latestReport && !latestReport.decision) {
          throw workflowError("INVALID_STATE", "최신 완료 보고의 관리자 검토를 기다려 주세요.");
        }
        if (latestReport?.decision?.decision === "APPROVED") {
          throw workflowError("INVALID_STATE", "이미 승인된 완료 보고가 있습니다.");
        }
        if (repair.status !== "IN_PROGRESS") {
          throw workflowError("INVALID_STATE", "진행 중인 작업만 완료 보고할 수 있습니다.");
        }
        const submittedAt = this.clock();
        if (
          !repair.startedAt ||
          normalized.completedAt.getTime() < repair.startedAt.getTime() ||
          normalized.completedAt.getTime() > submittedAt.getTime()
        ) {
          throw workflowError(
            "INVALID_REQUEST",
            "작업 완료 일시는 작업 시작 이후부터 현재 시각까지로 입력해 주세요."
          );
        }
        const pendingEstimate = await tx.vendorEstimate.findFirst({
          where: {
            repairId: normalizedRepairId,
            status: { in: [...PENDING_ESTIMATE_STATUSES] }
          },
          select: { id: true }
        });
        if (pendingEstimate) {
          throw workflowError("INVALID_STATE", "검토 중인 견적을 먼저 확정해 주세요.");
        }

        const attachments = normalized.attachmentIds.length === 0
          ? []
          : await tx.attachment.findMany({
              where: { id: { in: normalized.attachmentIds } },
              include: { uploader: true, completionReportAttachment: true }
            });
        if (attachments.length !== normalized.attachmentIds.length) {
          throw workflowError("ATTACHMENT_NOT_FOUND", "완료 사진을 찾을 수 없습니다.");
        }
        const activeUploaderIds = new Set(await this.activeVendorUsers(tx, normalizedVendorId));
        if (attachments.some((attachment) =>
          attachment.repairId !== normalizedRepairId ||
          attachment.category !== "COMPLETION_PHOTO" ||
          attachment.origin !== "USER_UPLOAD" ||
          !attachment.uploadedBy ||
          !activeUploaderIds.has(attachment.uploadedBy) ||
          attachment.uploader?.status !== "ACTIVE" ||
          attachment.completionReportAttachment !== null
        )) {
          throw workflowError(
            "REPAIR_ACCESS_DENIED",
            "이 작업에 등록된 업체 완료 사진만 사용할 수 있습니다."
          );
        }

        const managerId = repair.ticket.room.landlordId;
        if (!managerId) {
          throw workflowError("INVALID_MANAGER", "완료 보고를 검토할 관리자가 지정되어 있지 않습니다.");
        }
        const manager = await tx.userAccount.findFirst({
          where: { id: managerId, status: "ACTIVE" },
          select: { id: true }
        });
        if (!manager) {
          throw workflowError("INVALID_MANAGER", "완료 보고를 검토할 관리자를 확인할 수 없습니다.");
        }
        const tenantActorId = await this.tenantWorkflowActor(tx, repair);

        const approvedEstimate = repair.costBearer === "LANDLORD"
          ? await tx.vendorEstimate.findFirst({
              where: {
                repairId: normalizedRepairId,
                vendorId: normalizedVendorId,
                status: "APPROVED",
                responseType: "FIXED_ESTIMATE",
                totalAmount: { not: null }
              },
              orderBy: [{ version: "desc" }, { id: "desc" }]
            })
          : null;
        if (
          repair.costBearer === "LANDLORD" &&
          (!approvedEstimate || !approvedEstimate.totalAmount || approvedEstimate.totalAmount <= 0)
        ) {
          throw workflowError("INVALID_STATE", "관리자 부담 작업의 승인 견적을 확인할 수 없습니다.");
        }

        const reportId = this.nextId("completion-report");
        const report = await tx.vendorCompletionReport.create({
          data: {
            id: reportId,
            repairId: normalizedRepairId,
            vendorId: normalizedVendorId,
            version: (latestReport?.version ?? 0) + 1,
            origin: "LIVE",
            workSummary: normalized.workSummary,
            completedAt: normalized.completedAt,
            submissionKey: normalized.submissionKey,
            payloadHash: normalized.payloadHash,
            submittedAt,
            attachments: {
              create: normalized.attachmentIds.map((attachmentId, sortOrder) => ({
                attachmentId,
                sortOrder
              }))
            }
          },
          include: {
            attachments: { include: { attachment: true } },
            decision: true
          }
        });

        let paymentRequest: PaymentProjection | null = null;
        let paymentRequestCreated = false;
        if (repair.costBearer === "LANDLORD" && approvedEstimate?.totalAmount) {
          const existingRequest = repair.paymentRequest;
          if (existingRequest) {
            if (
              existingRequest.status !== "WAITING_COMPLETION" ||
              latestReport?.decision?.decision !== "REJECTED"
            ) {
              throw workflowError("PAYMENT_SNAPSHOT_LOCKED", "현재 결제 요청에는 새 완료 보고를 연결할 수 없습니다.");
            }
            if (
              existingRequest.vendorId !== normalizedVendorId ||
              existingRequest.managerId !== managerId ||
              existingRequest.approvedEstimateId !== approvedEstimate.id ||
              existingRequest.amount !== approvedEstimate.totalAmount
            ) {
              throw workflowError("PAYMENT_SNAPSHOT_LOCKED", "기존 결제 요청의 승인 견적 정보가 일치하지 않습니다.");
            }
            paymentRequest = await tx.vendorPaymentRequest.update({
              where: { id: existingRequest.id },
              data: { completionReportId: report.id }
            });
          } else {
            paymentRequestCreated = true;
            paymentRequest = await tx.vendorPaymentRequest.create({
              data: {
                id: this.nextId("payment-request"),
                repairId: normalizedRepairId,
                vendorId: normalizedVendorId,
                managerId,
                approvedEstimateId: approvedEstimate.id,
                completionReportId: report.id,
                payerRole: "MANAGER",
                payerUserId: managerId,
                amount: approvedEstimate.totalAmount,
                status: "WAITING_COMPLETION",
                createdAt: submittedAt
              }
            });
            await tx.vendorPaymentAuditEvent.create({
              data: {
                id: this.nextId("payment-audit"),
                paymentRequestId: paymentRequest.id,
                type: "REQUESTED",
                dedupeKey: `vendor-payment-requested:${paymentRequest.id}`,
                note: "업체 완료 보고와 함께 결제 요청이 생성되었습니다.",
                createdAt: submittedAt
              }
            });
          }
        } else if (repair.paymentRequest) {
          throw workflowError("PAYMENT_SNAPSHOT_LOCKED", "비용 부담 주체와 기존 결제 요청이 일치하지 않습니다.");
        }

        await tx.repairRequest.update({
          where: { id: normalizedRepairId },
          data: { status: "COMPLETION_REPORTED" }
        });
        await this.syncTicketRepairAggregate(
          tx,
          repair.ticketId,
          repair.ticket.complaintId
        );

        const eventKeys = [`vendor-completion-submitted:${report.id}`];
        await this.domainEvents.enqueue(tx, {
          event: {
            eventKey: eventKeys[0],
            type: "VENDOR_COMPLETION_SUBMITTED",
            targetUserIds: [tenantActorId ?? managerId],
            vendorId: normalizedVendorId,
            ...(tenantActorId ? {} : { managerId }),
            repairId: normalizedRepairId,
            ...(paymentRequest ? { paymentRequestId: paymentRequest.id } : {}),
            statusCode: "COMPLETION_REPORTED",
            occurredAt: submittedAt.toISOString()
          },
          consumers: ["NOTIFICATION"]
        });
        if (paymentRequest) {
          const paymentEventKey = `vendor-payment-request-created:${paymentRequest.id}`;
          eventKeys.push(paymentEventKey);
          if (paymentRequestCreated) {
            await this.domainEvents.enqueue(tx, {
              event: {
                eventKey: paymentEventKey,
                type: "VENDOR_PAYMENT_REQUEST_CREATED",
                targetUserIds: [managerId],
                vendorId: normalizedVendorId,
                managerId,
                repairId: normalizedRepairId,
                paymentRequestId: paymentRequest.id,
                statusCode: "WAITING_COMPLETION",
                occurredAt: submittedAt.toISOString()
              },
              consumers: ["NOTIFICATION"]
            });
          }
        }

        return {
          report: mapCompletion(report),
          ...(paymentRequest ? { paymentRequest: mapPayment(paymentRequest) } : {}),
          eventKeys
        };
      });
    } catch (error) {
      if (error instanceof VendorWorkflowRepositoryError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw workflowError(
          "REVIEW_CONFLICT",
          "동일한 submissionKey 또는 완료 보고 버전이 이미 사용되었습니다."
        );
      }
      throw error;
    }
  }

  async decideTenantCompletion(
    tenantId: string,
    repairId: string,
    input: TenantVendorCompletionDecisionInput
  ): Promise<TenantVendorWorkflowView> {
    const normalizedTenantId = requiredText(tenantId, "임차인 정보를 확인해 주세요.");
    const normalizedRepairId = requiredText(repairId, "수리 작업 정보를 확인해 주세요.");
    const normalized = normalizedCompletionDecision(input);

    return this.prisma.$transaction(async (tx) => {
      const repair = await this.lockRepair(tx, normalizedRepairId);
      await this.assertTenantRepair(tx, repair, normalizedTenantId);
      const latestReport = await tx.vendorCompletionReport.findFirst({
        where: { repairId: normalizedRepairId },
        orderBy: [{ version: "desc" }, { id: "desc" }],
        include: { decision: true }
      });
      if (!latestReport) {
        throw workflowError("COMPLETION_NOT_FOUND", "확인할 완료 보고가 없습니다.");
      }
      if (latestReport.decision) {
        if (
          latestReport.decision.source === "TENANT" &&
          latestReport.decision.tenantId === normalizedTenantId &&
          latestReport.decision.decision === normalized.decision &&
          (latestReport.decision.note ?? null) === normalized.note
        ) {
          return this.projectTenantWorkflowByRepair(
            tx,
            normalizedTenantId,
            normalizedRepairId
          );
        }
        throw workflowError("REVIEW_CONFLICT", "이미 다른 내용으로 완료 보고를 확인했습니다.");
      }
      if (repair.status !== "COMPLETION_REPORTED") {
        throw workflowError("INVALID_STATE", "완료 보고 상태의 작업만 확인할 수 있습니다.");
      }
      if (repair.paymentRequest) {
        throw workflowError("PAYMENT_SNAPSHOT_LOCKED", "이미 결제 요청이 생성된 작업입니다.");
      }

      const approvedEstimate = await tx.vendorEstimate.findFirst({
        where: {
          repairId: normalizedRepairId,
          vendorId: repair.vendorId,
          status: "APPROVED",
          responseType: "FIXED_ESTIMATE",
          reviewedByTenantId: normalizedTenantId,
          reviewedByManagerId: null,
          totalAmount: { not: null }
        },
        orderBy: [{ version: "desc" }, { id: "desc" }]
      });
      if (
        normalized.decision === "APPROVED" &&
        (!approvedEstimate?.totalAmount || approvedEstimate.totalAmount <= 0)
      ) {
        throw workflowError("INVALID_STATE", "세입자가 승인한 확정 견적을 확인할 수 없습니다.");
      }
      const managerId = repair.ticket.room.landlordId;
      if (!managerId) {
        throw workflowError("INVALID_MANAGER", "수리비 지급을 관리할 관리자를 확인할 수 없습니다.");
      }
      const manager = await tx.userAccount.findFirst({
        where: { id: managerId, role: "LANDLORD", status: "ACTIVE" },
        select: { id: true }
      });
      if (!manager) {
        throw workflowError("INVALID_MANAGER", "수리비 지급을 관리할 관리자를 확인할 수 없습니다.");
      }

      const decidedAt = this.clock();
      const decision = await tx.repairCompletionDecision.create({
        data: {
          id: this.nextId("completion-decision"),
          repairId: normalizedRepairId,
          completionReportId: latestReport.id,
          managerId: null,
          tenantId: normalizedTenantId,
          source: "TENANT",
          decision: normalized.decision,
          note: normalized.note,
          decidedAt
        }
      });

      let paymentRequest: PaymentProjection | null = null;
      if (normalized.decision === "APPROVED" && approvedEstimate?.totalAmount) {
        paymentRequest = await tx.vendorPaymentRequest.create({
          data: {
            id: this.nextId("payment-request"),
            repairId: normalizedRepairId,
            vendorId: repair.vendorId,
            managerId,
            payerRole: "TENANT",
            payerUserId: normalizedTenantId,
            approvedEstimateId: approvedEstimate.id,
            completionReportId: latestReport.id,
            amount: approvedEstimate.totalAmount,
            status: "PENDING_APPROVAL",
            createdAt: decidedAt
          }
        });
        await tx.vendorPaymentAuditEvent.createMany({
          data: [
            {
              id: this.nextId("payment-audit"),
              paymentRequestId: paymentRequest.id,
              type: "REQUESTED",
              dedupeKey: `tenant-vendor-payment-requested:${paymentRequest.id}`,
              actorUserId: normalizedTenantId,
              note: "세입자 완료 확인 후 결제 요청이 생성되었습니다.",
              createdAt: decidedAt
            },
            {
              id: this.nextId("payment-audit"),
              paymentRequestId: paymentRequest.id,
              type: "COMPLETION_APPROVED",
              dedupeKey: `tenant-vendor-completion-approved:${decision.id}`,
              decisionId: decision.id,
              actorUserId: normalizedTenantId,
              note: normalized.note,
              createdAt: decidedAt
            }
          ]
        });
      }

      await tx.repairRequest.update({
        where: { id: normalizedRepairId },
        data: {
          status: normalized.decision === "APPROVED" ? "COMPLETED" : "IN_PROGRESS"
        }
      });
      await this.syncTicketRepairAggregate(
        tx,
        repair.ticketId,
        repair.ticket.complaintId
      );

      const completionEventKey = `tenant-vendor-completion-${normalized.decision.toLowerCase()}:${decision.id}`;
      await this.domainEvents.enqueue(tx, {
        event: {
          eventKey: completionEventKey,
          type: normalized.decision === "APPROVED"
            ? "VENDOR_COMPLETION_APPROVED"
            : "VENDOR_COMPLETION_REJECTED",
          targetUserIds: await this.activeVendorUsers(tx, repair.vendorId),
          vendorId: repair.vendorId,
          repairId: normalizedRepairId,
          ...(paymentRequest ? { paymentRequestId: paymentRequest.id } : {}),
          actorUserId: normalizedTenantId,
          statusCode: normalized.decision,
          occurredAt: decidedAt.toISOString()
        },
        consumers: ["NOTIFICATION"]
      });
      if (paymentRequest) {
        await this.domainEvents.enqueue(tx, {
          event: {
            eventKey: `tenant-vendor-payment-request-created:${paymentRequest.id}`,
            type: "VENDOR_PAYMENT_REQUEST_CREATED",
            targetUserIds: [normalizedTenantId],
            vendorId: repair.vendorId,
            managerId,
            repairId: normalizedRepairId,
            paymentRequestId: paymentRequest.id,
            actorUserId: normalizedTenantId,
            statusCode: "PENDING_APPROVAL",
            occurredAt: decidedAt.toISOString()
          },
          consumers: ["NOTIFICATION"]
        });
      }

      return this.projectTenantWorkflowByRepair(
        tx,
        normalizedTenantId,
        normalizedRepairId
      );
    });
  }

  async decideCompletion(
    managerId: string,
    repairId: string,
    input: DecideRepairCompletionInput
  ): Promise<DecisionCommit> {
    const normalizedManagerId = requiredText(managerId, "관리자 정보를 확인해 주세요.");
    const normalizedRepairId = requiredText(repairId, "수리 작업 정보를 확인해 주세요.");
    const normalized = normalizedCompletionDecision(input);

    return this.prisma.$transaction(async (tx) => {
      const repair = await this.lockRepair(tx, normalizedRepairId);
      await this.assertManagerRepair(tx, repair, normalizedManagerId);
      if (await this.tenantWorkflowActor(tx, repair)) {
        throw workflowError("REPAIR_ACCESS_DENIED", "세입자가 요청한 작업의 완료 보고는 세입자가 확인합니다.");
      }
      if (normalized.decision === "APPROVED") {
        assertResolvedCostBearer(repair.costBearer);
      }
      const latestReport = await tx.vendorCompletionReport.findFirst({
        where: { repairId: normalizedRepairId },
        orderBy: [{ version: "desc" }, { id: "desc" }],
        include: { decision: true }
      });
      if (!latestReport) {
        throw workflowError("COMPLETION_NOT_FOUND", "검토할 완료 보고가 없습니다.");
      }
      let paymentRequest = await tx.vendorPaymentRequest.findUnique({
        where: { repairId: normalizedRepairId }
      });
      if (latestReport.decision) {
        if (
          latestReport.decision.source === "MANAGER" &&
          latestReport.decision.managerId === normalizedManagerId &&
          latestReport.decision.decision === normalized.decision &&
          (latestReport.decision.note ?? null) === normalized.note
        ) {
          return {
            decision: mapDecision(latestReport.decision),
            ...(paymentRequest ? { paymentRequest: mapPayment(paymentRequest) } : {}),
            eventKey: `vendor-completion-${normalized.decision.toLowerCase()}:${latestReport.decision.id}`
          };
        }
        throw workflowError("REVIEW_CONFLICT", "이미 다른 내용으로 완료 보고를 검토했습니다.");
      }
      if (repair.status !== "COMPLETION_REPORTED") {
        throw workflowError("INVALID_STATE", "완료 보고 상태의 작업만 검토할 수 있습니다.");
      }
      if (paymentRequest && (
        paymentRequest.completionReportId !== latestReport.id ||
        paymentRequest.vendorId !== repair.vendorId ||
        paymentRequest.managerId !== normalizedManagerId ||
        paymentRequest.status !== "WAITING_COMPLETION"
      )) {
        throw workflowError("PAYMENT_SNAPSHOT_LOCKED", "완료 보고와 결제 요청 정보가 일치하지 않습니다.");
      }

      const decidedAt = this.clock();
      const decision = await tx.repairCompletionDecision.create({
        data: {
          id: this.nextId("completion-decision"),
          repairId: normalizedRepairId,
          completionReportId: latestReport.id,
          managerId: normalizedManagerId,
          source: "MANAGER",
          decision: normalized.decision,
          note: normalized.note,
          decidedAt
        }
      });

      if (paymentRequest && normalized.decision === "APPROVED") {
        paymentRequest = await tx.vendorPaymentRequest.update({
          where: { id: paymentRequest.id },
          data: { completionDecisionId: decision.id }
        });
      }

      if (normalized.decision === "APPROVED") {
        await tx.repairRequest.update({
          where: { id: normalizedRepairId },
          data: { status: "COMPLETED" }
        });
      } else {
        await tx.repairRequest.update({
          where: { id: normalizedRepairId },
          data: { status: "IN_PROGRESS" }
        });
      }
      await this.syncTicketRepairAggregate(
        tx,
        repair.ticketId,
        repair.ticket.complaintId
      );

      if (paymentRequest) {
        await tx.vendorPaymentAuditEvent.create({
          data: {
            id: this.nextId("payment-audit"),
            paymentRequestId: paymentRequest.id,
            type: normalized.decision === "APPROVED"
              ? "COMPLETION_APPROVED"
              : "COMPLETION_REJECTED",
            dedupeKey: `vendor-completion-${normalized.decision.toLowerCase()}:${decision.id}`,
            decisionId: decision.id,
            actorUserId: normalizedManagerId,
            note: normalized.note,
            createdAt: decidedAt
          }
        });
      }

      const eventKey = `vendor-completion-${normalized.decision.toLowerCase()}:${decision.id}`;
      const targetUserIds = await this.activeVendorUsers(tx, repair.vendorId);
      await this.domainEvents.enqueue(tx, {
        event: {
          eventKey,
          type: normalized.decision === "APPROVED"
            ? "VENDOR_COMPLETION_APPROVED"
            : "VENDOR_COMPLETION_REJECTED",
          targetUserIds,
          vendorId: repair.vendorId,
          managerId: normalizedManagerId,
          repairId: normalizedRepairId,
          ...(paymentRequest ? { paymentRequestId: paymentRequest.id } : {}),
          completionDecisionId: decision.id,
          actorUserId: normalizedManagerId,
          statusCode: normalized.decision,
          occurredAt: decidedAt.toISOString()
        },
        consumers: normalized.decision === "APPROVED" && paymentRequest
          ? ["NOTIFICATION", "CREDIT_EVALUATION"]
          : ["NOTIFICATION"]
      });

      return {
        decision: mapDecision(decision),
        ...(paymentRequest ? { paymentRequest: mapPayment(paymentRequest) } : {}),
        eventKey
      };
    });
  }

  async requestTenantDirectPayment(
    tenantId: string,
    paymentRequestId: string,
    input: RequestTenantDirectPaymentInput
  ): Promise<VendorJobPaymentView> {
    const normalizedTenantId = requiredText(tenantId, "임차인 정보를 확인해 주세요.");
    const normalizedRequestId = requiredText(
      paymentRequestId,
      "지급 요청 정보를 확인해 주세요."
    );
    const idempotencyKey = requiredText(
      input?.idempotencyKey,
      "직접결제 요청 키를 확인해 주세요."
    );
    if (idempotencyKey.length > 160) {
      throw workflowError("INVALID_REQUEST", "직접결제 요청 키는 160자 이하여야 합니다.");
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const request = await this.lockDirectPaymentRequest(tx, normalizedRequestId);
        await this.assertTenantDirectPayment(tx, request, normalizedTenantId);
        const payloadHash = directPaymentPayloadHash({
          paymentRequestId: request.id,
          tenantId: normalizedTenantId,
          vendorId: request.vendorId,
          amount: request.amount,
          completionDecisionId: request.completionDecisionId
        });
        const existing = await tx.vendorPaymentAttempt.findUnique({
          where: { idempotencyKey }
        });
        if (existing) {
          if (
            existing.paymentRequestId !== request.id ||
            existing.mode !== "DIRECT" ||
            existing.actorUserId !== normalizedTenantId ||
            existing.payloadHash !== payloadHash
          ) {
            throw workflowError(
              "REVIEW_CONFLICT",
              "동일한 요청 키로 다른 직접결제를 처리할 수 없습니다."
            );
          }
          if (this.isTenantDirectPending(request) || this.isTenantDirectPaid(request)) {
            return mapJobPayment(request);
          }
        }
        if (this.isTenantDirectPending(request) || this.isTenantDirectPaid(request)) {
          return mapJobPayment(request);
        }
        if (
          request.status !== "PENDING_APPROVAL" ||
          request.costId !== null ||
          request.ledgerEntryId !== null
        ) {
          throw workflowError(
            "INVALID_STATE",
            `현재 ${request.status} 상태에서는 직접결제를 요청할 수 없습니다.`
          );
        }
        const activeToss = await tx.repairPaymentOrder.findFirst({
          where: {
            paymentRequestId: request.id,
            status: {
              in: ["READY", "CONFIRMING", "RECONCILIATION_REQUIRED"]
            }
          },
          select: { id: true }
        });
        if (activeToss) {
          throw workflowError(
            "INVALID_STATE",
            "진행 중인 Toss 주문을 취소하거나 상태를 확인한 뒤 직접결제를 선택해 주세요."
          );
        }

        await tx.vendorPaymentAttempt.create({
          data: {
            id: this.nextId("payment-attempt"),
            paymentRequestId: request.id,
            completionDecisionId: request.completionDecisionId,
            mode: "DIRECT",
            status: "STARTED",
            idempotencyKey,
            payloadHash,
            actorUserId: normalizedTenantId,
            createdAt: this.clock()
          }
        });
        const pending = await tx.vendorPaymentRequest.update({
          where: { id: request.id },
          data: {
            status: "PENDING_APPROVAL",
            failureReason: null,
            lastAttemptMode: "DIRECT"
          }
        });
        await tx.vendorPaymentAuditEvent.createMany({
          data: {
            id: this.nextId("payment-audit"),
            paymentRequestId: request.id,
            type: "PENDING_APPROVAL",
            dedupeKey: `tenant-direct-payment-pending:${request.id}`,
            actorUserId: normalizedTenantId,
            note: "세입자가 직접결제를 선택해 업체 수령 확인을 기다립니다.",
            createdAt: this.clock()
          },
          skipDuplicates: true
        });
        return mapJobPayment(pending);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw workflowError(
          "REVIEW_CONFLICT",
          "동일한 요청 키가 이미 다른 직접결제에 사용되었습니다."
        );
      }
      throw error;
    }
  }

  async confirmVendorDirectPayment(
    vendorId: string,
    vendorUserId: string,
    paymentRequestId: string
  ): Promise<VendorJobPaymentView> {
    const normalizedVendorId = requiredText(vendorId, "업체 정보를 확인해 주세요.");
    const normalizedVendorUserId = requiredText(
      vendorUserId,
      "업체 계정 정보를 확인해 주세요."
    );
    const normalizedRequestId = requiredText(
      paymentRequestId,
      "지급 요청 정보를 확인해 주세요."
    );
    return this.prisma.$transaction(async (tx) => {
      const request = await this.lockDirectPaymentRequest(tx, normalizedRequestId);
      if (request.vendorId !== normalizedVendorId) {
        throw workflowError(
          "REPAIR_ACCESS_DENIED",
          "다른 업체의 직접결제에는 접근할 수 없습니다."
        );
      }
      if (this.isTenantDirectPaid(request)) return mapJobPayment(request);
      if (
        !this.isTenantDirectPending(request) ||
        request.costId !== null ||
        request.ledgerEntryId !== null
      ) {
        throw workflowError(
          "INVALID_STATE",
          `현재 ${request.status} 상태에서는 직접결제 수령을 확인할 수 없습니다.`
        );
      }
      const attempt = await tx.vendorPaymentAttempt.findFirst({
        where: {
          paymentRequestId: request.id,
          mode: "DIRECT",
          status: "STARTED"
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      });
      if (!attempt || attempt.actorUserId !== request.payerUserId) {
        throw workflowError(
          "INVALID_STATE",
          "확인할 직접결제 대기 기록을 찾을 수 없습니다."
        );
      }

      const confirmedAt = this.clock();
      await tx.vendorPaymentAttempt.update({
        where: { id: attempt.id },
        data: { status: "SUCCEEDED", completedAt: confirmedAt }
      });
      const paid = await tx.vendorPaymentRequest.update({
        where: { id: request.id },
        data: {
          status: "DIRECT_PAID",
          failureReason: null,
          lastAttemptMode: "DIRECT",
          directPaidAt: confirmedAt,
          directPaymentReference: `vendor-confirmation:${attempt.id}`,
          processedAt: confirmedAt
        }
      });
      const audit = await tx.vendorPaymentAuditEvent.createMany({
        data: {
          id: this.nextId("payment-audit"),
          paymentRequestId: request.id,
          type: "DIRECT_PAID",
          dedupeKey: `tenant-direct-payment-paid:${request.id}`,
          actorUserId: normalizedVendorUserId,
          note: "배정 업체가 직접결제 수령을 확인했습니다.",
          createdAt: confirmedAt
        },
        skipDuplicates: true
      });
      if (audit.count === 1) {
        await this.domainEvents.enqueue(tx, {
          event: {
            eventKey: `tenant-direct-payment-paid:${request.id}`,
            type: "VENDOR_PAYMENT_PAID",
            targetUserIds: [request.payerUserId],
            vendorId: request.vendorId,
            repairId: request.repairId,
            paymentRequestId: request.id,
            ...(request.completionDecisionId
              ? { completionDecisionId: request.completionDecisionId }
              : {}),
            actorUserId: normalizedVendorUserId,
            statusCode: "DIRECT_PAID",
            occurredAt: confirmedAt.toISOString()
          },
          consumers: ["NOTIFICATION"]
        });
      }
      return mapJobPayment(paid);
    });
  }

  async listSettlements(vendorId: string): Promise<VendorSettlementRow[]> {
    const normalizedVendorId = requiredText(vendorId, "업체 정보를 확인해 주세요.");
    const rows = await this.prisma.repairRequest.findMany({
      where: { vendorId: normalizedVendorId, status: "COMPLETED" },
      include: this.jobInclude(),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
    });
    return rows.map((row) => {
      const job = this.projectSummary(row);
      return {
        repairId: row.id,
        jobTitle: row.title,
        completedAt:
          job.latestCompletion?.completedAt ??
          row.completedAt?.toISOString() ??
          row.updatedAt.toISOString(),
        ...(job.paymentRequest
          ? {
              paymentRequest: job.paymentRequest,
              approvedAmount: job.paymentRequest.amount,
              requestedAt: job.paymentRequest.createdAt
            }
          : {})
      };
    });
  }

  private async projectJob(
    db: DbClient,
    repairId: string
  ): Promise<VendorJobDetail> {
    const repair = await db.repairRequest.findUniqueOrThrow({
      where: { id: repairId },
      include: {
        ticket: { include: { room: true, messages: true, analysis: true } },
        vendor: true
      }
    });
    const estimates = await db.vendorEstimate.findMany({
      where: { repairId },
      include: { lineItems: true },
      orderBy: [{ version: "desc" }, { id: "desc" }]
    });
    const completionReports = await db.vendorCompletionReport.findMany({
      where: { repairId },
      include: {
        attachments: { include: { attachment: true } },
        decision: true
      },
      orderBy: [{ version: "desc" }, { id: "desc" }]
    });
    const paymentRequest = await db.vendorPaymentRequest.findUnique({
      where: { repairId },
      include: {
        repairPaymentOrders: {
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: 1
        }
      }
    });
    return this.projectJobRow({
      ...repair,
      estimates,
      completionReports,
      paymentRequest
    });
  }

  private jobInclude() {
    return JOB_INCLUDE;
  }

  private projectSummary(row: JobProjection): VendorJobSummary {
    const latestEstimate = row.estimates[0];
    const latestCompletion = row.completionReports[0];
    return {
      repairId: row.id,
      ticketId: row.ticketId,
      title: row.title,
      trade: requiredVendorTrade(row.ticket.category),
      status: row.status,
      publicLocation: `${row.ticket.room.buildingName} ${publicRoomNo(row.ticket.room.roomNo)}`,
      ...(latestEstimate ? { latestEstimate: mapJobEstimate(latestEstimate) } : {}),
      ...(latestCompletion ? { latestCompletion: mapCompletion(latestCompletion) } : {}),
      ...(row.paymentRequest ? { paymentRequest: mapJobPayment(row.paymentRequest) } : {}),
      ...(row.paymentRequest?.repairPaymentOrders[0]
        ? {
            latestRepairPaymentOrder: publicRepairPaymentOrder(
              mapRepairPaymentOrder(row.paymentRequest.repairPaymentOrders[0])
            )
          }
        : {}),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  private projectJobRow(row: JobProjection): VendorJobDetail {
    return {
      ...this.projectSummary(row),
      description: row.description,
      attachmentIds: [],
      attachmentUrls: publicTicketAttachmentUrls(row.ticket),
      ...(row.scheduledAt ? { scheduledAt: row.scheduledAt.toISOString() } : {}),
      estimates: row.estimates.map(mapJobEstimate),
      completionReports: row.completionReports.map(mapCompletion)
    };
  }

  private projectTenantWorkflowRow(
    row: JobProjection,
    complaintId: string
  ): TenantVendorWorkflowView {
    const latestEstimate = row.estimates[0];
    const latestCompletion = row.completionReports[0];
    const publicCompletion = latestCompletion
      ? (() => {
          const {
            vendorId: _vendorId,
            attachmentIds: _attachmentIds,
            submissionKey: _submissionKey,
            ...view
          } = mapCompletion(latestCompletion);
          return view;
        })()
      : undefined;
    return {
      complaintId,
      repairId: row.id,
      title: row.title,
      publicLocation: `${row.ticket.room.buildingName} ${publicRoomNo(row.ticket.room.roomNo)}`,
      status: row.status,
      vendor: {
        businessName: row.vendor.businessName,
        trades: [...row.vendor.trades],
        serviceAreas: [...row.vendor.serviceAreas],
        verificationStatus: "VERIFIED"
      },
      ...(row.scheduledAt ? { scheduledAt: row.scheduledAt.toISOString() } : {}),
      ...(latestEstimate ? { latestEstimate: mapJobEstimate(latestEstimate) } : {}),
      ...(publicCompletion ? { latestCompletion: publicCompletion } : {}),
      ...(row.paymentRequest ? { paymentRequest: mapJobPayment(row.paymentRequest) } : {}),
      ...(row.paymentRequest?.repairPaymentOrders[0]
        ? {
            latestRepairPaymentOrder: publicRepairPaymentOrder(
              mapRepairPaymentOrder(row.paymentRequest.repairPaymentOrders[0])
            )
          }
        : {}),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  private async projectTenantWorkflowByRepair(
    db: DbClient,
    tenantId: string,
    repairId: string
  ): Promise<TenantVendorWorkflowView> {
    const row = await db.repairRequest.findUnique({
      where: { id: repairId },
      include: this.jobInclude()
    });
    if (!row || row.ticket.tenantId !== tenantId) {
      throw workflowError("REPAIR_ACCESS_DENIED", "이 수리 작업을 확인할 권한이 없습니다.");
    }
    return this.projectTenantWorkflowRow(row, row.ticket.complaintId);
  }

  private async lockDirectPaymentRequest(
    tx: Prisma.TransactionClient,
    paymentRequestId: string
  ): Promise<DirectPaymentProjection> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "VendorPaymentRequest"
      WHERE "id" = ${paymentRequestId}
      FOR UPDATE
    `);
    if (locked.length !== 1) {
      throw workflowError("REPAIR_NOT_FOUND", "지급 요청을 찾을 수 없습니다.");
    }
    return tx.vendorPaymentRequest.findUniqueOrThrow({
      where: { id: paymentRequestId },
      include: { repair: { include: { ticket: { include: { room: true } } } } }
    });
  }

  private async assertTenantDirectPayment(
    tx: Prisma.TransactionClient,
    request: DirectPaymentProjection,
    tenantId: string
  ) {
    const tenant = await tx.userAccount.findFirst({
      where: {
        id: tenantId,
        role: "TENANT",
        status: "ACTIVE",
        tenantRooms: { some: { roomId: request.repair.ticket.roomId } }
      },
      select: { id: true }
    });
    if (
      !tenant ||
      request.payerRole !== "TENANT" ||
      request.payerUserId !== tenantId ||
      request.repair.costBearer !== "TENANT" ||
      request.repair.ticket.tenantId !== tenantId
    ) {
      throw workflowError(
        "REPAIR_ACCESS_DENIED",
        "이 직접결제 요청을 처리할 권한이 없습니다."
      );
    }
    const assignment = await tx.domainEventOutbox.findFirst({
      where: {
        eventKey: `vendor-job-assigned:${request.repairId}`,
        type: "VENDOR_JOB_ASSIGNED",
        repairId: request.repairId,
        vendorId: request.vendorId,
        actorUserId: tenantId,
        managerId: null
      },
      select: { id: true }
    });
    if (!assignment) {
      throw workflowError(
        "REPAIR_ACCESS_DENIED",
        "세입자가 요청한 협력업체 결제만 처리할 수 있습니다."
      );
    }
  }

  private isTenantDirectPending(request: PaymentProjection) {
    return request.payerRole === "TENANT" &&
      request.status === "PENDING_APPROVAL" &&
      request.lastAttemptMode === "DIRECT";
  }

  private isTenantDirectPaid(request: PaymentProjection) {
    return request.payerRole === "TENANT" &&
      request.status === "DIRECT_PAID" &&
      request.lastAttemptMode === "DIRECT";
  }

  private async lockRepair(
    tx: Prisma.TransactionClient,
    repairId: string
  ): Promise<LockedRepair> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "RepairRequest" WHERE "id" = ${repairId} FOR UPDATE
    `);
    if (locked.length === 0) {
      throw workflowError("REPAIR_NOT_FOUND", "수리 작업을 찾을 수 없습니다.");
    }
    return tx.repairRequest.findUniqueOrThrow({
      where: { id: repairId },
      include: {
        ticket: { include: { room: true } },
        paymentRequest: true
      }
    });
  }

  private assertVendorRepair(repair: LockedRepair, vendorId: string) {
    if (repair.vendorId !== vendorId) {
      throw workflowError("REPAIR_ACCESS_DENIED", "다른 업체의 수리 작업에는 접근할 수 없습니다.");
    }
  }

  private async assertManagerRepair(
    tx: Prisma.TransactionClient,
    repair: LockedRepair,
    managerId: string
  ) {
    const manager = await tx.userAccount.findFirst({
      where: { id: managerId, status: "ACTIVE" },
      select: { id: true }
    });
    if (!manager) {
      throw workflowError("INVALID_MANAGER", "활성 관리자 계정으로만 견적을 검토할 수 있습니다.");
    }
    if (repair.ticket.room.landlordId !== managerId) {
      throw workflowError("REPAIR_ACCESS_DENIED", "이 수리 작업을 검토할 권한이 없습니다.");
    }
  }

  private async assertTenantRepair(
    tx: Prisma.TransactionClient,
    repair: LockedRepair,
    tenantId: string
  ) {
    const tenant = await tx.userAccount.findFirst({
      where: {
        id: tenantId,
        role: "TENANT",
        status: "ACTIVE",
        tenantRooms: { some: { roomId: repair.ticket.roomId } }
      },
      select: { id: true }
    });
    if (!tenant || repair.ticket.tenantId !== tenantId || repair.costBearer !== "TENANT") {
      throw workflowError("REPAIR_ACCESS_DENIED", "이 수리 작업을 확인할 권한이 없습니다.");
    }
    const assignment = await tx.domainEventOutbox.findFirst({
      where: {
        eventKey: `vendor-job-assigned:${repair.id}`,
        type: "VENDOR_JOB_ASSIGNED",
        repairId: repair.id,
        vendorId: repair.vendorId,
        actorUserId: tenantId,
        managerId: null
      },
      select: { id: true }
    });
    if (!assignment) {
      throw workflowError("REPAIR_ACCESS_DENIED", "세입자가 요청한 협력업체 작업이 아닙니다.");
    }
  }

  private async tenantWorkflowActor(
    tx: Prisma.TransactionClient,
    repair: LockedRepair
  ): Promise<string | null> {
    if (repair.costBearer !== "TENANT") return null;
    const tenantId = repair.ticket.tenantId;
    const assignment = await tx.domainEventOutbox.findFirst({
      where: {
        eventKey: `vendor-job-assigned:${repair.id}`,
        type: "VENDOR_JOB_ASSIGNED",
        repairId: repair.id,
        vendorId: repair.vendorId,
        actorUserId: tenantId,
        managerId: null
      },
      select: { actorUserId: true }
    });
    return assignment?.actorUserId ?? null;
  }

  private assertEstimateScope(
    estimate: EstimateProjection | null,
    vendorId: string,
    repairId: string
  ): asserts estimate is EstimateProjection {
    if (!estimate) {
      throw workflowError("ESTIMATE_NOT_FOUND", "견적을 찾을 수 없습니다.");
    }
    if (estimate.vendorId !== vendorId || estimate.repairId !== repairId) {
      throw workflowError("REPAIR_ACCESS_DENIED", "다른 업체 또는 작업의 견적에는 접근할 수 없습니다.");
    }
  }

  private async writeDraft(
    tx: Prisma.TransactionClient,
    estimateId: string,
    draft: NormalizedDraft
  ): Promise<EstimateProjection> {
    return tx.vendorEstimate.update({
      where: { id: estimateId },
      data: {
        responseType: draft.responseType,
        visitAvailableAt: draft.visitAvailableAt,
        estimatedDurationMinutes: draft.estimatedDurationMinutes,
        workDescription: draft.workDescription,
        declineReason: draft.declineReason,
        totalAmount: draft.totalAmount,
        lineItems: {
          deleteMany: {},
          create: draft.lineItems.map((line) => ({
            id: this.nextId("estimate-line"),
            ...line
          }))
        }
      },
      include: { lineItems: true }
    });
  }

  private async activeVendorUsers(tx: Prisma.TransactionClient, vendorId: string) {
    const links = await tx.vendorAccountLink.findMany({
      where: { vendorId, status: "ACTIVE", user: { status: "ACTIVE" } },
      select: { userId: true },
      orderBy: [{ linkedAt: "asc" }, { id: "asc" }]
    });
    return [...new Set(links.map((link) => link.userId))];
  }

  private async syncTicketRepairAggregate(
    tx: Prisma.TransactionClient,
    ticketId: string,
    complaintId: string
  ) {
    const repairs = await tx.repairRequest.findMany({
      where: { ticketId, status: { not: "CANCELLED" } },
      select: { status: true }
    });
    const allCompleted = repairs.length > 0 && repairs.every((repair) =>
      repair.status === "COMPLETED"
    );
    const allAtCompletionGate = repairs.length > 0 && repairs.every((repair) =>
      repair.status === "COMPLETED" || repair.status === "COMPLETION_REPORTED"
    );
    const ticketStatus = allCompleted
      ? "COMPLETED"
      : allAtCompletionGate
        ? "COMPLETION_REPORTED"
        : "REPAIR_IN_PROGRESS";
    await tx.ticket.update({ where: { id: ticketId }, data: { status: ticketStatus } });
    await tx.complaint.update({
      where: { id: complaintId },
      data: { status: allCompleted ? "COMPLETED" : "REPAIR_IN_PROGRESS" }
    });
  }

  private async restoreAfterEstimateExit(
    tx: Prisma.TransactionClient,
    repair: LockedRepair,
    exitingEstimateId: string
  ) {
    if (PRESERVED_REPAIR_LIFECYCLE_STATUSES.includes(
      repair.status as typeof PRESERVED_REPAIR_LIFECYCLE_STATUSES[number]
    )) {
      return;
    }
    const priorApproval = await tx.vendorEstimate.findFirst({
      where: {
        repairId: repair.id,
        status: "APPROVED",
        id: { not: exitingEstimateId }
      },
      select: { id: true }
    });
    if (priorApproval) {
      await tx.repairRequest.update({
        where: { id: repair.id },
        data: { status: "ESTIMATE_APPROVED" }
      });
      await tx.ticket.update({
        where: { id: repair.ticketId },
        data: { status: "ESTIMATE_REVIEW" }
      });
      await tx.complaint.update({
        where: { id: repair.ticket.complaintId },
        data: { status: "REVIEWING" }
      });
      return;
    }

    await tx.repairRequest.update({
      where: { id: repair.id },
      data: { status: "REQUESTED", costBearer: null }
    });
    await tx.ticket.update({
      where: { id: repair.ticketId },
      data: { status: "VENDOR_ASSIGNED" }
    });
    await tx.complaint.update({
      where: { id: repair.ticket.complaintId },
      data: { status: "VENDOR_ASSIGNED" }
    });
  }
}
