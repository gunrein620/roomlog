import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { id, now } from "../roomlog-support";
import type {
  CreateMessagingThreadInput,
  CreateMoveoutDisputeInput,
  CreateTenantMoveoutInquiryInput,
  EscalateMoveoutDisputeInput,
  MessagingThread,
  MoveoutAdjustDeductionInput,
  MoveoutAdjustWearVerdictInput,
  MoveoutChecklistItem,
  MoveoutCompleteReviewInput,
  MoveoutDashboardSummary,
  MoveoutDeductionCandidate,
  MoveoutDispute,
  MoveoutDisputeStatus,
  MoveoutManagerRow,
  MoveoutManagerSettlementReview,
  MoveoutRecordItem,
  MoveoutReportAuditEntry,
  MoveoutRespondDisputeInput,
  MoveoutReviewCompletionGate,
  MoveoutReviewGateBlockReason,
  MoveoutSettlementEstimate,
  MoveoutSummary,
  UpdateTenantMoveoutDisputeInput,
  Room,
  UpdateMoveoutChecklistInput
} from "../roomlog.types";
import type { Store } from "../roomlog.service";

type CreateThread = (managerId: string, input: CreateMessagingThreadInput) => MessagingThread;
type AddThreadMessage = (
  actorId: string,
  threadId: string,
  input: { body?: string; attachmentUrls?: string[] }
) => MessagingThread;

const OPEN_DISPUTE_STATUSES: MoveoutDisputeStatus[] = [
  "received",
  "reviewing",
  "answered",
  "re_disputed"
];

export class RoomlogMoveoutDomain {
  constructor(
    private readonly store: Store,
    private readonly persistStore: () => void,
    private readonly findRoom: (roomId: string) => Room,
    private readonly assertManagerCanAccessRoom: (managerId: string, roomId: string) => void,
    private readonly canManagerAccessRoom: (managerId: string, roomId: string) => boolean,
    private readonly displayUnitId: (room: Room) => string,
    private readonly timeOf: (iso?: string) => number,
    private readonly createMessagingThread: CreateThread,
    private readonly addTenantMessagingThreadMessage: AddThreadMessage,
    private readonly addManagerMessagingThreadMessage: AddThreadMessage
  ) {}

  listTenantMoveouts(tenantId: string): MoveoutSummary[] {
    return this.store.moveouts
      .filter((moveout) => moveout.tenantId === tenantId)
      .sort((a, b) => this.timeOf(b.updatedAt) - this.timeOf(a.updatedAt))
      .map((moveout) => this.presentMoveout(moveout));
  }

  getTenantMoveout(tenantId: string, moveoutId: string): MoveoutSummary {
    return this.presentMoveout(this.findTenantMoveout(tenantId, moveoutId));
  }

  listTenantMoveoutRecords(tenantId: string, moveoutId: string): MoveoutRecordItem[] {
    const moveout = this.findTenantMoveout(tenantId, moveoutId);

    return this.recordsFor(moveout.id);
  }

  listTenantMoveoutChecklist(tenantId: string, moveoutId: string): MoveoutChecklistItem[] {
    const moveout = this.findTenantMoveout(tenantId, moveoutId);

    return this.checklistFor(moveout.id);
  }

  updateTenantMoveoutChecklist(
    tenantId: string,
    moveoutId: string,
    input: UpdateMoveoutChecklistInput
  ): MoveoutChecklistItem[] {
    const moveout = this.findTenantMoveout(tenantId, moveoutId);
    const items = Array.isArray(input?.items) ? input.items : [];

    if (items.length === 0) {
      throw new BadRequestException("저장할 퇴실 체크리스트 항목이 필요합니다.");
    }

    const nextItems = items.map((item) => {
      const label = item.label?.trim();
      const itemId = item.id?.trim() || id("mchk");
      const existing = this.store.moveoutChecklist.find((candidate) => candidate.id === itemId);

      if (!label) {
        throw new BadRequestException("퇴실 체크리스트 항목명을 입력해주세요.");
      }

      if (!["normal", "aging", "damage_check"].includes(item.condition)) {
        throw new BadRequestException("퇴실 체크리스트 상태 값이 올바르지 않습니다.");
      }

      if (existing && existing.summaryId !== moveout.id) {
        throw new ForbiddenException("다른 퇴실 요청의 체크리스트 항목은 수정할 수 없습니다.");
      }

      const note = item.note?.trim();
      const attachmentUrls = this.nonEmptyStrings(item.attachmentUrls);

      return {
        id: itemId,
        summaryId: moveout.id,
        label,
        present: Boolean(item.present),
        condition: item.condition,
        note: note || undefined,
        attachmentUrls
      };
    });

    this.store.moveoutChecklist = [
      ...this.store.moveoutChecklist.filter((item) => item.summaryId !== moveout.id),
      ...nextItems
    ];
    moveout.prepProgress = this.checklistProgress(nextItems);
    moveout.updatedAt = now();
    this.persistStore();

    return nextItems.map((item) => ({ ...item, attachmentUrls: [...item.attachmentUrls] }));
  }

