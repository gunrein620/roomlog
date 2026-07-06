import type {
  AdjustDeductionDto,
  AdjustWearVerdictDto,
  Dispute,
  MoveoutRecordItem,
  MoveoutSummary,
  CompleteReviewDto,
  ManagerSettlementReview,
  MoveoutDashboardSummary,
  MoveoutManagerRow,
  ReportAuditEntry,
  RespondDisputeDto,
} from "@roomlog/types";
import {
  DEMO_MOVEOUT,
  DEMO_MOVEOUT_DISPUTES,
  DEMO_MOVEOUT_ID,
  DEMO_MOVEOUT_RECORDS,
  DEMO_MOVEOUT_SETTLEMENT,
} from "./demo-moveout";
import { serverFetch } from "./server-api";

// 룸로그 API 클라이언트 (관리인 퇴실·정산 검토 M-OUT 슬라이스).
// api가 안 떠 있어도 화면이 렌더되도록 데모 데이터로 폴백한다.
export const managerMoveoutPaths = {
  dashboard: () => "/moveouts/manager/dashboard",
  rows: () => "/moveouts/manager/rows",
  moveout: (id: string) => `/moveouts/${encodeURIComponent(id)}/manager`,
  records: (id: string) => `/moveouts/${encodeURIComponent(id)}/manager-records`,
  settlement: (id: string) => `/moveouts/${encodeURIComponent(id)}/manager-settlement`,
  reportAudit: (id: string) => `/moveouts/${encodeURIComponent(id)}/report-audit`,
  adjustWearVerdict: (id: string) => `/moveouts/${encodeURIComponent(id)}/records/wear-verdict`,
  adjustDeduction: (id: string) => `/moveouts/${encodeURIComponent(id)}/deductions`,
  completeReview: (id: string) => `/moveouts/${encodeURIComponent(id)}/complete-review`,
  respondDispute: (id: string) => `/moveouts/${encodeURIComponent(id)}/disputes/respond`,
};

async function tryFetch<T>(path: string, fallback: T, label: string): Promise<T> {
  try {
    return await serverFetch<T>(path);
  } catch (error) {
    console.warn(`[moveout/manager-api] ${label} 실패 → 데모 폴백`, error);
    return fallback;
  }
}

export const DEMO_MANAGER_MOVEOUT_ROWS: MoveoutManagerRow[] = [
  {
    summaryId: DEMO_MOVEOUT_ID,
    unitId: "302",
    tenantName: "김민수",
    contractConfirmed: true,
    leaseEndDate: DEMO_MOVEOUT.leaseEndDate,
    daysRemaining: DEMO_MOVEOUT.daysRemaining,
    settlementStatus: "reviewing",
    openDisputeCount: 1,
    slaBreached: true,
    expiringSoon: true,
  },
  {
    summaryId: "mo_0002",
    unitId: "401",
    tenantName: "박민수",
    contractConfirmed: false,
    settlementStatus: "estimate",
    openDisputeCount: 0,
    slaBreached: false,
    expiringSoon: false,
  },
  {
    summaryId: "mo_0003",
    unitId: "205",
    tenantName: "이서윤",
    contractConfirmed: true,
    leaseEndDate: "2026-07-12T00:00:00+09:00",
    daysRemaining: 11,
    settlementStatus: "re_review",
    openDisputeCount: 2,
    slaBreached: true,
    expiringSoon: true,
  },
  {
    summaryId: "mo_0004",
    unitId: "508",
    tenantName: "최도현",
    contractConfirmed: true,
    leaseEndDate: "2026-08-18T00:00:00+09:00",
    daysRemaining: 47,
    settlementStatus: "review_done",
    openDisputeCount: 0,
    slaBreached: false,
    expiringSoon: false,
  },
];

export const DEMO_MANAGER_DASHBOARD: MoveoutDashboardSummary = {
  expiringSoon: DEMO_MANAGER_MOVEOUT_ROWS.filter((row) => row.expiringSoon).length,
  disputesWaiting: DEMO_MANAGER_MOVEOUT_ROWS.reduce((sum, row) => sum + row.openDisputeCount, 0),
  slaBreached: DEMO_MANAGER_MOVEOUT_ROWS.filter((row) => row.slaBreached).length,
  reviewDone: DEMO_MANAGER_MOVEOUT_ROWS.filter((row) => row.settlementStatus === "review_done").length,
};

