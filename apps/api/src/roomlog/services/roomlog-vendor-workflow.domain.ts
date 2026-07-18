import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException
} from "@nestjs/common";
import type {
  DecideRepairCompletionInput,
  RequestTenantDirectPaymentInput,
  StartVendorJobResult,
  SubmitVendorCompletionInput,
  SubmitVendorCompletionResult,
  TenantVendorCompletionDecisionInput,
  TenantVendorEstimateReviewInput,
  TenantVendorVisitScheduleInput,
  TenantVendorWorkflowView,
  VendorCompletionDecisionResult,
  VendorEstimate,
  VendorEstimateDraftInput,
  VendorEstimateReviewInput,
  VendorJobDetail,
  VendorJobMessageView,
  VendorJobSummary,
  VendorSettlementRow,
  VendorVisitScheduleInput
} from "@roomlog/types";
import type { AddVendorRepairMessageInput } from "../roomlog.types";
import type { DomainEventDispatcher } from "../../domain-events/domain-event.dispatcher";
import type { VendorAccountResolver } from "../vendor-activation.repository";
import {
  VendorWorkflowRepositoryError,
  type CompletionCommit,
  type DecisionCommit,
  type VendorRepairMessageRecord,
  type VendorWorkflowRepository
} from "../vendor-workflow.repository";

/** 저장소 직행으로 생성된 업체 메시지를 인메모리 스토어에 반영하는 선택 훅(RoomlogService가 구현). */
export interface VendorRepairMessageStoreSync {
  ingestVendorRepairMessage?(record: VendorRepairMessageRecord): void;
}

export interface AssignVendorInput {
  vendorId: string;
  requestNote: string;
}