  getTenantMoveoutSettlement(tenantId: string, moveoutId: string): MoveoutSettlementEstimate {
    const moveout = this.findTenantMoveout(tenantId, moveoutId);

    return this.presentSettlement(this.findSettlement(moveout));
  }

  listTenantMoveoutDisputes(tenantId: string, moveoutId: string): MoveoutDispute[] {
    const moveout = this.findTenantMoveout(tenantId, moveoutId);

    return this.disputesFor(moveout.id);
  }

  createTenantMoveoutInquiry(
    tenantId: string,
    moveoutId: string,
    input: CreateTenantMoveoutInquiryInput
  ) {
    const moveout = this.findTenantMoveout(tenantId, moveoutId);
    const body = input.body?.trim();

    if (!body) {
      throw new BadRequestException("퇴실 문의 내용을 입력해주세요.");
    }

    const managerId = this.managerIdFor(moveout);
    const attachmentUrls = this.nonEmptyStrings(input.attachmentUrls);
    const thread = this.ensureMoveoutThread(moveout, managerId, "tenant", body, attachmentUrls);
    const createdAt = now();
    this.store.moveoutRecords.unshift({
      id: id("mrec"),
      summaryId: moveout.id,
      source: "chat",
      title: "퇴실 문의",
      description: body,
      occurredAt: createdAt,
      moveinComparisonAvailable: false
    });
    moveout.updatedAt = createdAt;
    this.persistStore();

    return { moveout: this.presentMoveout(moveout), thread };
  }

  createTenantMoveoutDispute(
    tenantId: string,
    moveoutId: string,
    input: CreateMoveoutDisputeInput
  ): MoveoutDispute {
    const moveout = this.findTenantMoveout(tenantId, moveoutId);
    const reason = input.reason?.trim();
    const targetLabel = input.targetLabel?.trim();

    if (!targetLabel || !reason) {
      throw new BadRequestException("이의 대상과 사유를 입력해주세요.");
    }

    const createdAt = now();
    const attachmentUrls = this.nonEmptyStrings(input.attachmentUrls);
    const dispute: MoveoutDispute = {
      id: id("mdp"),
      summaryId: moveout.id,
      targetItemId: input.targetItemId?.trim() || undefined,
      targetLabel,
      reason,
      attachmentUrls,
      status: "received",
      slaDeadline: this.addHoursIso(createdAt, 72),
      slaBreached: false,
      history: [{ status: "received", at: createdAt, actorUserId: tenantId, note: reason }],
      createdAt,
      updatedAt: createdAt
    };
    const managerId = this.managerIdFor(moveout);
    const thread = this.ensureMoveoutThread(
      moveout,
      managerId,
      "tenant",
      `퇴실 이의 접수: ${targetLabel}\n사유: ${reason}`,
      attachmentUrls
    );

    dispute.messagingThreadId = thread.id;
    moveout.messagingThreadId = thread.id;
    this.store.moveoutDisputes.unshift(dispute);
    moveout.updatedAt = createdAt;
    this.persistStore();

    return this.presentDispute(dispute);
  }

