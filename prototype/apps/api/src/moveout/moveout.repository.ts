import { Injectable } from "@nestjs/common";
import type {
  AdjustDeductionDto,
  AdjustWearVerdictDto,
  Dispute,
  ManagerSettlementReview,
  MoveoutChecklistItem,
  MoveoutDashboardSummary,
  MoveoutManagerRow,
  MoveoutRecordItem,
  MoveoutSummary,
  ReportAuditEntry,
  RespondDisputeDto,
  ReviewCompletionGate,
  SettlementEstimate,
} from "@roomlog/types";

export interface CreateDisputeDto {
  targetItemId?: string;
  targetLabel: string;
  reason: string;
}

export abstract class MoveoutRepository {
  abstract listMoveouts(): MoveoutSummary[];
  abstract getMoveout(id: string): MoveoutSummary | undefined;
  abstract getRecords(summaryId: string): MoveoutRecordItem[];
  abstract getChecklist(summaryId: string): MoveoutChecklistItem[];
  abstract getSettlement(summaryId: string): SettlementEstimate | undefined;
  abstract getDisputes(summaryId: string): Dispute[];
  abstract createDispute(summaryId: string, dto: CreateDisputeDto): Dispute;
  abstract getDashboardSummary(): MoveoutDashboardSummary;
  abstract listManagerRows(): MoveoutManagerRow[];
  abstract getManagerSettlementReview(summaryId: string): ManagerSettlementReview | undefined;
  abstract adjustWearVerdict(summaryId: string, dto: AdjustWearVerdictDto): ReportAuditEntry | undefined;
  abstract getReportAudit(summaryId: string): ReportAuditEntry[];
  abstract adjustDeduction(summaryId: string, dto: AdjustDeductionDto): SettlementEstimate | undefined;
  abstract completeReview(summaryId: string): ManagerSettlementReview | undefined;
  abstract respondDispute(summaryId: string, dto: RespondDisputeDto): Dispute | undefined;
}

const DEMO_MOVEOUT: MoveoutSummary = {
  id: "mo_0001",
  unitId: "302",
  contractConfirmed: true,
  leaseEndDate: "2026-07-31T00:00:00+09:00",
  daysRemaining: 30,
  depositAmount: 10_000_000,
  estimatedRefundMin: 9_740_000,
  estimatedRefundMax: 9_850_000,
  settlementStatus: "estimate",
  prepProgress: 0.6,
  settlementId: "st_0001",
  createdAt: "2026-06-30T09:00:00+09:00",
  updatedAt: "2026-07-01T09:00:00+09:00",
};

const DEMO_MOVEOUT_EXPIRING: MoveoutSummary = {
  id: "mo_0002",
  unitId: "405",
  contractConfirmed: true,
  leaseEndDate: "2026-07-05T00:00:00+09:00",
  daysRemaining: 4,
  depositAmount: 8_000_000,
  estimatedRefundMin: 7_770_000,
  estimatedRefundMax: 7_920_000,
  settlementStatus: "reviewing",
  prepProgress: 0.82,
  settlementId: "st_0002",
  createdAt: "2026-06-28T09:00:00+09:00",
  updatedAt: "2026-07-01T15:00:00+09:00",
};

const DEMO_MOVEOUT_SLA_BREACHED: MoveoutSummary = {
  id: "mo_0003",
  unitId: "710",
  contractConfirmed: true,
  leaseEndDate: "2026-07-12T00:00:00+09:00",
  daysRemaining: 11,
  depositAmount: 12_000_000,
  estimatedRefundMin: 11_640_000,
  estimatedRefundMax: 11_790_000,
  settlementStatus: "reviewing",
  prepProgress: 0.74,
  settlementId: "st_0003",
  createdAt: "2026-06-25T09:00:00+09:00",
  updatedAt: "2026-07-01T12:00:00+09:00",
};