function normalizeIdentifier(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException(message);
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTenantAvailableTimes(value: unknown): string {
  if (typeof value !== "string") {
    throw new BadRequestException("방문 가능 시간을 올바르게 입력해 주세요.");
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) {
    throw new BadRequestException("방문 가능 시간은 1자 이상 200자 이하로 입력해 주세요.");
  }
  return normalized;
}

function translateWorkflowError(error: unknown): never {
  if (!(error instanceof VendorWorkflowRepositoryError)) throw error;

  if (error.code === "TICKET_NOT_FOUND") {
    throw new NotFoundException("하자 접수 건을 찾을 수 없습니다.");
  }
  if (
    error.code === "REPAIR_NOT_FOUND" ||
    error.code === "ESTIMATE_NOT_FOUND" ||
    error.code === "COMPLETION_NOT_FOUND" ||
    error.code === "ATTACHMENT_NOT_FOUND"
  ) {
    throw new NotFoundException("수리 작업 또는 견적을 찾을 수 없습니다.");
  }
  if (error.code === "INVALID_REQUEST") {
    throw new BadRequestException(error.message);
  }
  if (
    error.code === "INVALID_MANAGER" ||
    error.code === "TICKET_ACCESS_DENIED" ||
    error.code === "REPAIR_ACCESS_DENIED"
  ) {
    throw new ForbiddenException("이 하자 접수 건에 업체를 배정할 권한이 없습니다.");
  }
  throw new ConflictException(error.message);
}

function publicCompletionSubmission(
  commit: CompletionCommit
): SubmitVendorCompletionResult {
  const report = commit.report;
  const payment = commit.paymentRequest;
  return {
    report: {
      id: report.id,
      repairId: report.repairId,
      version: report.version,
      origin: report.origin,
      workSummary: report.workSummary,
      completedAt: report.completedAt,
      ...(report.attachmentUrls
        ? { attachmentUrls: [...report.attachmentUrls] }
        : {}),
      ...(report.review ? { review: { ...report.review } } : {}),
      submittedAt: report.submittedAt
    },
    ...(payment ? {
      paymentRequest: {
        id: payment.id,
        repairId: payment.repairId,
        amount: payment.amount,
        status: payment.status,
        ...(payment.failureReason ? { failureReason: payment.failureReason } : {}),
        ...(payment.lastAttemptMode ? { lastAttemptMode: payment.lastAttemptMode } : {}),
        createdAt: payment.createdAt,
        ...(payment.processedAt ? { processedAt: payment.processedAt } : {})
      }
    } : {})
  };
}

function publicCompletionDecision(
  commit: DecisionCommit
): VendorCompletionDecisionResult {
  const payment = commit.paymentRequest;
  return {
    decision: commit.decision,
    ...(payment
      ? {
          paymentRequest: {
            id: payment.id,
            repairId: payment.repairId,
            payerRole: payment.payerRole,
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
          }
        }
      : {}),
    eventKey: commit.eventKey
  };
}

export class RoomlogVendorWorkflowDomain {
  constructor(
    private readonly repository: VendorWorkflowRepository,
    private readonly vendorAccounts: VendorAccountResolver & VendorRepairMessageStoreSync,
    private readonly events?: Pick<DomainEventDispatcher, "dispatchPending">
  ) {}

  async assignVendor(
    managerId: string,
    ticketId: string,
    input: AssignVendorInput
  ): Promise<VendorJobDetail> {
    const normalizedManagerId = normalizeIdentifier(
      managerId,
      "관리자 정보가 올바르지 않습니다."
    );
    const normalizedTicketId = normalizeIdentifier(
      ticketId,
      "하자 접수 정보가 올바르지 않습니다."
    );
    const payload: Record<string, unknown> = isRecord(input) ? input : {};
    const vendorId = normalizeIdentifier(payload.vendorId, "업체를 선택해 주세요.");
    const requestNote = normalizeIdentifier(
      payload.requestNote,
      "업체에 전달할 요청 내용을 입력해 주세요."
    );

    try {
      return await this.repository.assignVendor({
        managerId: normalizedManagerId,
        ticketId: normalizedTicketId,
        vendorId,
        requestNote
      });
    } catch (error) {
      translateWorkflowError(error);
    }
  }

  async listJobs(userId: string): Promise<VendorJobSummary[]> {
    const vendorId = await this.requireVendorId(userId);
    return this.execute(() => this.repository.listJobs(vendorId));
  }

  async getJob(userId: string, repairId: string): Promise<VendorJobDetail> {
    const normalizedRepairId = normalizeIdentifier(
      repairId,
      "수리 작업 정보가 올바르지 않습니다."
    );
    const vendorId = await this.requireVendorId(userId);
    const job = await this.execute(() => this.repository.getJob(vendorId, normalizedRepairId));
    if (!job) throw new NotFoundException("수리 작업을 찾을 수 없습니다.");
    return job;
  }

  async addVendorRepairMessage(
    userId: string,
    repairId: string,
    input: AddVendorRepairMessageInput
  ): Promise<VendorJobMessageView> {
    const normalizedRepairId = normalizeIdentifier(
      repairId,
      "수리 작업 정보가 올바르지 않습니다."
    );
    if (!isRecord(input)) {
      throw new BadRequestException("메시지 내용을 확인해 주세요.");
    }
    const messageText = typeof input.messageText === "string"
      ? input.messageText.trim()
      : "";
    if (input.attachmentUrls !== undefined && !Array.isArray(input.attachmentUrls)) {
      throw new BadRequestException("첨부 사진 목록을 확인해 주세요.");
    }
    const attachmentUrls = [...new Set((input.attachmentUrls ?? []).map((value) => {
      if (typeof value !== "string" || !value.trim()) {
        throw new BadRequestException("첨부 사진 정보를 확인해 주세요.");
      }
      return value.trim();
    }))];
    if (!messageText && attachmentUrls.length === 0) {
      throw new BadRequestException("메시지 또는 사진을 입력해 주세요.");
    }

    const vendorId = await this.requireVendorId(userId);
    const result = await this.execute(() => this.repository.addRepairMessage(
      vendorId,
      normalizeIdentifier(userId, "업체 계정 정보가 올바르지 않습니다."),
      normalizedRepairId,
      { messageText, attachmentUrls }
    ));
    // 저장소 직행 쓰기라 스토어 기반 읽기(세입자 상세 등)가 재하이드레이션 전엔 못 본다 — 즉시 반영.
    this.vendorAccounts.ingestVendorRepairMessage?.(result.record);
    return result.view;
  }

  async saveEstimateDraft(
    userId: string,
    repairId: string,
    estimateId: string | undefined,
    input: VendorEstimateDraftInput
  ): Promise<VendorEstimate> {
    const normalizedRepairId = normalizeIdentifier(
      repairId,
      "수리 작업 정보가 올바르지 않습니다."
    );
    const normalizedEstimateId = estimateId === undefined
      ? undefined
      : normalizeIdentifier(estimateId, "견적 정보가 올바르지 않습니다.");
    const vendorId = await this.requireVendorId(userId);
    return this.execute(() => this.repository.saveEstimateDraft({
      vendorId,
      repairId: normalizedRepairId,
      ...(normalizedEstimateId ? { estimateId: normalizedEstimateId } : {}),
      input
    }));
  }

  async submitEstimate(
    userId: string,
    repairId: string,
    estimateId: string
  ): Promise<VendorEstimate> {
    const normalizedRepairId = normalizeIdentifier(
      repairId,
      "수리 작업 정보가 올바르지 않습니다."
    );
    const normalizedEstimateId = normalizeIdentifier(
      estimateId,
      "견적 정보가 올바르지 않습니다."
    );
    const vendorId = await this.requireVendorId(userId);
    return this.execute(() => this.repository.submitEstimate(
      vendorId,
      normalizedRepairId,
      normalizedEstimateId
    ));
  }

  async withdrawEstimate(
    userId: string,
    repairId: string,
    estimateId: string
  ): Promise<VendorEstimate> {
    const normalizedRepairId = normalizeIdentifier(
      repairId,
      "수리 작업 정보가 올바르지 않습니다."
    );
    const normalizedEstimateId = normalizeIdentifier(
      estimateId,
      "견적 정보가 올바르지 않습니다."
    );
    const vendorId = await this.requireVendorId(userId);
    return this.execute(() => this.repository.withdrawEstimate(
      vendorId,
      normalizedRepairId,
      normalizedEstimateId
    ));
  }

  async reviewEstimate(
    managerId: string,
    repairId: string,
    estimateId: string,
    input: VendorEstimateReviewInput
  ): Promise<VendorEstimate> {
    const normalizedManagerId = normalizeIdentifier(
      managerId,
      "관리자 정보가 올바르지 않습니다."
    );
    const normalizedRepairId = normalizeIdentifier(
      repairId,
      "수리 작업 정보가 올바르지 않습니다."
    );
    const normalizedEstimateId = normalizeIdentifier(
      estimateId,
      "견적 정보가 올바르지 않습니다."
    );
    const normalized = this.normalizedReview(input);
    return this.execute(() => this.repository.reviewEstimate(
      normalizedManagerId,
      normalizedRepairId,
      normalizedEstimateId,
      normalized
    ));
  }

  async getTenantWorkflow(
    tenantId: string,
    complaintId: string
  ): Promise<TenantVendorWorkflowView | null> {
    return this.execute(() => this.repository.getTenantWorkflow(
      normalizeIdentifier(tenantId, "임차인 정보가 올바르지 않습니다."),
      normalizeIdentifier(complaintId, "하자 접수 정보가 올바르지 않습니다.")
    ));
  }

  async listTenantPayableWorkflows(
    tenantId: string
  ): Promise<TenantVendorWorkflowView[]> {
    return this.execute(() => this.repository.listTenantPayableWorkflows(
      normalizeIdentifier(tenantId, "임차인 정보가 올바르지 않습니다.")
    ));
  }

  async reviewTenantEstimate(
    tenantId: string,
    repairId: string,
    estimateId: string,
    input: TenantVendorEstimateReviewInput
  ): Promise<TenantVendorWorkflowView> {
    if (!isRecord(input) || !["APPROVE", "REQUEST_REVISION"].includes(String(input.action))) {
      throw new BadRequestException("지원하지 않는 견적 검토 방식입니다.");
    }
    const normalized = input.action === "APPROVE"
      ? { action: "APPROVE" as const }
      : {
          action: "REQUEST_REVISION" as const,
          note: normalizeIdentifier(input.note, "수정 요청 사유를 입력해 주세요."),
          ...(input.tenantAvailableTimes === undefined
            ? {}
            : {
                tenantAvailableTimes: normalizeTenantAvailableTimes(
                  input.tenantAvailableTimes
                )
              })
        };
    return this.execute(() => this.repository.reviewTenantEstimate(
      normalizeIdentifier(tenantId, "임차인 정보가 올바르지 않습니다."),
      normalizeIdentifier(repairId, "수리 작업 정보가 올바르지 않습니다."),
      normalizeIdentifier(estimateId, "견적 정보가 올바르지 않습니다."),
      normalized
    ));
  }

  async confirmTenantEstimateVisit(
    tenantId: string,
    repairId: string,
    estimateId: string,
    input: TenantVendorVisitScheduleInput
  ): Promise<TenantVendorWorkflowView> {
    return this.execute(() => this.repository.confirmTenantEstimateVisit(
      normalizeIdentifier(tenantId, "임차인 정보가 올바르지 않습니다."),
      normalizeIdentifier(repairId, "수리 작업 정보가 올바르지 않습니다."),
      normalizeIdentifier(estimateId, "견적 정보가 올바르지 않습니다."),
      this.normalizedSchedule(input)
    ));
  }

  async decideTenantCompletion(
    tenantId: string,
    repairId: string,
    input: TenantVendorCompletionDecisionInput
  ): Promise<TenantVendorWorkflowView> {
    return this.execute(() => this.repository.decideTenantCompletion(
      normalizeIdentifier(tenantId, "임차인 정보가 올바르지 않습니다."),
      normalizeIdentifier(repairId, "수리 작업 정보가 올바르지 않습니다."),
      this.normalizedCompletionDecision(input)
    ));
  }

  async confirmEstimateVisit(
    managerId: string,
    repairId: string,
    estimateId: string,
    input: VendorVisitScheduleInput
  ): Promise<VendorJobDetail> {
    const normalizedManagerId = normalizeIdentifier(
      managerId,
      "관리자 정보가 올바르지 않습니다."
    );
    const normalizedRepairId = normalizeIdentifier(
      repairId,
      "수리 작업 정보가 올바르지 않습니다."
    );
    const normalizedEstimateId = normalizeIdentifier(
      estimateId,
      "견적 정보가 올바르지 않습니다."
    );
    return this.execute(() => this.repository.confirmEstimateVisit(
      normalizedManagerId,
      normalizedRepairId,
      normalizedEstimateId,
      this.normalizedSchedule(input)
    ));
  }

  async scheduleApprovedJob(
    userId: string,
    repairId: string,
    input: VendorVisitScheduleInput
  ): Promise<VendorJobDetail> {
    const normalizedRepairId = normalizeIdentifier(
      repairId,
      "수리 작업 정보가 올바르지 않습니다."
    );
    const vendorId = await this.requireVendorId(userId);
    return this.execute(() => this.repository.scheduleApprovedJob(
      vendorId,
      normalizedRepairId,
      this.normalizedSchedule(input)
    ));
  }

  async startJob(userId: string, repairId: string): Promise<StartVendorJobResult> {
    const normalizedRepairId = normalizeIdentifier(
      repairId,
      "수리 작업 정보가 올바르지 않습니다."
    );
    const vendorId = await this.requireVendorId(userId);
    return this.execute(() => this.repository.startJob(vendorId, normalizedRepairId));
  }

  async submitCompletion(
    userId: string,
    repairId: string,
    input: SubmitVendorCompletionInput
  ): Promise<SubmitVendorCompletionResult> {
    const normalizedRepairId = normalizeIdentifier(
      repairId,
      "수리 작업 정보가 올바르지 않습니다."
    );
    const payload = this.normalizedCompletion(input);
    const vendorId = await this.requireVendorId(userId);
    const committed = await this.execute(() => this.repository.submitCompletion(
      vendorId,
      normalizedRepairId,
      payload
    ));
    return publicCompletionSubmission(committed);
  }

  async decideCompletion(
    managerId: string,
    repairId: string,
    input: DecideRepairCompletionInput
  ): Promise<VendorCompletionDecisionResult> {
    const normalizedManagerId = normalizeIdentifier(
      managerId,
      "관리자 정보가 올바르지 않습니다."
    );
    const normalizedRepairId = normalizeIdentifier(
      repairId,
      "수리 작업 정보가 올바르지 않습니다."
    );
    const payload = this.normalizedCompletionDecision(input);
    const committed = await this.execute(() => this.repository.decideCompletion(
      normalizedManagerId,
      normalizedRepairId,
      payload
    ));
    await this.events?.dispatchPending(25).catch(() => undefined);
    return publicCompletionDecision(committed);
  }

  async requestTenantDirectPayment(
    tenantId: string,
    paymentRequestId: string,
    input: RequestTenantDirectPaymentInput
  ) {
    const idempotencyKey = isRecord(input)
      ? normalizeIdentifier(
          input.idempotencyKey,
          "직접결제 요청 키를 확인해 주세요."
        )
      : normalizeIdentifier(undefined, "직접결제 요청 키를 확인해 주세요.");
    return this.execute(() => this.repository.requestTenantDirectPayment(
      normalizeIdentifier(tenantId, "임차인 정보가 올바르지 않습니다."),
      normalizeIdentifier(paymentRequestId, "지급 요청 정보가 올바르지 않습니다."),
      { idempotencyKey }
    ));
  }

  async confirmVendorDirectPayment(userId: string, paymentRequestId: string) {
    const vendorId = await this.requireVendorId(userId);
    return this.execute(() => this.repository.confirmVendorDirectPayment(
      vendorId,
      normalizeIdentifier(userId, "업체 계정 정보가 올바르지 않습니다."),
      normalizeIdentifier(paymentRequestId, "지급 요청 정보가 올바르지 않습니다.")
    ));
  }

  async listSettlements(userId: string): Promise<VendorSettlementRow[]> {
    const vendorId = await this.requireVendorId(userId);
    return this.execute(() => this.repository.listSettlements(vendorId));
  }

  private async requireVendorId(userId: string) {
    const normalizedUserId = normalizeIdentifier(
      userId,
      "로그인 정보가 올바르지 않습니다."
    );
    const vendorId = await this.vendorAccounts.resolveActiveVendorId(normalizedUserId);
    if (typeof vendorId !== "string" || !vendorId.trim()) {
      throw new ForbiddenException("활성 업체 계정으로만 접근할 수 있습니다.");
    }
    return vendorId.trim();
  }

  private normalizedSchedule(input: VendorVisitScheduleInput): VendorVisitScheduleInput {
    const rawScheduledAt = isRecord(input) ? input.scheduledAt : undefined;
    const scheduledAt = typeof rawScheduledAt === "string" ? rawScheduledAt.trim() : "";
    if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) {
      throw new BadRequestException("유효한 방문 일정을 입력해 주세요.");
    }
    return { scheduledAt: new Date(scheduledAt).toISOString() };
  }

  private normalizedCompletion(
    input: SubmitVendorCompletionInput
  ): SubmitVendorCompletionInput {
    if (!isRecord(input)) {
      throw new BadRequestException("완료 보고 내용을 확인해 주세요.");
    }
    const workSummary = normalizeIdentifier(
      input.workSummary,
      "완료한 작업 내용을 입력해 주세요."
    );
    const submissionKey = normalizeIdentifier(
      input.submissionKey,
      "완료 보고 제출 정보를 확인해 주세요."
    );
    const completedAtValue = typeof input.completedAt === "string"
      ? input.completedAt.trim()
      : "";
    const completedAt = new Date(completedAtValue);
    if (!completedAtValue || Number.isNaN(completedAt.getTime())) {
      throw new BadRequestException("유효한 작업 완료 일시를 입력해 주세요.");
    }
    if (!Array.isArray(input.attachmentIds)) {
      throw new BadRequestException("완료 사진 목록을 확인해 주세요.");
    }
    const attachmentIds = [...new Set(input.attachmentIds.map((attachmentId) =>
      normalizeIdentifier(attachmentId, "완료 사진 정보를 확인해 주세요.")
    ))].sort();
    return {
      workSummary,
      completedAt: completedAt.toISOString(),
      attachmentIds,
      submissionKey
    };
  }

  private normalizedCompletionDecision(
    input: DecideRepairCompletionInput
  ): DecideRepairCompletionInput {
    if (!isRecord(input) || !["APPROVED", "REJECTED"].includes(String(input.decision))) {
      throw new BadRequestException("지원하지 않는 완료 검토 방식입니다.");
    }
    if (input.note !== undefined && typeof input.note !== "string") {
      throw new BadRequestException("완료 검토 메모를 확인해 주세요.");
    }
    const note = typeof input.note === "string" ? input.note.trim() : "";
    if (input.decision === "REJECTED") {
      if (!note) throw new BadRequestException("완료 반려 사유를 입력해 주세요.");
      return { decision: "REJECTED", note };
    }
    return { decision: "APPROVED", ...(note ? { note } : {}) };
  }

  private normalizedReview(input: VendorEstimateReviewInput): VendorEstimateReviewInput {
    if (!isRecord(input)) {
      throw new BadRequestException("지원하지 않는 견적 검토 방식입니다.");
    }
    const action = input.action;
    if (
      typeof action !== "string" ||
      !["APPROVE", "REQUEST_REVISION", "REJECT"].includes(action)
    ) {
      throw new BadRequestException("지원하지 않는 견적 검토 방식입니다.");
    }
    if (action === "APPROVE") {
      const costBearer = input.costBearer;
      if (
        typeof costBearer !== "string" ||
        !["LANDLORD", "TENANT", "PENDING"].includes(costBearer)
      ) {
        throw new BadRequestException("비용 부담 주체를 확인해 주세요.");
      }
      if (input.note !== undefined && typeof input.note !== "string") {
        throw new BadRequestException("검토 사유를 올바르게 입력해 주세요.");
      }
      const note = typeof input.note === "string" ? input.note.trim() : "";
      return {
        action: "APPROVE",
        costBearer: costBearer as "LANDLORD" | "TENANT" | "PENDING",
        ...(note ? { note } : {})
      };
    }
    const note = typeof input.note === "string" ? input.note.trim() : "";
    if (!note) throw new BadRequestException("검토 사유를 입력해 주세요.");
    if (action === "REQUEST_REVISION") {
      return {
        action,
        note,
        ...(input.tenantAvailableTimes === undefined
          ? {}
          : {
              tenantAvailableTimes: normalizeTenantAvailableTimes(
                input.tenantAvailableTimes
              )
            })
      };
    }
    return { action, note };
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      translateWorkflowError(error);
    }
  }
}