  updateTenantMoveoutDispute(
    tenantId: string,
    moveoutId: string,
    input: UpdateTenantMoveoutDisputeInput
  ): MoveoutDispute {
    const moveout = this.findTenantMoveout(tenantId, moveoutId);
    const dispute = this.findDisputeForMoveout(moveout.id, input.disputeId);
    const action = input.action;
    const actedAt = now();
    const attachmentUrls = this.nonEmptyStrings(input.attachmentUrls);
    const reason = input.reason?.trim();

    if (!["confirm", "re_dispute", "resolve"].includes(action)) {
      throw new BadRequestException("퇴실 이의 전이 값이 올바르지 않습니다.");
    }

    if (action === "confirm" && dispute.status !== "answered") {
      throw new BadRequestException("관리자 응답 이후에만 확인 처리할 수 있습니다.");
    }

    if (action === "re_dispute" && !reason) {
      throw new BadRequestException("재이의 사유를 입력해주세요.");
    }

    if (action === "resolve" && !["answered", "confirmed", "re_disputed", "reviewing"].includes(dispute.status)) {
      throw new BadRequestException("해소 처리할 수 있는 이의 상태가 아닙니다.");
    }

    const nextStatus =
      action === "confirm" ? "confirmed" : action === "re_dispute" ? "re_disputed" : "resolved";
    const note =
      action === "confirm"
        ? "관리자 응답 확인"
        : action === "resolve"
          ? "임차인 해소 처리"
          : reason;

    dispute.status = nextStatus;
    if (action === "re_dispute") {
      dispute.reason = reason!;
      dispute.attachmentUrls = attachmentUrls;
    }
    dispute.history = [
      ...dispute.history,
      { status: nextStatus, at: actedAt, actorUserId: tenantId, note }
    ];
    dispute.updatedAt = actedAt;

    const managerId = this.managerIdFor(moveout);
    this.ensureMoveoutThread(
      moveout,
      managerId,
      "tenant",
      this.tenantDisputeActionMessage(dispute.targetLabel, action, note),
      attachmentUrls
    );
    moveout.updatedAt = actedAt;
    this.persistStore();

    return this.presentDispute(dispute);
  }

  escalateTenantMoveoutDispute(
    tenantId: string,
    moveoutId: string,
    input: EscalateMoveoutDisputeInput
  ): MoveoutDispute {
    const moveout = this.findTenantMoveout(tenantId, moveoutId);
    const dispute = this.findDisputeForMoveout(moveout.id, input.disputeId);

    if (!dispute.slaBreached) {
      throw new BadRequestException("SLA 경과 전에는 에스컬레이션할 수 없습니다.");
    }

    if (dispute.status === "resolved") {
      throw new BadRequestException("이미 해소된 이의는 에스컬레이션할 수 없습니다.");
    }

    const escalatedAt = now();
    const reason = input.reason?.trim() || "SLA 경과로 에스컬레이션 요청";
    dispute.status = "reviewing";
    dispute.history = [
      ...dispute.history,
      {
        status: "reviewing",
        at: escalatedAt,
        actorUserId: tenantId,
        note: `에스컬레이션 요청: ${reason}`
      }
    ];
    dispute.updatedAt = escalatedAt;

    const managerId = this.managerIdFor(moveout);
    this.ensureMoveoutThread(
      moveout,
      managerId,
      "tenant",
      `퇴실 이의 SLA 에스컬레이션: ${dispute.targetLabel}\n사유: ${reason}`
    );
    moveout.updatedAt = escalatedAt;
    this.persistStore();

    return this.presentDispute(dispute);
  }

  getManagerMoveoutDashboard(managerId: string): MoveoutDashboardSummary {
    const rows = this.listManagerMoveoutRows(managerId);

    return {
      expiringSoon: rows.filter((row) => row.expiringSoon).length,
      disputesWaiting: rows.reduce((sum, row) => sum + row.openDisputeCount, 0),
      slaBreached: rows.filter((row) => row.slaBreached).length,
      reviewDone: rows.filter((row) => row.settlementStatus === "review_done").length
    };
  }

  listManagerMoveoutRows(managerId: string): MoveoutManagerRow[] {
    return this.store.moveouts
      .filter((moveout) => this.canManagerAccessRoom(managerId, moveout.roomId))
      .sort((a, b) => this.timeOf(a.leaseEndDate) - this.timeOf(b.leaseEndDate))
      .map((moveout) => this.presentManagerRow(moveout));
  }

  getManagerMoveout(managerId: string, moveoutId: string): MoveoutSummary {
    return this.presentMoveout(this.findManagerMoveout(managerId, moveoutId));
  }

  getManagerMoveoutRecords(managerId: string, moveoutId: string): MoveoutRecordItem[] {
    const moveout = this.findManagerMoveout(managerId, moveoutId);

    return this.recordsFor(moveout.id);
  }

