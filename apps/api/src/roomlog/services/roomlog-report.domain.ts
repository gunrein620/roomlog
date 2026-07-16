import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { id, now } from "../roomlog-support";
import type {
  CreateAnnouncementDraftInput,
  CreateManagerReportExternalShareInput,
  CreateManagerReportFollowUpInput,
  CreateManagerReportInput,
  CreateMessagingThreadInput,
  Cost,
  ManagerReport,
  ManagerReportAuditLogEntry,
  ManagerReportChatAnswer,
  ManagerReportExternalShare,
  ManagerReportFollowUpResult,
  ManagerReportKpi,
  ManagerReportLinkedFollowUp,
  ManagerReportScope,
  ManagerReportSection,
  ManagerReportSource,
  ManagerReportSourceKind,
  ManagerReportSourceReference,
  MessagingAnnouncementDraft,
  MessagingThread,
  Room,
  UserAccount
} from "../roomlog.types";
import type { Store } from "../roomlog.service";

type CreateAnnouncementDraft = (
  managerId: string,
  input: CreateAnnouncementDraftInput
) => MessagingAnnouncementDraft;
type CreateMessagingThread = (
  managerId: string,
  input: CreateMessagingThreadInput
) => MessagingThread;

export class RoomlogReportDomain {
  constructor(
    private readonly store: Store,
    private readonly persistStore: () => void,
    private readonly findRoom: (roomId: string) => Room,
    private readonly assertManagerCanAccessRoom: (managerId: string, roomId: string) => void,
    private readonly displayUnitId: (room: Room) => string,
    private readonly timeOf: (iso?: string) => number,
    private readonly createAnnouncementDraft: CreateAnnouncementDraft,
    private readonly createMessagingThread: CreateMessagingThread
  ) {}

  listManagerReports(managerId: string): ManagerReport[] {
    return this.store.managerReports
      .filter((report) => report.managerId === managerId)
      .sort((a, b) => this.timeOf(b.snapshotAt) - this.timeOf(a.snapshotAt))
      .map((report) => this.presentReport(report, false));
  }

  createManagerReport(
    managerId: string,
    input: CreateManagerReportInput,
    managerCosts: readonly Cost[] = this.store.costs
  ): ManagerReport {
    this.assertReportInput(input);
    const rooms = this.resolveScopeRooms(managerId, input.scope);
    const roomIds = new Set(rooms.map((room) => room.id));
    const unitIds = rooms.map((room) => this.displayUnitId(room));
    const snapshotAt = now();
    const reportId = id("rpt");
    const periodStart = new Date(input.periodStart).toISOString();
    const periodEnd = new Date(input.periodEnd).toISOString();
    const context = {
      managerId,
      reportId,
      snapshotAt,
      periodStart,
      periodEnd,
      rooms,
      roomIds,
      unitIds,
      managerCosts
    };
    const { sections, references } = this.buildSnapshotSections(context);
    const createdAt = snapshotAt;
    const report: ManagerReport = {
      id: reportId,
      managerId,
      period: input.period,
      periodLabel: input.periodLabel.trim(),
      periodStart,
      periodEnd,
      scope: {
        buildingId: input.scope.buildingId.trim(),
        buildingName: input.scope.buildingName.trim(),
        roomIds: rooms.map((room) => room.id),
        unitIds
      },
      status: "draft",
      snapshotAt,
      recipient: input.recipient,
      disclaimer: "AI 정리 스냅샷입니다. 모든 수치와 항목은 생성 시점 원천 데이터 기준이며 후속 발송은 원본 채널에서 재확인합니다.",
      summary: `${input.periodLabel.trim()} ${input.scope.buildingName.trim()} 운영 리포트입니다. 하자 ${this.complaintsFor(roomIds, periodStart, periodEnd).length}건, 비용 ${this.costsFor(managerCosts, managerId, unitIds, periodStart, periodEnd).length}건을 스냅샷으로 기록했습니다.`,
      nextActions: [
        {
          label: "생활 공지 초안 만들기",
          actionType: "notice",
          targetScreenId: "M-MSG-00",
          payload: {
            unitIds,
            periodLabel: input.periodLabel.trim(),
            note: "리포트 후속 공지는 M-MSG 초안으로만 연결됩니다."
          }
        },
        {
          label: "납부 독촉 초안 검토",
          actionType: "dunning",
          targetScreenId: "M-BILL-05",
          payload: {
            unitIds,
            periodLabel: input.periodLabel.trim(),
            note: "1:1 채팅 발송이 아니라 납부 채널의 원본 대조 후 처리합니다."
          }
        }
      ],
      sections,
      linkedFollowUps: [],
      createdAt,
      updatedAt: createdAt
    };

    this.assertSourceCoverage(report, references);
    this.store.managerReports.unshift(report);
    this.store.managerReportSourceReferences.unshift(...references);
    this.persistStore();

    return this.presentReport(report, true);
  }