const DEMO_MOVEOUT_RECORDS: MoveoutRecordItem[] = [
  {
    id: "rec_0001",
    summaryId: "mo_0001",
    source: "movein_photo",
    title: "입주 전 사진 6장",
    description: "거실·주방·욕실 상태를 입주 시점에 기록해 두었어요.",
    occurredAt: "2025-08-01T10:00:00+09:00",
    moveinComparisonAvailable: true,
  },
  {
    id: "rec_0002",
    summaryId: "mo_0001",
    source: "contract",
    title: "계약서 · 원상복구/청소 조항",
    description: "퇴실 시 기본 청소비 부담, 자연 노후는 임차인 책임 아님.",
    occurredAt: "2025-07-20T14:00:00+09:00",
    moveinComparisonAvailable: false,
  },
  {
    id: "rec_0003",
    summaryId: "mo_0001",
    source: "defect",
    title: "에어컨 물샘 신고",
    description: "거실 에어컨 배수관 누수로 신고했고 수리가 진행됐어요.",
    occurredAt: "2026-06-29T20:00:00+09:00",
    moveinComparisonAvailable: false,
  },
  {
    id: "rec_0004",
    summaryId: "mo_0001",
    source: "repair",
    title: "에어컨 배수관 보수",
    description: "○○냉난방이 배수관 보수를 진행했어요(견적 8만원).",
    occurredAt: "2026-06-30T10:00:00+09:00",
    moveinComparisonAvailable: false,
  },
  {
    id: "rec_0005",
    summaryId: "mo_0001",
    source: "payment",
    title: "월세·관리비 납부 이력",
    description: "대부분 정상 납부. 이번 달 관리비 일부가 미납으로 남아 있어요.",
    occurredAt: "2026-06-25T09:00:00+09:00",
    moveinComparisonAvailable: false,
  },
  {
    id: "rec_0006",
    summaryId: "mo_0001",
    source: "movein_photo",
    title: "벽면 못자국 흔적",
    description: "거실 벽에 못자국이 보여요.",
    occurredAt: "2026-07-01T09:00:00+09:00",
    wearVerdict: "damage_possible",
    wearNote: "노후/마모일 수도 있어요. 확인이 필요한 항목이며, 이의·정정을 요청할 수 있어요.",
    moveinComparisonAvailable: true,
  },
];

const DEMO_MOVEOUT_EXPIRING_RECORDS: MoveoutRecordItem[] = [
  {
    id: "rec_1001",
    summaryId: "mo_0002",
    source: "movein_photo",
    title: "입주 전 주방 사진",
    description: "주방 상판과 싱크대 상태를 입주 시점에 기록했어요.",
    occurredAt: "2025-09-01T10:00:00+09:00",
    moveinComparisonAvailable: true,
  },
];

const DEMO_MOVEOUT_SLA_RECORDS: MoveoutRecordItem[] = [
  {
    id: "rec_2001",
    summaryId: "mo_0003",
    source: "movein_photo",
    title: "입주 전 현관 사진",
    description: "현관 바닥과 도어락 상태를 입주 시점에 기록했어요.",
    occurredAt: "2025-03-01T10:00:00+09:00",
    moveinComparisonAvailable: true,
  },
  {
    id: "rec_2002",
    summaryId: "mo_0003",
    source: "repair",
    title: "도어락 교체 견적",
    description: "도어락 오작동으로 교체 견적이 등록됐어요.",
    occurredAt: "2026-06-29T10:00:00+09:00",
    wearVerdict: "unclear",
    wearNote: "입주전 사진과 사용 이력을 함께 확인해야 해요.",
    moveinComparisonAvailable: true,
  },
];

const DEMO_MOVEOUT_CHECKLIST: MoveoutChecklistItem[] = [
  { id: "ck_0001", summaryId: "mo_0001", label: "에어컨", present: true, condition: "aging" },
  { id: "ck_0002", summaryId: "mo_0001", label: "냉장고", present: true, condition: "normal" },
  { id: "ck_0003", summaryId: "mo_0001", label: "세탁기", present: true, condition: "normal" },
  { id: "ck_0004", summaryId: "mo_0001", label: "벽지/도배", present: true, condition: "aging" },
  {
    id: "ck_0005",
    summaryId: "mo_0001",
    label: "싱크대",
    present: true,
    condition: "damage_check",
    note: "하부 마감 확인 필요",
  },
];