  getManagerReportAudit(managerId: string, moveoutId: string): MoveoutReportAuditEntry[] {
    const moveout = this.findManagerMoveout(managerId, moveoutId);

    return this.store.moveoutReportAudits
      .filter((audit) => audit.summaryId === moveout.id)
      .sort((a, b) => this.timeOf(b.at) - this.timeOf(a.at))
      .map((audit) => ({ ...audit }));
  }

  getManagerMoveoutSettlement(
    managerId: string,
    moveoutId: string
  ): MoveoutManagerSettlementReview {
    const moveout = this.findManagerMoveout(managerId, moveoutId);
    const settlement = this.findSettlement(moveout);

    return {
      settlement: this.presentSettlement(settlement),
      gate: this.reviewGateFor(moveout),
      disputes: this.disputesFor(moveout.id),
      moveinEvidenceAvailable: this.moveinEvidenceAvailable(moveout)
    };
  }

  adjustManagerMoveoutWearVerdict(
    managerId: string,
    moveoutId: string,
    input: MoveoutAdjustWearVerdictInput
  ) {
    const moveout = this.findManagerMoveout(managerId, moveoutId);
    const record = this.store.moveoutRecords.find(
      (item) => item.summaryId === moveout.id && item.id === input.recordItemId
    );

    if (!record) {
      throw new NotFoundException("퇴실 기록 항목을 찾을 수 없습니다.");
    }

    const evidenceNote = input.evidenceNote?.trim();

    if (!evidenceNote) {
      throw new BadRequestException("훼손 추정 조정 근거가 필요합니다.");
    }

    if (!input.notifyTenant) {
      throw new BadRequestException("훼손 추정 조정은 임차인 통지 기록이 필요합니다.");
    }

    if (input.action === "adjust" && !input.toVerdict) {
      throw new BadRequestException("조정할 훼손 추정 값을 선택해주세요.");
    }

    if (
      input.action === "adjust" &&
      input.toVerdict === "damage_possible" &&
      !record.moveinComparisonAvailable
    ) {
      throw new BadRequestException(
        "입주 전 증빙 공백만으로 임차인 책임을 추정하거나 훼손 가능성을 확정할 수 없습니다."
      );
    }

    const manager = this.findUser(managerId);
    const at = now();
    const audit: MoveoutReportAuditEntry = {
      id: id("maud"),
      summaryId: moveout.id,
      recordItemId: record.id,
      action: input.action,
      fromVerdict: record.wearVerdict,
      toVerdict: input.action === "adjust" ? input.toVerdict : record.wearVerdict,
      evidenceNote,
      tenantNotified: input.notifyTenant,
      managerName: manager.name,
      managerId,
      at
    };

    if (input.action === "adjust") {
      record.wearVerdict = input.toVerdict;
      record.wearNote = evidenceNote;
    }

    this.store.moveoutReportAudits.unshift(audit);
    moveout.updatedAt = at;
    this.persistStore();

    return { record: { ...record }, audit: { ...audit } };
  }

  adjustManagerMoveoutDeduction(
    managerId: string,
    moveoutId: string,
    input: MoveoutAdjustDeductionInput
  ): MoveoutSettlementEstimate {
    const moveout = this.findManagerMoveout(managerId, moveoutId);
    const deduction = this.store.moveoutDeductions.find(
      (item) => item.summaryId === moveout.id && item.id === input.deductionId
    );

    if (!deduction) {
      throw new NotFoundException("차감 후보를 찾을 수 없습니다.");
    }

    const nextMin = input.estimatedMin ?? deduction.estimatedMin;
    const nextMax = input.estimatedMax ?? deduction.estimatedMax;

    if (nextMin < 0 || nextMax < 0 || nextMin > nextMax) {
      throw new BadRequestException("예상 차감 금액은 0원 이상의 범위로 입력해야 합니다.");
    }

    deduction.estimatedMin = nextMin;
    deduction.estimatedMax = nextMax;
    if (input.resolveConfirmation) {
      deduction.needsConfirmation = false;
    }
    moveout.updatedAt = now();
    this.recalculateSettlementRange(moveout);
    this.persistStore();

    return this.presentSettlement(this.findSettlement(moveout));
  }