  getManagerReport(managerId: string, reportId: string): ManagerReport {
    return this.presentReport(this.findManagerReport(managerId, reportId), true);
  }

  listManagerReportSourceReferences(
    managerId: string,
    reportId: string
  ): ManagerReportSourceReference[] {
    this.findManagerReport(managerId, reportId);

    return this.sourceReferencesFor(reportId);
  }

  askManagerReportChat(
    managerId: string,
    reportId: string,
    input: { question: string }
  ): ManagerReportChatAnswer {
    const report = this.findManagerReport(managerId, reportId);
    const question = input.question?.trim();

    if (!question) {
      throw new BadRequestException("리포트 질의를 입력해주세요.");
    }

    const isDunning = /(독촉|미납|연체|납부|청구)/.test(question);
    const source = report.sections[0]?.source ?? this.source("metric", "리포트 스냅샷", "M-RPT-02", "저장된 리포트 스냅샷");

    return {
      id: id("rch"),
      interpretedQuery: question,
      basis: isDunning ? "realtime_billing" : "stored_analysis",
      answer: isDunning
        ? "납부 관련 실행은 여기서 직접 처리하지 않습니다. 납부 채널에서 원본 행을 다시 대조할 수 있도록 초안만 제안합니다."
        : "저장된 리포트 스냅샷 기준으로 요약 초안을 제안합니다. 실제 공지는 M-MSG에서 검토 후 처리합니다.",
      sources: [source],
      draft: {
        type: isDunning ? "dunning" : "notice",
        targetScreenId: isDunning ? "M-BILL-05" : "M-MSG-00",
        payload: {
          unitIds: report.scope.unitIds,
          periodLabel: report.periodLabel,
          note: question
        }
      },
      execution: "draft_only",
      createdAt: now()
    };
  }

  createManagerReportExternalShare(
    managerId: string,
    reportId: string,
    input: CreateManagerReportExternalShareInput
  ): ManagerReportExternalShare {
    this.findManagerReport(managerId, reportId);
    const recipientName = input.recipientName?.trim();

    if (!recipientName) {
      throw new BadRequestException("외부 공유 수신자 이름이 필요합니다.");
    }

    const createdAt = now();
    const share: ManagerReportExternalShare = {
      id: id("rpsh"),
      reportId,
      token: id("rpsh_token"),
      recipientName,
      masked: true,
      status: "active",
      createdByManagerId: managerId,
      createdAt
    };

    this.store.managerReportExternalShares.unshift(share);
    this.appendAudit({
      reportId,
      shareId: share.id,
      action: "external_share_created",
      actorId: managerId,
      actorLabel: this.findUser(managerId).name,
      at: createdAt,
      detail: `외부 공유 링크 생성: ${recipientName}`
    });
    this.persistStore();

    return { ...share };
  }