const DEMO_MOVEOUT_SETTLEMENT: SettlementEstimate = {
  id: "st_0001",
  summaryId: "mo_0001",
  depositAmount: 10_000_000,
  deductions: [
    {
      id: "de_0001",
      kind: "unpaid",
      label: "관리비 미납",
      estimatedMin: 50_000,
      estimatedMax: 50_000,
      needsConfirmation: false,
      evidenceNote: "납부 내역: 2026-06 관리비 미납분",
      source: "payment",
    },
    {
      id: "de_0002",
      kind: "repair",
      label: "에어컨 배수관 수리비 후보",
      estimatedMin: 0,
      estimatedMax: 80_000,
      needsConfirmation: true,
      evidenceNote: "하자·수리 이력: 배수관 보수 견적 8만원(책임 미확정)",
      source: "repair",
    },
    {
      id: "de_0003",
      kind: "restoration",
      label: "벽면 못자국 원상복구",
      estimatedMin: 0,
      estimatedMax: 30_000,
      needsConfirmation: true,
      evidenceNote: "입주전 사진 비교 근거 확인 필요(공백 시 차감 확정 아님)",
      source: "movein_photo",
    },
    {
      id: "de_0004",
      kind: "cleaning",
      label: "기본 청소비",
      estimatedMin: 100_000,
      estimatedMax: 100_000,
      needsConfirmation: false,
      evidenceNote: "계약서 청소 조항(정액)",
      source: "contract",
    },
  ],
  refundMin: 9_740_000,
  refundMax: 9_850_000,
  status: "estimate",
  disclaimer: "참고자료이며 최종 정산은 관리자 확인 후 확정됩니다.",
  createdAt: "2026-07-01T09:05:00+09:00",
};

const DEMO_MOVEOUT_EXPIRING_SETTLEMENT: SettlementEstimate = {
  id: "st_0002",
  summaryId: "mo_0002",
  depositAmount: 8_000_000,
  deductions: [
    {
      id: "de_1001",
      kind: "cleaning",
      label: "기본 청소비",
      estimatedMin: 80_000,
      estimatedMax: 80_000,
      needsConfirmation: false,
      evidenceNote: "계약서 청소 조항(정액)",
      source: "contract",
    },
    {
      id: "de_1002",
      kind: "restoration",
      label: "싱크대 상판 흠집 확인",
      estimatedMin: 0,
      estimatedMax: 150_000,
      needsConfirmation: true,
      evidenceNote: "입주전 주방 사진 비교 확인 필요",
      source: "movein_photo",
    },
  ],
  refundMin: 7_770_000,
  refundMax: 7_920_000,
  status: "reviewing",
  disclaimer: "참고자료이며 최종 정산은 관리자 확인 후 확정됩니다.",
  createdAt: "2026-07-01T15:00:00+09:00",
};

const DEMO_MOVEOUT_SLA_SETTLEMENT: SettlementEstimate = {
  id: "st_0003",
  summaryId: "mo_0003",
  depositAmount: 12_000_000,
  deductions: [
    {
      id: "de_2001",
      kind: "repair",
      label: "도어락 교체 비용 후보",
      estimatedMin: 0,
      estimatedMax: 210_000,
      needsConfirmation: true,
      evidenceNote: "수리 견적과 입주전 사진 비교 확인 필요",
      source: "repair",
    },
    {
      id: "de_2002",
      kind: "unpaid",
      label: "관리비 미납",
      estimatedMin: 150_000,
      estimatedMax: 150_000,
      needsConfirmation: false,
      evidenceNote: "납부 내역: 2026-06 관리비 미납분",
      source: "payment",
    },
  ],
  refundMin: 11_640_000,
  refundMax: 11_790_000,
  status: "reviewing",
  disclaimer: "참고자료이며 최종 정산은 관리자 확인 후 확정됩니다.",
  createdAt: "2026-07-01T12:00:00+09:00",
};

const DEMO_MOVEOUT_DISPUTES: Dispute[] = [
  {
    id: "dp_0001",
    summaryId: "mo_0001",
    targetItemId: "de_0002",
    targetLabel: "에어컨 배수관 수리비 후보",
    reason: "입주 시부터 있던 노후로 알고 있어요. 사용 중 발생한 훼손이 아닙니다.",
    status: "reviewing",
    slaDeadline: "2026-07-04T18:00:00+09:00",
    slaBreached: false,
    history: [
      { status: "received", at: "2026-07-01T09:10:00+09:00" },
      { status: "reviewing", at: "2026-07-01T11:00:00+09:00", note: "관리자 검토 시작" },
    ],
    createdAt: "2026-07-01T09:10:00+09:00",
    updatedAt: "2026-07-01T11:00:00+09:00",
  },
];

const DEMO_MOVEOUT_EXPIRING_DISPUTES: Dispute[] = [];