  completeManagerMoveoutReview(
    managerId: string,
    moveoutId: string,
    input: MoveoutCompleteReviewInput
  ): MoveoutManagerSettlementReview {
    const moveout = this.findManagerMoveout(managerId, moveoutId);
    const gate = this.reviewGateFor(moveout);

    if (gate.blockingReasons.includes("contract_unconfirmed")) {
      throw new BadRequestException("계약 확정 전에는 퇴실 확정 또는 정산 검토 완료를 진행할 수 없습니다.");
    }

    if (!input.acknowledgeEvidence) {
      throw new BadRequestException("퇴실 기록과 예상 정산 근거 확인이 필요합니다.");
    }

    if (!gate.canComplete) {
      if (input.overrideSla) {
        const reason = input.overrideReason?.trim();

        if (!reason) {
          throw new BadRequestException("SLA override 사유가 필요합니다.");
        }

        if (!gate.overrideAvailable) {
          throw new ForbiddenException("현재 차단 사유는 SLA override로 진행할 수 없습니다.");
        }
      } else {
        throw new BadRequestException(gate.message);
      }
    }

    const reviewedAt = now();
    const settlement = this.findSettlement(moveout);
    moveout.settlementStatus = "review_done";
    moveout.updatedAt = reviewedAt;
    settlement.status = "review_done";
    settlement.updatedAt = reviewedAt;
    this.store.moveoutReportAudits.unshift({
      id: id("maud"),
      summaryId: moveout.id,
      recordItemId: "settlement",
      action: input.overrideSla ? "reinforce" : "keep",
      evidenceNote: input.overrideSla
        ? `SLA override: ${input.overrideReason?.trim()}`
        : "퇴실 기록과 예상 정산 근거 확인",
      tenantNotified: true,
      managerName: this.findUser(managerId).name,
      managerId,
      at: reviewedAt
    });
    this.persistStore();

    return this.getManagerMoveoutSettlement(managerId, moveout.id);
  }

  respondManagerMoveoutDispute(
    managerId: string,
    moveoutId: string,
    input: MoveoutRespondDisputeInput
  ): MoveoutDispute {
    const moveout = this.findManagerMoveout(managerId, moveoutId);
    const dispute = this.store.moveoutDisputes.find(
      (item) => item.summaryId === moveout.id && item.id === input.disputeId
    );

    if (!dispute) {
      throw new NotFoundException("퇴실 이의를 찾을 수 없습니다.");
    }

    const message = input.message?.trim();

    if (!message) {
      throw new BadRequestException("이의 응답 내용을 입력해주세요.");
    }

    const thread = this.ensureMoveoutThread(
      moveout,
      managerId,
      "manager",
      `퇴실 이의 답변: ${message}`
    );
    const answeredAt = now();
    dispute.status = "answered";
    dispute.managerResponse = message;
    dispute.messagingThreadId = thread.id;
    dispute.history = [
      ...dispute.history,
      {
        status: "answered",
        at: answeredAt,
        actorUserId: managerId,
        note: `${input.kind}: ${message}`
      }
    ];
    dispute.updatedAt = answeredAt;

    if (input.reflect && input.reflect !== "none") {
      this.store.moveoutReportAudits.unshift({
        id: id("maud"),
        summaryId: moveout.id,
        recordItemId: dispute.targetItemId ?? "dispute",
        action: "reinforce",
        evidenceNote: `이의 응답 반영(${input.reflect}): ${message}`,
        tenantNotified: true,
        managerName: this.findUser(managerId).name,
        managerId,
        at: answeredAt
      });

      if (input.reflect === "settlement" && input.kind === "accept" && dispute.targetItemId) {
        const deduction = this.store.moveoutDeductions.find(
          (item) => item.summaryId === moveout.id && item.id === dispute.targetItemId
        );

        if (deduction) {
          deduction.estimatedMin = 0;
          deduction.estimatedMax = 0;
          deduction.needsConfirmation = false;
          this.recalculateSettlementRange(moveout);
        }
      }
    }

    moveout.updatedAt = answeredAt;
    this.persistStore();

    return this.presentDispute(dispute);
  }