  getExternalReportShare(token: string) {
    const share = this.store.managerReportExternalShares.find((item) => item.token === token);

    if (!share || share.status !== "active") {
      throw new NotFoundException("외부 공유 리포트를 찾을 수 없습니다.");
    }

    const report = this.findReport(share.reportId);
    this.appendAudit({
      reportId: report.id,
      shareId: share.id,
      action: "external_share_viewed",
      actorLabel: "external",
      at: now(),
      detail: `외부 공유 조회: ${share.recipientName}`
    });
    this.persistStore();

    return {
      report: this.maskReportForExternal(this.presentReport(report, true)),
      delivery: {
        reportId: report.id,
        format: "link" as const,
        masked: true,
        recipient: {
          id: share.id,
          name: this.maskText(share.recipientName),
          role: "landlord" as const,
          delivery: "external" as const
        },
        auditLog: this.auditFor(report.id).map((entry) => ({
          action: entry.action,
          actor: entry.actorLabel,
          at: entry.at,
          detail: this.maskText(entry.detail)
        }))
      }
    };
  }

  revokeManagerReportExternalShare(
    managerId: string,
    reportId: string,
    shareId: string
  ): ManagerReportExternalShare {
    this.findManagerReport(managerId, reportId);
    const share = this.store.managerReportExternalShares.find(
      (item) => item.id === shareId && item.reportId === reportId
    );

    if (!share) {
      throw new NotFoundException("외부 공유 링크를 찾을 수 없습니다.");
    }

    if (share.status !== "revoked") {
      const revokedAt = now();
      share.status = "revoked";
      share.revokedAt = revokedAt;
      this.appendAudit({
        reportId,
        shareId: share.id,
        action: "external_share_revoked",
        actorId: managerId,
        actorLabel: this.findUser(managerId).name,
        at: revokedAt,
        detail: `외부 공유 링크 폐기: ${share.recipientName}`
      });
      this.persistStore();
    }

    return { ...share };
  }

  listManagerReportAuditLog(managerId: string, reportId: string): ManagerReportAuditLogEntry[] {
    this.findManagerReport(managerId, reportId);

    return this.auditFor(reportId);
  }

  createManagerReportFollowUp(
    managerId: string,
    reportId: string,
    input: CreateManagerReportFollowUpInput
  ): ManagerReportFollowUpResult {
    const report = this.findManagerReport(managerId, reportId);
    const body = input.body?.trim();

    if (!body) {
      throw new BadRequestException("후속 조치 본문이 필요합니다.");
    }

    if (input.channel === "announcement") {
      const title = input.title?.trim();

      if (!title) {
        throw new BadRequestException("공지 초안 제목이 필요합니다.");
      }

      const targetRoomIds = this.followUpTargetRoomIds(report, input.targetRoomIds);
      const draft = this.createAnnouncementDraft(managerId, {
        category: /(긴급|urgent|단수|화재|누수)/i.test(`${title} ${body}`) ? "urgent" : "life",
        scope: targetRoomIds.length === 1 ? "unit" : "building",
        targetLabel: this.followUpTargetLabel(targetRoomIds),
        targetRoomIds,
        title,
        body,
        translations: input.translations ?? [],
        confirmRequired: input.confirmRequired
      });
      const linked = this.linkFollowUp(report, {
        channel: "announcement",
        actionType: input.actionType,
        announcementDraftId: draft.id
      });
      this.persistStore();

      return {
        kind: "announcement_draft",
        reportId: report.id,
        followUpId: linked.id,
        announcementDraftId: draft.id
      };
    }

    if (!input.roomId || !input.tenantId) {
      throw new BadRequestException("1:1 스레드 후속 조치는 호실과 임차인이 필요합니다.");
    }

    this.assertReportIncludesRoom(report, input.roomId);
    const thread = this.createMessagingThread(managerId, {
      roomId: input.roomId,
      tenantId: input.tenantId,
      context: input.actionType === "dunning" ? "payment" : "general",
      contextRef: report.id,
      contextLabel: `${report.periodLabel} 리포트 후속 조치`,
      initialMessage: {
        sender: "manager",
        body,
        kind: "text"
      }
    });
    const linked = this.linkFollowUp(report, {
      channel: "thread",
      actionType: input.actionType,
      threadId: thread.id
    });
    this.persistStore();

    return {
      kind: "thread",
      reportId: report.id,
      followUpId: linked.id,
      threadId: thread.id
    };
  }