const DEMO_MOVEOUT_SLA_DISPUTES: Dispute[] = [
  {
    id: "dp_2001",
    summaryId: "mo_0003",
    targetItemId: "de_2001",
    targetLabel: "도어락 교체 비용 후보",
    reason: "입주 전부터 도어락 반응이 느렸고 사용 중 파손한 적이 없습니다.",
    status: "reviewing",
    slaDeadline: "2026-06-30T18:00:00+09:00",
    slaBreached: true,
    history: [
      { status: "received", at: "2026-06-27T10:00:00+09:00" },
      { status: "reviewing", at: "2026-06-27T13:00:00+09:00", note: "관리자 검토 시작" },
    ],
    createdAt: "2026-06-27T10:00:00+09:00",
    updatedAt: "2026-06-27T13:00:00+09:00",
  },
];

@Injectable()
export class InMemoryMoveoutRepository implements MoveoutRepository {
  private readonly moveouts = new Map<string, MoveoutSummary>();
  private readonly records = new Map<string, MoveoutRecordItem[]>();
  private readonly checklist = new Map<string, MoveoutChecklistItem[]>();
  private readonly settlements = new Map<string, SettlementEstimate>();
  private readonly disputes = new Map<string, Dispute[]>();
  private readonly reportAudit = new Map<string, ReportAuditEntry[]>();
  private readonly tenantNames = new Map<string, string>();

  constructor() {
    this.moveouts.set(DEMO_MOVEOUT.id, DEMO_MOVEOUT);
    this.moveouts.set(DEMO_MOVEOUT_EXPIRING.id, DEMO_MOVEOUT_EXPIRING);
    this.moveouts.set(DEMO_MOVEOUT_SLA_BREACHED.id, DEMO_MOVEOUT_SLA_BREACHED);
    this.records.set(DEMO_MOVEOUT.id, DEMO_MOVEOUT_RECORDS);
    this.records.set(DEMO_MOVEOUT_EXPIRING.id, DEMO_MOVEOUT_EXPIRING_RECORDS);
    this.records.set(DEMO_MOVEOUT_SLA_BREACHED.id, DEMO_MOVEOUT_SLA_RECORDS);
    this.checklist.set(DEMO_MOVEOUT.id, DEMO_MOVEOUT_CHECKLIST);
    this.settlements.set(DEMO_MOVEOUT.id, DEMO_MOVEOUT_SETTLEMENT);
    this.settlements.set(DEMO_MOVEOUT_EXPIRING.id, DEMO_MOVEOUT_EXPIRING_SETTLEMENT);
    this.settlements.set(DEMO_MOVEOUT_SLA_BREACHED.id, DEMO_MOVEOUT_SLA_SETTLEMENT);
    this.disputes.set(DEMO_MOVEOUT.id, DEMO_MOVEOUT_DISPUTES);
    this.disputes.set(DEMO_MOVEOUT_EXPIRING.id, DEMO_MOVEOUT_EXPIRING_DISPUTES);
    this.disputes.set(DEMO_MOVEOUT_SLA_BREACHED.id, DEMO_MOVEOUT_SLA_DISPUTES);
    this.tenantNames.set(DEMO_MOVEOUT.id, "김민서");
    this.tenantNames.set(DEMO_MOVEOUT_EXPIRING.id, "박지훈");
    this.tenantNames.set(DEMO_MOVEOUT_SLA_BREACHED.id, "이서연");
  }

  listMoveouts(): MoveoutSummary[] {
    return Array.from(this.moveouts.values());
  }

  getMoveout(id: string): MoveoutSummary | undefined {
    return this.moveouts.get(id);
  }

  getRecords(summaryId: string): MoveoutRecordItem[] {
    return this.records.get(summaryId) ?? [];
  }

  getChecklist(summaryId: string): MoveoutChecklistItem[] {
    return this.checklist.get(summaryId) ?? [];
  }

  getSettlement(summaryId: string): SettlementEstimate | undefined {
    return this.settlements.get(summaryId);
  }

  getDisputes(summaryId: string): Dispute[] {
    return this.disputes.get(summaryId) ?? [];
  }