  private findTenantMoveout(tenantId: string, moveoutId: string) {
    const moveout = this.store.moveouts.find(
      (item) => item.id === moveoutId && item.tenantId === tenantId
    );

    if (!moveout) {
      throw new NotFoundException("조회 가능한 퇴실 요청을 찾을 수 없습니다.");
    }

    this.assertMoveoutScope(moveout);

    return moveout;
  }

  private findManagerMoveout(managerId: string, moveoutId: string) {
    const moveout = this.store.moveouts.find((item) => item.id === moveoutId);

    if (!moveout || !this.canManagerAccessRoom(managerId, moveout.roomId)) {
      throw new NotFoundException("관리 가능한 퇴실 요청을 찾을 수 없습니다.");
    }

    this.assertMoveoutScope(moveout);

    return moveout;
  }

  private findSettlement(moveout: MoveoutSummary) {
    const settlement = this.store.moveoutSettlements.find(
      (item) => item.summaryId === moveout.id || item.id === moveout.settlementId
    );

    if (!settlement) {
      throw new NotFoundException("퇴실 예상 정산안을 찾을 수 없습니다.");
    }

    return settlement;
  }

  private recordsFor(summaryId: string) {
    return this.store.moveoutRecords
      .filter((record) => record.summaryId === summaryId)
      .map((record) => ({
        ...record,
        evidenceUrls: record.evidenceUrls ? this.nonEmptyStrings(record.evidenceUrls) : undefined,
        detailSections: record.detailSections?.map((section) => ({
          ...section,
          items: section.items.map((item) => ({ ...item }))
        })),
        detail: record.detail ? {
          ...record.detail,
          media: record.detail.media?.map((item) => ({ ...item })),
          chatMessages: record.detail.chatMessages?.map((item) => ({
            ...item,
            attachmentUrls: item.attachmentUrls ? this.nonEmptyStrings(item.attachmentUrls) : undefined
          })),
          events: record.detail.events?.map((item) => ({
            ...item,
            evidenceUrls: item.evidenceUrls ? this.nonEmptyStrings(item.evidenceUrls) : undefined
          })),
          amounts: record.detail.amounts?.map((item) => ({ ...item })),
          clauses: record.detail.clauses?.map((item) => ({ ...item }))
        } : undefined
      }));
  }

  private checklistFor(summaryId: string) {
    return this.store.moveoutChecklist
      .filter((item) => item.summaryId === summaryId)
      .map((item) => ({ ...item, attachmentUrls: [...(item.attachmentUrls ?? [])] }));
  }

  private disputesFor(summaryId: string) {
    return this.store.moveoutDisputes
      .filter((dispute) => dispute.summaryId === summaryId)
      .sort((a, b) => this.timeOf(b.updatedAt) - this.timeOf(a.updatedAt))
      .map((dispute) => this.presentDispute(dispute));
  }

  private findDisputeForMoveout(summaryId: string, disputeId: string) {
    const dispute = this.store.moveoutDisputes.find(
      (item) => item.summaryId === summaryId && item.id === disputeId
    );

    if (!dispute) {
      throw new NotFoundException("퇴실 이의를 찾을 수 없습니다.");
    }

    return dispute;
  }

  private presentMoveout(moveout: MoveoutSummary): MoveoutSummary {
    const contractConfirmed = this.isContractConfirmed(moveout);
    const leaseEndDate = contractConfirmed ? moveout.leaseEndDate : undefined;

    return {
      ...moveout,
      contractConfirmed,
      leaseEndDate,
      daysRemaining: contractConfirmed && leaseEndDate ? this.daysRemaining(leaseEndDate) : undefined
    };
  }

  private presentSettlement(settlement: MoveoutSettlementEstimate): MoveoutSettlementEstimate {
    return {
      ...settlement,
      deductions: this.store.moveoutDeductions
        .filter((deduction) => deduction.summaryId === settlement.summaryId)
        .map((deduction) => ({ ...deduction }))
    };
  }

  private presentDispute(dispute: MoveoutDispute): MoveoutDispute {
    return {
      ...dispute,
      attachmentUrls: [...(dispute.attachmentUrls ?? [])],
      history: dispute.history.map((event) => ({ ...event }))
    };
  }