export const DEMO_REPORT_AUDIT: ReportAuditEntry[] = [
  {
    id: "maud_0001",
    summaryId: DEMO_MOVEOUT_ID,
    recordItemId: "rec_0003",
    action: "reinforce",
    fromVerdict: "unclear",
    toVerdict: "unclear",
    evidenceNote: "입주 전 욕실 사진과 보수 완료 사진을 같은 근거로 묶었습니다.",
    tenantNotified: true,
    managerName: "박관리",
    at: "2026-07-02T09:00:00+09:00",
  },
];

const DEMO_MANAGER_DISPUTES: Dispute[] = [...DEMO_MOVEOUT_DISPUTES];

export const DEMO_MANAGER_SETTLEMENT_REVIEW: ManagerSettlementReview = {
  settlement: {
    ...DEMO_MOVEOUT_SETTLEMENT,
    status: "reviewing",
  },
  gate: {
    canComplete: false,
    blockingReasons: ["unresolved_dispute"],
    slaBreached: true,
    overrideAvailable: true,
    message: "미해소 이의가 남아 있지만 SLA가 경과해 사유를 남기고 알림과 함께 진행할 수 있습니다.",
  },
  disputes: DEMO_MANAGER_DISPUTES,
  moveinEvidenceAvailable: true,
};

export function getManagerDashboard(): Promise<MoveoutDashboardSummary> {
  return tryFetch(managerMoveoutPaths.dashboard(), DEMO_MANAGER_DASHBOARD, "관리인 퇴실 대시보드 조회");
}

export function listManagerRows(): Promise<MoveoutManagerRow[]> {
  return tryFetch(managerMoveoutPaths.rows(), DEMO_MANAGER_MOVEOUT_ROWS, "관리인 퇴실 행 조회");
}

export function getMoveout(id = DEMO_MOVEOUT_ID): Promise<MoveoutSummary> {
  return tryFetch(managerMoveoutPaths.moveout(id), DEMO_MOVEOUT, "관리인 퇴실 요약 조회");
}

export function getRecords(id = DEMO_MOVEOUT_ID): Promise<MoveoutRecordItem[]> {
  return tryFetch(managerMoveoutPaths.records(id), DEMO_MOVEOUT_RECORDS, "관리인 퇴실 기록 조회");
}

export function getManagerSettlement(id = DEMO_MOVEOUT_ID): Promise<ManagerSettlementReview> {
  return tryFetch(managerMoveoutPaths.settlement(id), DEMO_MANAGER_SETTLEMENT_REVIEW, "관리인 퇴실 정산 조회");
}

export function getReportAudit(id = DEMO_MOVEOUT_ID): Promise<ReportAuditEntry[]> {
  return tryFetch(managerMoveoutPaths.reportAudit(id), DEMO_REPORT_AUDIT, "관리인 퇴실 리포트 감사로그 조회");
}

export function adjustWearVerdict(
  id: string,
  input: AdjustWearVerdictDto,
): Promise<{ record: MoveoutRecordItem; audit: ReportAuditEntry }> {
  return serverFetch<{ record: MoveoutRecordItem; audit: ReportAuditEntry }>(
    managerMoveoutPaths.adjustWearVerdict(id),
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export function adjustDeduction(id: string, input: AdjustDeductionDto): Promise<ManagerSettlementReview["settlement"]> {
  return serverFetch<ManagerSettlementReview["settlement"]>(managerMoveoutPaths.adjustDeduction(id), {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function completeReview(id: string, input: CompleteReviewDto): Promise<ManagerSettlementReview> {
  return serverFetch<ManagerSettlementReview>(managerMoveoutPaths.completeReview(id), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function respondDispute(id: string, input: RespondDisputeDto): Promise<Dispute> {
  return serverFetch<Dispute>(managerMoveoutPaths.respondDispute(id), {
    method: "POST",
    body: JSON.stringify(input),
  });
}