  createDispute(summaryId: string, dto: CreateDisputeDto): Dispute {
    const now = new Date();
    const createdAt = now.toISOString();
    const slaDeadline = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
    const dispute: Dispute = {
      id: this.createDisputeId(),
      summaryId,
      targetItemId: dto.targetItemId,
      targetLabel: dto.targetLabel,
      reason: dto.reason,
      status: "received",
      slaDeadline,
      slaBreached: false,
      history: [{ status: "received", at: createdAt }],
      createdAt,
      updatedAt: createdAt,
    };

    const disputes = this.disputes.get(summaryId) ?? [];
    this.disputes.set(summaryId, [...disputes, dispute]);
    return dispute;
  }

  getDashboardSummary(): MoveoutDashboardSummary {
    const rows = this.listManagerRows();
    return {
      expiringSoon: rows.filter((row) => row.expiringSoon).length,
      disputesWaiting: rows.reduce((total, row) => total + row.openDisputeCount, 0),
      slaBreached: rows.filter((row) => row.slaBreached).length,
      reviewDone: rows.filter((row) => row.settlementStatus === "review_done").length,
    };
  }

  listManagerRows(): MoveoutManagerRow[] {
    return this.listMoveouts()
      .map((summary) => this.createManagerRow(summary))
      .sort((left, right) => this.getRowPriority(right) - this.getRowPriority(left));
  }

  getManagerSettlementReview(summaryId: string): ManagerSettlementReview | undefined {
    const settlement = this.getSettlement(summaryId);
    const summary = this.getMoveout(summaryId);
    if (!settlement || !summary) {
      return undefined;
    }

    const disputes = this.getDisputes(summaryId);
    const moveinEvidenceAvailable = this.hasMoveinEvidence(summaryId);
    return {
      settlement,
      gate: this.evaluateReviewGate(summary, settlement, disputes),
      disputes,
      moveinEvidenceAvailable,
    };
  }

  adjustWearVerdict(summaryId: string, dto: AdjustWearVerdictDto): ReportAuditEntry | undefined {
    const records = this.getRecords(summaryId);
    const targetIndex = records.findIndex((record) => record.id === dto.recordItemId);
    if (targetIndex === -1) {
      return undefined;
    }

    const target = records[targetIndex];
    const updatedTarget: MoveoutRecordItem = {
      ...target,
      wearVerdict: dto.toVerdict ?? target.wearVerdict,
      wearNote: dto.evidenceNote,
    };
    const updatedRecords = [...records];
    updatedRecords[targetIndex] = updatedTarget;
    this.records.set(summaryId, updatedRecords);

    const entry: ReportAuditEntry = {
      id: this.createAuditId(),
      summaryId,
      recordItemId: dto.recordItemId,
      action: dto.action,
      fromVerdict: target.wearVerdict,
      toVerdict: updatedTarget.wearVerdict,
      evidenceNote: dto.evidenceNote,
      tenantNotified: dto.notifyTenant,
      managerName: "관리자",
      at: new Date().toISOString(),
    };
    const entries = this.getReportAudit(summaryId);
    this.reportAudit.set(summaryId, [...entries, entry]);
    return entry;
  }

  getReportAudit(summaryId: string): ReportAuditEntry[] {
    return this.reportAudit.get(summaryId) ?? [];
  }

  adjustDeduction(summaryId: string, dto: AdjustDeductionDto): SettlementEstimate | undefined {
    const settlement = this.getSettlement(summaryId);
    if (!settlement) {
      return undefined;
    }

    const deductions = settlement.deductions.map((deduction) => {
      if (deduction.id !== dto.deductionId) {
        return deduction;
      }

      return {
        ...deduction,
        estimatedMin: dto.estimatedMin ?? deduction.estimatedMin,
        estimatedMax: dto.estimatedMax ?? deduction.estimatedMax,
        needsConfirmation: dto.resolveConfirmation ? false : deduction.needsConfirmation,
        evidenceNote: dto.note ?? deduction.evidenceNote,
      };
    });

    const updatedSettlement = this.recalculateSettlement({
      ...settlement,
      deductions,
      status: "reviewing",
    });
    this.settlements.set(summaryId, updatedSettlement);
    this.updateSummaryFromSettlement(summaryId, updatedSettlement);
    return updatedSettlement;
  }

  completeReview(summaryId: string): ManagerSettlementReview | undefined {
    const settlement = this.getSettlement(summaryId);
    if (!settlement) {
      return undefined;
    }

    const updatedSettlement: SettlementEstimate = {
      ...settlement,
      status: "review_done",
    };
    this.settlements.set(summaryId, updatedSettlement);
    this.updateSummaryFromSettlement(summaryId, updatedSettlement);
    return this.getManagerSettlementReview(summaryId);
  }