  private presentManagerRow(moveout: MoveoutSummary): MoveoutManagerRow {
    const tenant = this.findUser(moveout.tenantId);
    const disputes = this.store.moveoutDisputes.filter((dispute) => dispute.summaryId === moveout.id);
    const contractConfirmed = this.isContractConfirmed(moveout);
    const leaseEndDate = contractConfirmed ? moveout.leaseEndDate : undefined;
    const daysRemaining = contractConfirmed && leaseEndDate ? this.daysRemaining(leaseEndDate) : undefined;

    return {
      summaryId: moveout.id,
      unitId: moveout.unitId,
      tenantName: tenant.name,
      contractConfirmed,
      leaseEndDate,
      daysRemaining,
      settlementStatus: moveout.settlementStatus,
      openDisputeCount: disputes.filter((dispute) => OPEN_DISPUTE_STATUSES.includes(dispute.status)).length,
      slaBreached: disputes.some((dispute) => dispute.slaBreached),
      expiringSoon: daysRemaining !== undefined && daysRemaining <= 30
    };
  }

  private reviewGateFor(moveout: MoveoutSummary): MoveoutReviewCompletionGate {
    const blockingReasons: MoveoutReviewGateBlockReason[] = [];
    const disputes = this.store.moveoutDisputes.filter((dispute) => dispute.summaryId === moveout.id);
    const openDisputes = disputes.filter((dispute) => OPEN_DISPUTE_STATUSES.includes(dispute.status));
    const deductions = this.store.moveoutDeductions.filter((deduction) => deduction.summaryId === moveout.id);
    const hasTenantDamageRisk = this.recordsFor(moveout.id).some(
      (record) => record.wearVerdict === "damage_possible"
    ) || deductions.some((deduction) => deduction.kind === "restoration");

    if (!this.isContractConfirmed(moveout)) {
      blockingReasons.push("contract_unconfirmed");
    }

    if (openDisputes.length > 0) {
      blockingReasons.push("unresolved_dispute");
    }

    if (deductions.some((deduction) => deduction.needsConfirmation)) {
      blockingReasons.push("needs_confirmation");
    }

    if (hasTenantDamageRisk && !this.moveinEvidenceAvailable(moveout)) {
      blockingReasons.push("no_movein_evidence");
    }

    const uniqueReasons = Array.from(new Set(blockingReasons));
    const slaBreached = openDisputes.some((dispute) => dispute.slaBreached);
    const overrideAvailable =
      slaBreached && uniqueReasons.length === 1 && uniqueReasons[0] === "unresolved_dispute";

    return {
      canComplete: uniqueReasons.length === 0,
      blockingReasons: uniqueReasons,
      slaBreached,
      overrideAvailable,
      message: uniqueReasons.length
        ? this.reviewGateMessage(uniqueReasons, overrideAvailable)
        : "퇴실 기록과 예상 정산 근거를 확인하면 검토 완료로 전환할 수 있습니다."
    };
  }

  private reviewGateMessage(reasons: MoveoutReviewGateBlockReason[], overrideAvailable: boolean) {
    if (reasons.includes("contract_unconfirmed")) {
      return "계약 확정 전에는 퇴실 정산 검토를 완료할 수 없습니다.";
    }

    if (overrideAvailable) {
      return "미해소 이의가 남아 있지만 SLA가 경과해 사유를 남기고 알림과 함께 진행할 수 있습니다.";
    }

    return "미해소 이의, 확인 필요 항목, 또는 입주 전 비교 근거를 먼저 해소해야 합니다.";
  }

  private moveinEvidenceAvailable(moveout: MoveoutSummary) {
    return this.store.moveoutRecords.some(
      (record) =>
        record.summaryId === moveout.id &&
        record.source === "movein_photo" &&
        record.moveinComparisonAvailable
    );
  }

  private isContractConfirmed(moveout: MoveoutSummary) {
    const contract = moveout.contractId
      ? this.store.contracts.find((item) => item.id === moveout.contractId)
      : this.store.contracts.find(
          (item) => item.roomId === moveout.roomId && item.tenantId === moveout.tenantId
        );

    return Boolean(
      contract &&
        contract.roomId === moveout.roomId &&
        (!contract.tenantId || contract.tenantId === moveout.tenantId) &&
        contract.review === "confirmed"
    );
  }