  private assertReportInput(input: CreateManagerReportInput) {
    if (!["week", "month", "quarter"].includes(input.period)) {
      throw new BadRequestException("지원하지 않는 리포트 기간입니다.");
    }

    if (!input.periodLabel?.trim()) {
      throw new BadRequestException("리포트 기간 라벨이 필요합니다.");
    }

    if (!input.scope?.buildingId?.trim() || !input.scope?.buildingName?.trim()) {
      throw new BadRequestException("리포트 건물 스코프가 필요합니다.");
    }

    if (!Number.isFinite(this.timeOf(input.periodStart)) || !Number.isFinite(this.timeOf(input.periodEnd))) {
      throw new BadRequestException("리포트 기간 기준일이 올바르지 않습니다.");
    }

    if (this.timeOf(input.periodStart) > this.timeOf(input.periodEnd)) {
      throw new BadRequestException("리포트 기간 시작일은 종료일보다 늦을 수 없습니다.");
    }
  }

  private resolveScopeRooms(managerId: string, scope: ManagerReportScope) {
    const roomIds = scope.roomIds ?? [];
    const unitIds = scope.unitIds ?? [];

    if (roomIds.length > 0) {
      return roomIds.map((roomId) => {
        this.assertManagerCanAccessRoom(managerId, roomId);
        return this.findRoom(roomId);
      });
    }

    const managedRooms = this.store.rooms.filter((room) => room.landlordId === managerId);
    const matchingRooms = managedRooms.filter((room) => {
      const matchesBuilding = room.buildingName === scope.buildingName || scope.buildingId === room.id;
      const matchesUnit = unitIds.length === 0 || unitIds.includes(this.displayUnitId(room));

      return matchesBuilding && matchesUnit;
    });

    if (matchingRooms.length === 0) {
      throw new ForbiddenException("담당 건물/호실 범위 리포트만 생성할 수 있습니다.");
    }

    return matchingRooms;
  }

  private buildSnapshotSections(context: {
    managerId: string;
    reportId: string;
    snapshotAt: string;
    periodStart: string;
    periodEnd: string;
    rooms: Room[];
    roomIds: Set<string>;
    unitIds: string[];
    managerCosts: readonly Cost[];
  }) {
    const complaints = this.complaintsFor(context.roomIds, context.periodStart, context.periodEnd);
    const costs = this.costsFor(
      context.managerCosts,
      context.managerId,
      context.unitIds,
      context.periodStart,
      context.periodEnd
    );
    const contracts = this.contractsFor(context.roomIds);
    const moveouts = this.store.moveouts.filter((moveout) => context.roomIds.has(moveout.roomId));
    const threads = this.store.messagingThreads.filter((thread) => context.roomIds.has(thread.roomId));
    const costTotal = costs.reduce((sum, cost) => sum + cost.amount, 0);
    const sections: ManagerReportSection[] = [
      {
        key: "complaints",
        title: "민원·하자 처리",
        summary: `${complaints.length}건의 민원/하자 원천 행을 기준으로 처리 현황을 정리했습니다.`,
        source: this.source("complaint", "M-DASH 민원 원장", "M-DASH-00", "기간 내 담당 호실 민원·티켓 행"),
        kpis: [this.kpi("민원", `${complaints.length}건`, "complaint")]
      },
      {
        key: "costs",
        title: "비용·수리비",
        summary: `확정 비용 ${costs.length}건, ${costTotal.toLocaleString("ko-KR")}원을 스냅샷으로 기록했습니다.`,
        source: this.source("cost", "M-COST 비용 원장", "M-COST-03", "기간 내 확정 비용 행"),
        kpis: [this.kpi("비용 합계", `${costTotal.toLocaleString("ko-KR")}원`, "cost")]
      },
      {
        key: "contracts",
        title: "계약 원장",
        summary: `담당 범위 계약 ${contracts.length}건을 기준으로 계약 상태를 정리했습니다.`,
        source: this.source("contract", "M-DOC 계약 원장", "M-DOC-01", "담당 호실 계약 행"),
        kpis: [this.kpi("계약", `${contracts.length}건`, "contract")]
      },
      {
        key: "moveouts",
        title: "퇴실·정산",
        summary: `퇴실 준비 ${moveouts.length}건을 별도 정산 확정 없이 스냅샷으로 정리했습니다.`,
        source: this.source("moveout", "M-OUT 퇴실 원장", "M-OUT-01", "담당 호실 퇴실 행"),
        kpis: [this.kpi("퇴실", `${moveouts.length}건`, "moveout")]
      },
      {
        key: "messaging",
        title: "공지·스레드",
        summary: `메시징 스레드 ${threads.length}건을 공지와 1:1 채팅 분리 원칙에 맞춰 정리했습니다.`,
        source: this.source("messaging", "M-MSG 메시징 원장", "M-MSG-00", "담당 호실 메시징 행"),
        kpis: [this.kpi("스레드", `${threads.length}건`, "messaging")]
      }
    ];
    const references = [
      ...this.referencesFor(context, "complaints", "complaint", complaints),
      ...this.referencesFor(context, "costs", "cost", costs),
      ...this.referencesFor(context, "contracts", "contract", contracts),
      ...this.referencesFor(context, "moveouts", "moveout", moveouts),
      ...this.referencesFor(context, "messaging", "messaging", threads)
    ];

    return { sections, references };
  }