  respondDispute(summaryId: string, dto: RespondDisputeDto): Dispute | undefined {
    const disputes = this.getDisputes(summaryId);
    const targetIndex = disputes.findIndex((dispute) => dispute.id === dto.disputeId);
    if (targetIndex === -1) {
      return undefined;
    }

    const now = new Date().toISOString();
    const target = disputes[targetIndex];
    const updatedDispute: Dispute = {
      ...target,
      status: "answered",
      managerResponse: dto.message,
      history: [...target.history, { status: "answered", at: now, note: dto.message }],
      updatedAt: now,
    };

    const updatedDisputes = [...disputes];
    updatedDisputes[targetIndex] = updatedDispute;
    this.disputes.set(summaryId, updatedDisputes);
    return updatedDispute;
  }

  private createDisputeId(): string {
    return `dp_${Date.now().toString(36)}`;
  }

  private createAuditId(): string {
    return `ra_${Date.now().toString(36)}`;
  }

  private createManagerRow(summary: MoveoutSummary): MoveoutManagerRow {
    const disputes = this.getDisputes(summary.id);
    const openDisputeCount = disputes.filter((dispute) => dispute.status !== "resolved").length;
    const slaBreached = disputes.some((dispute) => dispute.slaBreached);
    return {
      summaryId: summary.id,
      unitId: summary.unitId,
      tenantName: this.tenantNames.get(summary.id) ?? "임차인",
      contractConfirmed: summary.contractConfirmed,
      leaseEndDate: summary.leaseEndDate,
      daysRemaining: summary.daysRemaining,
      settlementStatus: summary.settlementStatus,
      openDisputeCount,
      slaBreached,
      expiringSoon: typeof summary.daysRemaining === "number" && summary.daysRemaining <= 14,
    };
  }

  private getRowPriority(row: MoveoutManagerRow): number {
    return (row.slaBreached ? 4 : 0) + (row.openDisputeCount > 0 ? 2 : 0) + (row.expiringSoon ? 1 : 0);
  }

  private evaluateReviewGate(
    summary: MoveoutSummary,
    settlement: SettlementEstimate,
    disputes: Dispute[],
  ): ReviewCompletionGate {
    const blockingReasons: ReviewCompletionGate["blockingReasons"] = [];
    if (!summary.contractConfirmed) {
      blockingReasons.push("contract_unconfirmed");
    }
    if (disputes.some((dispute) => dispute.status !== "resolved")) {
      blockingReasons.push("unresolved_dispute");
    }
    if (settlement.deductions.some((deduction) => deduction.needsConfirmation)) {
      blockingReasons.push("needs_confirmation");
    }

    const slaBreached = disputes.some((dispute) => dispute.slaBreached);
    const canComplete = blockingReasons.length === 0;
    return {
      canComplete,
      blockingReasons,
      slaBreached,
      overrideAvailable: slaBreached,
      message: canComplete
        ? "검토 완료로 전환할 수 있어요. 검토 완료는 차감 확정이 아닌 예상안 상태입니다."
        : "차단 사유가 있어 검토 완료 전환이 제한됩니다. SLA 초과 건은 알림과 함께 강행할 수 있어요.",
    };
  }

  private hasMoveinEvidence(summaryId: string): boolean {
    return this.getRecords(summaryId).some((record) => record.moveinComparisonAvailable);
  }

  private recalculateSettlement(settlement: SettlementEstimate): SettlementEstimate {
    const totalEstimatedMin = settlement.deductions.reduce((total, deduction) => total + deduction.estimatedMin, 0);
    const totalEstimatedMax = settlement.deductions.reduce((total, deduction) => total + deduction.estimatedMax, 0);
    return {
      ...settlement,
      refundMin: settlement.depositAmount - totalEstimatedMax,
      refundMax: settlement.depositAmount - totalEstimatedMin,
    };
  }

  private updateSummaryFromSettlement(summaryId: string, settlement: SettlementEstimate): void {
    const summary = this.getMoveout(summaryId);
    if (!summary) {
      return;
    }

    this.moveouts.set(summaryId, {
      ...summary,
      estimatedRefundMin: settlement.refundMin,
      estimatedRefundMax: settlement.refundMax,
      settlementStatus: settlement.status,
      updatedAt: new Date().toISOString(),
    });
  }
}