  private assertMoveoutScope(moveout: MoveoutSummary) {
    const linkedRoomId = this.store.tenantRooms[moveout.tenantId];

    if (linkedRoomId && linkedRoomId !== moveout.roomId) {
      throw new ForbiddenException("임차인-호실 스코프가 일치하는 퇴실 요청만 접근할 수 있습니다.");
    }

    if (!moveout.contractId) {
      return;
    }

    const contract = this.store.contracts.find((item) => item.id === moveout.contractId);

    if (!contract) {
      throw new NotFoundException("퇴실 요청에 연결된 계약을 찾을 수 없습니다.");
    }

    if (contract.roomId !== moveout.roomId || (contract.tenantId && contract.tenantId !== moveout.tenantId)) {
      throw new ForbiddenException("퇴실 요청의 계약 스코프가 호실 또는 임차인과 일치하지 않습니다.");
    }
  }

  private managerIdFor(moveout: MoveoutSummary) {
    const room = this.findRoom(moveout.roomId);
    const managerId = room.landlordId;

    if (!managerId) {
      throw new NotFoundException("퇴실 문의를 받을 관리인을 찾을 수 없습니다.");
    }

    this.assertManagerCanAccessRoom(managerId, room.id);

    return managerId;
  }

  private ensureMoveoutThread(
    moveout: MoveoutSummary,
    managerId: string,
    sender: "tenant" | "manager",
    body: string,
    attachmentUrls: string[] = []
  ) {
    const existingThread = moveout.messagingThreadId
      ? this.store.messagingThreads.find((thread) => thread.id === moveout.messagingThreadId)
      : this.store.messagingThreads.find(
          (thread) => thread.context === "moveout" && thread.contextRef === moveout.id
        );

    if (existingThread) {
      moveout.messagingThreadId = existingThread.id;
      return sender === "tenant"
        ? this.addTenantMessagingThreadMessage(moveout.tenantId, existingThread.id, {
            body,
            attachmentUrls
          })
        : this.addManagerMessagingThreadMessage(managerId, existingThread.id, {
            body,
            attachmentUrls
          });
    }

    const thread = this.createMessagingThread(managerId, {
      roomId: moveout.roomId,
      tenantId: moveout.tenantId,
      context: "moveout",
      contextRef: moveout.id,
      contextLabel: `${moveout.unitId}호 퇴실 문의`,
      initialMessage: {
        sender,
        body,
        kind: "text",
        attachmentUrls
      }
    });
    moveout.messagingThreadId = thread.id;

    return thread;
  }

  private recalculateSettlementRange(moveout: MoveoutSummary) {
    const settlement = this.findSettlement(moveout);
    const deductions = this.store.moveoutDeductions.filter((deduction) => deduction.summaryId === moveout.id);
    const minDeduction = deductions.reduce((sum, deduction) => sum + deduction.estimatedMin, 0);
    const maxDeduction = deductions.reduce((sum, deduction) => sum + deduction.estimatedMax, 0);
    const depositAmount = settlement.depositAmount;

    settlement.refundMin = depositAmount - maxDeduction;
    settlement.refundMax = depositAmount - minDeduction;
    settlement.updatedAt = now();
    moveout.estimatedRefundMin = settlement.refundMin;
    moveout.estimatedRefundMax = settlement.refundMax;
  }

  private daysRemaining(leaseEndDate: string) {
    const diff = this.timeOf(leaseEndDate) - Date.now();

    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  }

  private addHoursIso(startIso: string, hours: number) {
    return new Date(this.timeOf(startIso) + hours * 60 * 60 * 1000).toISOString();
  }

  private checklistProgress(items: MoveoutChecklistItem[]) {
    if (items.length === 0) {
      return 0;
    }

    const readyCount = items.filter((item) => item.present && item.condition !== "damage_check").length;
    return Number((readyCount / items.length).toFixed(2));
  }

  private nonEmptyStrings(values?: string[]) {
    return Array.from(
      new Set((Array.isArray(values) ? values : []).map((value) => value.trim()).filter(Boolean))
    );
  }

  private tenantDisputeActionMessage(
    targetLabel: string,
    action: UpdateTenantMoveoutDisputeInput["action"],
    note?: string
  ) {
    const label =
      action === "confirm" ? "응답 확인" : action === "resolve" ? "해소 처리" : "재이의";

    return `퇴실 이의 ${label}: ${targetLabel}${note ? `\n내용: ${note}` : ""}`;
  }

  private findUser(userId: string) {
    const user = this.store.users.find((item) => item.id === userId);

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    return user;
  }
}