  private complaintsFor(roomIds: Set<string>, periodStart: string, periodEnd: string) {
    return this.store.complaints.filter(
      (complaint) =>
        roomIds.has(complaint.roomId) &&
        this.timeOf(complaint.createdAt) >= this.timeOf(periodStart) &&
        this.timeOf(complaint.createdAt) <= this.timeOf(periodEnd)
    );
  }

  private costsFor(
    costs: readonly Cost[],
    managerId: string,
    unitIds: string[],
    periodStart: string,
    periodEnd: string
  ) {
    const unitSet = new Set(unitIds);

    return costs.filter(
      (cost) =>
        (cost.managerId === managerId || (cost.unitId ? unitSet.has(cost.unitId) : false)) &&
        this.timeOf(cost.date) >= this.timeOf(periodStart) &&
        this.timeOf(cost.date) <= this.timeOf(periodEnd)
    );
  }

  private contractsFor(roomIds: Set<string>) {
    return this.store.contracts.filter((contract) => roomIds.has(contract.roomId));
  }

  private referencesFor(
    context: {
      reportId: string;
      snapshotAt: string;
      rooms: Room[];
    },
    sectionKey: string,
    sourceKind: ManagerReportSourceKind,
    rows: Array<{ id: string; roomId?: string; tenantId?: string; [key: string]: unknown }>
  ): ManagerReportSourceReference[] {
    if (rows.length === 0) {
      return [
        this.reference(context, sectionKey, sourceKind, {
          entityType: "room_scope",
          entityId: context.rooms.map((room) => room.id).join(",") || context.reportId,
          label: `${context.rooms.map((room) => room.roomNo).join(", ")} 스코프`,
          roomId: context.rooms[0]?.id,
          basis: "원천 행이 없는 상태도 담당 호실 스코프를 기준으로 기록합니다."
        })
      ];
    }

    return rows.map((row) => {
      const roomId = typeof row.roomId === "string" ? row.roomId : undefined;
      const tenantId = typeof row.tenantId === "string" ? row.tenantId : undefined;
      const tenant = tenantId ? this.store.users.find((user) => user.id === tenantId) : undefined;

      return this.reference(context, sectionKey, sourceKind, {
        entityType: this.entityTypeFor(sourceKind),
        entityId: row.id,
        roomId,
        tenantId,
        label: this.referenceLabel(sourceKind, row, tenant),
        basis: `${this.entityTypeFor(sourceKind)}:${row.id}`
      });
    });
  }

