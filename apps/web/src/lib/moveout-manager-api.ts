import type {
  Dispute,
  ManagerSettlementReview,
  MoveoutDashboardSummary,
  MoveoutManagerRow,
  ReportAuditEntry,
} from "@roomlog/types";
import { DEMO_MOVEOUT, DEMO_MOVEOUT_DISPUTES, DEMO_MOVEOUT_ID, DEMO_MOVEOUT_SETTLEMENT } from "./demo-moveout";
export { getDisputes, getMoveout, getRecords } from "./moveout-api";

// 룸로그 API 클라이언트 (관리인 퇴실·정산 검토 M-OUT 슬라이스).
// api가 안 떠 있어도 화면이 렌더되도록 데모 데이터로 폴백한다.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function tryFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export const DEMO_MANAGER_MOVEOUT_ROWS: MoveoutManagerRow[] = [
  {
    summaryId: DEMO_MOVEOUT_ID,
    unitId: "302",
    tenantName: "김하린",
    contractConfirmed: true,
    leaseEndDate: DEMO_MOVEOUT.leaseEndDate,
    daysRemaining: DEMO_MOVEOUT.daysRemaining,
    settlementStatus: "reviewing",
    openDisputeCount: 1,
    slaBreached: false,
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
    id: "aud_0001",
    summaryId: DEMO_MOVEOUT_ID,
    recordItemId: "rec_0006",
    action: "reinforce",
    fromVerdict: "damage_possible",
    toVerdict: "damage_possible",
    evidenceNote: "입주전 거실 벽면 사진과 퇴실 전 사진을 함께 첨부. 공백은 책임 인정이 아님을 고지.",
    tenantNotified: true,
    managerName: "관리자 한소라",
    at: "2026-07-01T14:20:00+09:00",
  },
];

const DEMO_MANAGER_DISPUTES: Dispute[] = [
  ...DEMO_MOVEOUT_DISPUTES,
  {
    id: "dp_0002",
    summaryId: DEMO_MOVEOUT_ID,
    targetItemId: "de_0003",
    targetLabel: "벽면 못자국 원상복구",
    reason: "입주 전 사진에도 같은 자국이 있어 차감 후보에서 제외 요청합니다.",
    status: "received",
    slaDeadline: "2026-07-02T18:00:00+09:00",
    slaBreached: true,
    history: [{ status: "received", at: "2026-06-29T13:00:00+09:00" }],
    createdAt: "2026-06-29T13:00:00+09:00",
    updatedAt: "2026-06-29T13:00:00+09:00",
  },
];

export const DEMO_MANAGER_SETTLEMENT_REVIEW: ManagerSettlementReview = {
  settlement: {
    ...DEMO_MOVEOUT_SETTLEMENT,
    status: "reviewing",
  },
  gate: {
    canComplete: false,
    blockingReasons: ["unresolved_dispute", "needs_confirmation"],
    slaBreached: true,
    overrideAvailable: true,
    message: "미해소 이의와 확인 필요 항목이 남아 있습니다. SLA 초과 건은 임차인 알림과 에스컬레이션 출구를 함께 표시합니다.",
  },
  disputes: DEMO_MANAGER_DISPUTES,
  moveinEvidenceAvailable: true,
};

export function getManagerDashboard(): Promise<MoveoutDashboardSummary> {
  return tryFetch("/moveouts/manager/dashboard", DEMO_MANAGER_DASHBOARD);
}

export function listManagerRows(): Promise<MoveoutManagerRow[]> {
  return tryFetch("/moveouts/manager/rows", DEMO_MANAGER_MOVEOUT_ROWS);
}

export function getManagerSettlement(id = DEMO_MOVEOUT_ID): Promise<ManagerSettlementReview> {
  return tryFetch(`/moveouts/${encodeURIComponent(id)}/manager-settlement`, DEMO_MANAGER_SETTLEMENT_REVIEW);
}

export function getReportAudit(id = DEMO_MOVEOUT_ID): Promise<ReportAuditEntry[]> {
  return tryFetch(`/moveouts/${encodeURIComponent(id)}/report-audit`, DEMO_REPORT_AUDIT);
}