  private reference(
    context: { reportId: string; snapshotAt: string },
    sectionKey: string,
    sourceKind: ManagerReportSourceKind,
    input: {
      entityType: string;
      entityId: string;
      roomId?: string;
      tenantId?: string;
      label: string;
      basis: string;
    }
  ): ManagerReportSourceReference {
    return {
      id: id("rpsrc"),
      reportId: context.reportId,
      sectionKey,
      sourceKind,
      entityType: input.entityType,
      entityId: input.entityId,
      roomId: input.roomId,
      tenantId: input.tenantId,
      label: input.label,
      drilldownScreenId: this.drilldownFor(sourceKind),
      basis: input.basis,
      snapshotAt: context.snapshotAt,
      createdAt: context.snapshotAt
    };
  }

  private referenceLabel(
    sourceKind: ManagerReportSourceKind,
    row: { [key: string]: unknown },
    tenant?: UserAccount
  ) {
    if (sourceKind === "complaint") {
      return [
        tenant?.name,
        tenant?.phone,
        row.title,
        row.description
      ]
        .filter(Boolean)
        .join(" · ");
    }

    if (sourceKind === "cost") {
      return [row.item, row.amount ? `${row.amount}원` : undefined, row.paymentRef]
        .filter(Boolean)
        .join(" · ");
    }

    if (sourceKind === "contract") {
      return [row.unitId, row.landlordName, row.paymentDay ? `납부일 ${row.paymentDay}` : undefined]
        .filter(Boolean)
        .join(" · ");
    }

    return [row.id, row.unitId, row.contextLabel].filter(Boolean).join(" · ");
  }

  private assertSourceCoverage(report: ManagerReport, references: ManagerReportSourceReference[]) {
    for (const section of report.sections) {
      if (!section.source) {
        throw new BadRequestException("리포트 섹션은 출처 없이 생성할 수 없습니다.");
      }

      const hasReference = references.some(
        (reference) =>
          reference.sectionKey === section.key && reference.sourceKind === section.source.kind
      );

      if (!hasReference) {
        throw new BadRequestException("리포트 집계 항목은 원천 참조 없이 생성할 수 없습니다.");
      }
    }
  }

  private source(
    kind: ManagerReportSourceKind,
    label: string,
    drilldownScreenId: string,
    basis: string
  ): ManagerReportSource {
    return { kind, label, drilldownScreenId, basis };
  }

  private kpi(label: string, value: string, formulaSource: ManagerReportSourceKind): ManagerReportKpi {
    return { label, value, formulaSource };
  }

  private entityTypeFor(sourceKind: ManagerReportSourceKind) {
    const map: Record<ManagerReportSourceKind, string> = {
      billing: "billing_row",
      complaint: "complaint",
      cost: "cost",
      unit: "room",
      metric: "metric",
      contract: "contract",
      moveout: "moveout",
      messaging: "messaging_thread"
    };

    return map[sourceKind];
  }

  private drilldownFor(sourceKind: ManagerReportSourceKind) {
    const map: Record<ManagerReportSourceKind, string> = {
      billing: "M-BILL-04",
      complaint: "M-DASH-00",
      cost: "M-COST-03",
      unit: "M-HOME-02",
      metric: "M-HOME-02",
      contract: "M-DOC-01",
      moveout: "M-OUT-01",
      messaging: "M-MSG-00"
    };

    return map[sourceKind];
  }

  private findManagerReport(managerId: string, reportId: string) {
    const report = this.store.managerReports.find((item) => item.id === reportId);

    if (!report || report.managerId !== managerId) {
      throw new NotFoundException("조회 가능한 리포트를 찾을 수 없습니다.");
    }

    for (const roomId of report.scope.roomIds ?? []) {
      this.assertManagerCanAccessRoom(managerId, roomId);
    }

    return report;
  }

  private findReport(reportId: string) {
    const report = this.store.managerReports.find((item) => item.id === reportId);

    if (!report) {
      throw new NotFoundException("리포트를 찾을 수 없습니다.");
    }

    return report;
  }

  private sourceReferencesFor(reportId: string) {
    return this.store.managerReportSourceReferences
      .filter((reference) => reference.reportId === reportId)
      .map((reference) => ({ ...reference }))
      .sort((a, b) => a.sectionKey.localeCompare(b.sectionKey, "ko-KR"));
  }

  private presentReport(report: ManagerReport, includeSources: boolean): ManagerReport {
    return {
      ...report,
      scope: {
        ...report.scope,
        roomIds: [...(report.scope.roomIds ?? [])],
        unitIds: [...(report.scope.unitIds ?? [])]
      },
      recipient: report.recipient ? { ...report.recipient } : undefined,
      nextActions: report.nextActions.map((action) => ({
        ...action,
        payload: {
          ...action.payload,
          unitIds: action.payload.unitIds ? [...action.payload.unitIds] : undefined,
          billIds: action.payload.billIds ? [...action.payload.billIds] : undefined
        }
      })),
      sections: report.sections.map((section) => ({
        ...section,
        source: { ...section.source },
        kpis: section.kpis?.map((kpi) => ({ ...kpi }))
      })),
      linkedFollowUps: report.linkedFollowUps.map((followUp) => ({ ...followUp })),
      sourceReferences: includeSources ? this.sourceReferencesFor(report.id) : undefined
    };
  }

  private maskReportForExternal(report: ManagerReport): ManagerReport {
    return {
      ...report,
      summary: this.maskText(report.summary),
      disclaimer: this.maskText(report.disclaimer),
      recipient: report.recipient
        ? { ...report.recipient, name: this.maskText(report.recipient.name) }
        : undefined,
      sections: report.sections.map((section) => ({
        ...section,
        summary: this.maskText(section.summary),
        source: {
          ...section.source,
          label: this.maskText(section.source.label),
          basis: this.maskText(section.source.basis)
        }
      })),
      sourceReferences: report.sourceReferences?.map((reference) => ({
        ...reference,
        tenantId: undefined,
        label: this.maskText(reference.label),
        basis: this.maskText(reference.basis)
      }))
    };
  }

  private maskText(value?: string) {
    if (!value) {
      return value ?? "";
    }

    return value
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일 마스킹]")
      .replace(/01[016789]-?\d{3,4}-?\d{4}/g, "010-****-****")
      .replace(/민감메모[:：]?\s*[^"'}\]]*/g, "[메모 마스킹]")
      .replace(/김민수|이민지/g, (name) => `${name.slice(0, 1)}**`);
  }

  private appendAudit(input: Omit<ManagerReportAuditLogEntry, "id">) {
    this.store.managerReportAuditLogs.unshift({
      id: id("rpaud"),
      ...input
    });
  }

  private auditFor(reportId: string) {
    return this.store.managerReportAuditLogs
      .filter((entry) => entry.reportId === reportId)
      .map((entry) => ({ ...entry }))
      .sort((a, b) => this.timeOf(b.at) - this.timeOf(a.at));
  }

  private followUpTargetRoomIds(report: ManagerReport, requestedRoomIds?: string[]) {
    const reportRoomIds = report.scope.roomIds ?? [];
    const targetRoomIds = requestedRoomIds?.length ? requestedRoomIds : reportRoomIds;

    if (targetRoomIds.length === 0) {
      throw new BadRequestException("후속 공지 대상 호실이 필요합니다.");
    }

    for (const roomId of targetRoomIds) {
      this.assertReportIncludesRoom(report, roomId);
    }

    return targetRoomIds;
  }

  private followUpTargetLabel(roomIds: string[]) {
    return roomIds.map((roomId) => this.findRoom(roomId).roomNo).join(", ");
  }

  private assertReportIncludesRoom(report: ManagerReport, roomId: string) {
    if (!report.scope.roomIds?.includes(roomId)) {
      throw new ForbiddenException("리포트 스코프에 포함된 호실만 후속 조치를 만들 수 있습니다.");
    }
  }

  private linkFollowUp(
    report: ManagerReport,
    input: Omit<ManagerReportLinkedFollowUp, "id" | "createdAt">
  ) {
    const linked: ManagerReportLinkedFollowUp = {
      id: id("rpfu"),
      ...input,
      createdAt: now()
    };

    report.linkedFollowUps = [linked, ...report.linkedFollowUps];
    report.updatedAt = linked.createdAt;

    return linked;
  }

  private findUser(userId: string) {
    const user = this.store.users.find((item) => item.id === userId);

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    return user;
  }
}
